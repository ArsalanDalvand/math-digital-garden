"""Local administrative commands. Never logs credentials or rewrites the source vault."""

import argparse
import asyncio
import json
from contextlib import asynccontextmanager
from hashlib import sha256
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from backend.app.database import get_session
from backend.app.models import CanonicalNote, ChangeProposal, User
from backend.app.rag import index_content
from backend.app.workspace import sync_approved


def visible_files(root: Path) -> list[Path]:
    return sorted(
        p
        for p in root.rglob("*")
        if p.is_file()
        and not p.is_symlink()
        and not any(part.startswith(".") for part in p.relative_to(root).parts)
        and not any(parent.is_symlink() for parent in p.parents if parent != root)
    )


def scan_vault(root: Path, prefix: str, book: str) -> list[dict[str, str]]:
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Use an existing vault directory, not a symlink")
    root = root.resolve()
    notes = []
    for path in visible_files(root):
        if path.suffix.lower() not in {".md", ".excalidraw"}:
            continue
        data = path.read_bytes()
        if len(data) > 2_000_000:
            raise ValueError("Markdown file exceeds the supported size")
        raw = data.decode("utf-8")
        relative = path.relative_to(root).as_posix()
        slug = (
            prefix + "-index"
            if relative == "index.md"
            else prefix + "-" + sha256(relative.encode()).hexdigest()[:16]
        )
        notes.append(
            {
                "slug": slug,
                "title": path.name if path.suffix.lower() == ".excalidraw" else path.stem,
                "book_slug": book,
                "chapter_slug": path.relative_to(root).parts[0] if "/" in relative else "فهرست",
                "relative_path": root.name + "/" + relative,
                "current_content": raw,
                "current_hash": sha256(data).hexdigest(),
            }
        )
    return notes


def copy_assets(root: Path) -> int:
    public = Path(__file__).resolve().parents[2] / "frontend/public"
    count = 0
    for path in visible_files(root):
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ggb"}:
            continue
        destination = public / "vault" / root.name / path.relative_to(root)
        if any(p.is_symlink() for p in [destination, *destination.parents]):
            raise ValueError("Asset destination contains a symlink")
        data = path.read_bytes()
        if path.suffix.lower() == ".ggb" and len(data) > 5_000_000:
            raise ValueError("GeoGebra file exceeds the supported size")
        if destination.exists() and destination.read_bytes() != data:
            raise ValueError("Existing asset differs; import will not overwrite it")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        count += 1
    manifest = public.parent / "src/lib/vault-assets.json"
    assets = [p.relative_to(public).as_posix() for p in visible_files(public / "vault")]
    manifest.write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return count


async def run(args: argparse.Namespace) -> None:
    async with asynccontextmanager(get_session)() as db:
        if args.command == "import-vault":
            root = Path(args.path)
            notes = scan_vault(root, args.prefix, args.book)
            added = unchanged = conflicts = 0
            for note in notes:
                existing = await db.scalar(
                    select(CanonicalNote).where(
                        CanonicalNote.relative_path == note["relative_path"]
                    )
                )
                if existing is not None:
                    if existing.current_hash == note["current_hash"]:
                        unchanged += 1
                    else:
                        conflicts += 1
                    continue
                inserted = await db.scalar(
                    insert(CanonicalNote)
                    .values(**note)
                    .on_conflict_do_nothing(index_elements=["slug"])
                    .returning(CanonicalNote.id)
                )
                added += int(inserted is not None)
                conflicts += int(inserted is None)
            count = copy_assets(root)
            await db.commit()
            print(
                json.dumps(
                    {
                        "added": added,
                        "unchanged": unchanged,
                        "conflicts": conflicts,
                        "assets": count,
                    },
                    ensure_ascii=False,
                )
            )
        elif args.command == "set-role":
            user = await db.scalar(select(User).where(User.email == args.email.lower()))
            if user is None:
                raise ValueError("Register the account before changing its role")
            user.role = args.role
            await db.commit()
            print("Role updated")
        elif args.command == "index":
            query = select(CanonicalNote).order_by(CanonicalNote.slug)
            if args.slug:
                query = query.where(CanonicalNote.slug == args.slug)
            notes_to_index = (await db.scalars(query)).all()
            for note_to_index in notes_to_index:
                total = await index_content(
                    db, note_to_index.id, note_to_index.current_content, None
                )
                print(f"{note_to_index.slug}: {total} chunks")
        elif args.command == "export":
            pending = (
                await db.scalars(
                    select(ChangeProposal)
                    .where(
                        ChangeProposal.status == "approved", ChangeProposal.sync_status != "synced"
                    )
                    .order_by(ChangeProposal.reviewed_at)
                )
            ).all()
            for p in pending:
                note_model = await db.scalar(
                    select(CanonicalNote).where(CanonicalNote.id == p.note_id)
                )
                if note_model:
                    await sync_approved(db, p, note_model)
                    print(f"{p.id}: {p.sync_status}")
                    if p.sync_status != "synced":
                        break


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    importer = sub.add_parser("import-vault")
    importer.add_argument("path")
    importer.add_argument("--prefix", default="math1")
    importer.add_argument("--book", default="ریاضی۱")
    role = sub.add_parser("set-role")
    role.add_argument("email")
    role.add_argument("role", choices=["student", "author", "admin"])
    index = sub.add_parser("index")
    index.add_argument("--slug")
    sub.add_parser("export")
    try:
        asyncio.run(run(parser.parse_args()))
    except (ValueError, OSError, HTTPException):
        parser.exit(
            1, "Operation failed; verify configuration and conflicts. Source files unchanged.\n"
        )


if __name__ == "__main__":
    main()
