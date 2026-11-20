"""Owner-scoped documents and explicit, single-page publication snapshots."""

import base64
import binascii
import os
import secrets
import tempfile
from datetime import UTC, datetime
from typing import Annotated, Literal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import Field, field_validator
from sqlalchemy import and_, insert, literal, or_, select, update

from backend.app.library_import import (
    clone_git_repo,
    extract_zip_archive,
    ingest_directory_to_library,
    validate_git_url,
)
from backend.app.library_models import (
    LibraryAttachment,
    LibraryCanonical,
    LibraryComment,
    LibraryFavorite,
    LibraryGitSource,
    LibraryItem,
    LibraryRevision,
    LibraryWatch,
)
from backend.app.models import CanonicalNote, ForkRevision, User, UserNoteFork
from backend.app.workspace import (
    DB,
    Contract,
    Me,
    Writes,
    digest,
    note_by_slug,
    owned_fork,
    persist_fork,
)


def no_store(response: Response):
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/api/library", dependencies=[Depends(no_store)])


class CreateItem(Contract):
    kind: Literal["folder", "note"]
    title: str = Field(min_length=1, max_length=255)
    parent_id: UUID | None = None
    content: str = Field(default="", max_length=2_000_000)

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str) -> str:
        if (
            not value.strip()
            or value in {".", ".."}
            or any(ord(char) < 32 for char in value)
            or any(char in value for char in "/\\")
        ):
            raise ValueError("Invalid name")
        return value


class EditItem(Contract):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: UUID | None = None
    content: str | None = Field(default=None, max_length=2_000_000)
    expected_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        return CreateItem.valid_title(value) if value is not None else None


class Expected(Contract):
    expected_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class Publication(Contract):
    visibility: Literal["private", "unlisted", "public"]


class GitImportRequest(Contract):
    repo_url: str = Field(min_length=5, max_length=1024)
    branch: str = Field(default="main", max_length=255)
    title: str | None = Field(default=None, max_length=255)
    parent_id: UUID | None = None


class ZipImportRequest(Contract):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(max_length=70_000_000)
    title: str | None = Field(default=None, max_length=255)
    parent_id: UUID | None = None



class Attachment(Contract):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(max_length=7_000_000)

    @field_validator("filename")
    @classmethod
    def valid_filename(cls, value: str) -> str:
        return CreateItem.valid_title(value)


class Comment(Contract):
    parent_id: UUID | None = None
    content: str = Field(min_length=1, max_length=10_000)


class Resolve(Contract):
    resolved: bool


class Watch(Contract):
    watching: bool


class Verification(Contract):
    verified: bool


class CanonicalMetadata(Contract):
    slugs: list[str] = Field(max_length=100)

    @field_validator("slugs")
    @classmethod
    def valid_slugs(cls, values):
        if any(not value or len(value) > 255 for value in values):
            raise ValueError("Invalid slug")
        return values


def dto(item: LibraryItem, public: bool = False) -> dict:
    result = dict(
        id=item.id,
        kind=item.kind,
        title=item.published_title if public else item.title,
        content=item.published_content if public else item.content,
        current_hash=item.published_hash if public else item.current_hash,
        verified=bool(item.published_hash and item.verified_hash == item.published_hash),
        verified_by=item.verified_by,
        verified_at=item.verified_at,
    )
    if not public:
        result.update(
            parent_id=item.parent_id,
            updated_at=item.updated_at,
            trashed_at=item.trashed_at,
            visibility=item.visibility,
            share_token=item.share_token,
            published_hash=item.published_hash,
            canonical_slug=getattr(item, "canonical_slug", None),
        )
    return result


async def owned(db, user_id, item_id, *, active=True, lock=False):
    association = await db.scalar(
        select(LibraryCanonical).where(
            LibraryCanonical.item_id == item_id, LibraryCanonical.user_id == user_id
        )
    )
    if association is not None and lock:
        # All linked writes follow the fork writer's canonical -> fork -> item order.
        await db.scalar(
            select(CanonicalNote.id)
            .where(CanonicalNote.id == association.note_id)
            .with_for_update()
        )
        await owned_fork(db, association.note_id, user_id, lock=True)
    query = select(LibraryItem).where(LibraryItem.id == item_id, LibraryItem.user_id == user_id)
    item = await db.scalar(
        query.with_for_update().execution_options(populate_existing=True) if lock else query
    )
    if item is None:
        raise HTTPException(404, "Item not found")
    if active:
        await ancestors(db, item, user_id)
    if association is not None:
        item.canonical_slug = await db.scalar(
            select(CanonicalNote.slug).where(CanonicalNote.id == association.note_id)
        )
    return item


@router.post("/canonical/metadata")
async def canonical_metadata(body: CanonicalMetadata, db: DB, user: Me):
    rows = (
        await db.execute(
            select(
                CanonicalNote.slug,
                LibraryItem.title,
                LibraryItem.trashed_at,
                LibraryCanonical.relocated,
            )
            .join(LibraryCanonical, LibraryCanonical.note_id == CanonicalNote.id)
            .join(LibraryItem, LibraryItem.id == LibraryCanonical.item_id)
            .where(
                LibraryCanonical.user_id == user.id,
                LibraryItem.user_id == user.id,
                CanonicalNote.slug.in_(body.slugs),
            )
        )
    ).all()
    return [
        dict(slug=slug, title=title, hidden=bool(trashed or relocated))
        for slug, title, trashed, relocated in rows
    ]


@router.get("/canonical/{slug}")
async def canonical_item(slug: str, db: DB, user: Me):
    note = await note_by_slug(db, slug)
    item_id = await db.scalar(
        select(LibraryCanonical.item_id).where(
            LibraryCanonical.user_id == user.id, LibraryCanonical.note_id == note.id
        )
    )
    if item_id is None:
        raise HTTPException(404, "Item not found")
    return dto(await owned(db, user.id, item_id))


@router.post("/canonical/{slug}")
async def ensure_canonical_item(slug: str, db: DB, user: Me, _: Writes):
    note = await note_by_slug(db, slug, lock=True)
    fork = await owned_fork(db, note.id, user.id, lock=True)
    association = await db.scalar(
        select(LibraryCanonical).where(
            LibraryCanonical.user_id == user.id, LibraryCanonical.note_id == note.id
        )
    )
    if association is not None:
        return dto(await owned(db, user.id, association.item_id))
    if fork is None:
        fork = UserNoteFork(
            user_id=user.id,
            note_id=note.id,
            base_hash=note.current_hash,
            base_content=note.current_content,
            custom_content=note.current_content,
            current_hash=note.current_hash,
        )
        db.add(fork)
        await db.flush()
        await persist_fork(db, fork, fork.custom_content, commit=False)
    # shortcut: personal titles use 255 characters; widen the library schema for longer titles.
    item = LibraryItem(
        user_id=user.id,
        kind="note",
        title=note.title[:255],
        content=fork.custom_content,
        current_hash=fork.current_hash,
    )
    db.add(item)
    await db.flush()
    db.add(LibraryCanonical(user_id=user.id, note_id=note.id, item_id=item.id))
    await db.execute(
        insert(LibraryRevision).from_select(
            ["id", "item_id", "user_id", "content", "content_hash", "created_at"],
            select(
                ForkRevision.id,
                literal(item.id),
                ForkRevision.user_id,
                ForkRevision.content,
                ForkRevision.content_hash,
                ForkRevision.created_at,
            ).where(ForkRevision.fork_id == fork.id, ForkRevision.user_id == user.id),
        )
    )
    await db.commit()
    item.canonical_slug = note.slug
    return dto(item)


async def ancestors(db, item, user_id, forbidden=None):
    if item is None:
        return
    if item.id == forbidden:
        raise HTTPException(409, "Folder cycle")
    if item.trashed_at is not None:
        raise HTTPException(404, "Item not found")
    if not item.parent_id:
        return
    from sqlalchemy import text
    query = text("""
        WITH RECURSIVE tree AS (
            SELECT id, parent_id, trashed_at, 1 AS depth, ARRAY[id] AS path
            FROM library_items
            WHERE id = :item_id AND user_id = :user_id
            UNION ALL
            SELECT parent.id, parent.parent_id, parent.trashed_at, tree.depth + 1, path || parent.id
            FROM library_items parent
            JOIN tree ON parent.id = tree.parent_id
            WHERE parent.user_id = :user_id AND NOT (parent.id = ANY(tree.path)) AND tree.depth < 50
        )
        SELECT id, parent_id, trashed_at FROM tree;
    """)
    res = await db.execute(query, {"item_id": item.parent_id, "user_id": user_id})
    rows = res.fetchall()
    seen = {item.id}
    for row in rows:
        if row.id in seen or row.id == forbidden:
            raise HTTPException(409, "Folder cycle")
        seen.add(row.id)
        if row.trashed_at is not None:
            raise HTTPException(404, "Item not found")


async def parent(db, user_id, parent_id, forbidden=None):
    if parent_id is not None:
        item = await owned(db, user_id, parent_id)
        if item.kind != "folder":
            raise HTTPException(422, "Parent must be a folder")
        await ancestors(db, item, user_id, forbidden)


async def accessible(db, item_id, user, token=None, *, lock=False):
    query = select(LibraryItem).where(LibraryItem.id == item_id)
    item = await db.scalar(query.with_for_update() if lock else query)
    if item is None:
        raise HTTPException(404, "Item not found")
    await ancestors(db, item, item.user_id)
    if item.user_id != user.id and not (
        item.published_hash
        and (
            item.visibility == "public"
            or (
                item.visibility == "unlisted"
                and token
                and secrets.compare_digest((item.share_token or "").encode(), token.encode())
            )
        )
    ):
        raise HTTPException(404, "Item not found")
    return item


@router.get("/items")
async def list_items(
    db: DB,
    user: Me,
    parent_id: UUID | None = None,
    trashed: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    await parent(db, user.id, parent_id)
    query = (
        select(LibraryItem, CanonicalNote.slug, LibraryGitSource.id, LibraryGitSource.repo_url)
        .outerjoin(
            LibraryCanonical,
            and_(LibraryCanonical.item_id == LibraryItem.id, LibraryCanonical.user_id == user.id),
        )
        .outerjoin(CanonicalNote, CanonicalNote.id == LibraryCanonical.note_id)
        .outerjoin(LibraryGitSource, LibraryGitSource.item_id == LibraryItem.id)
        .where(LibraryItem.user_id == user.id)
    )
    if trashed:
        query = query.where(LibraryItem.trashed_at.is_not(None))
    else:
        query = query.where(LibraryItem.parent_id == parent_id, LibraryItem.trashed_at.is_(None))
        query = query.where(or_(LibraryCanonical.item_id.is_(None), LibraryCanonical.relocated))
    rows = (
        await db.execute(
            query.order_by(LibraryItem.title, LibraryItem.id).offset(offset).limit(limit)
        )
    ).all()
    return [
        {
            **dto(item),
            "canonical_slug": slug,
            "has_git": git_id is not None,
            "git_repo_url": repo_url,
        }
        for item, slug, git_id, repo_url in rows
    ]


@router.post("/items", status_code=201)
async def create_item(body: CreateItem, db: DB, user: Me, _: Writes):
    await parent(db, user.id, body.parent_id)
    if body.kind == "folder" and body.content:
        raise HTTPException(422, "Folders cannot contain Markdown")
    item = LibraryItem(user_id=user.id, **body.model_dump(), current_hash=digest(body.content))
    db.add(item)
    await db.flush()
    if item.kind == "note":
        db.add(
            LibraryRevision(
                user_id=user.id,
                item_id=item.id,
                content=item.content,
                content_hash=item.current_hash,
            )
        )
    await db.commit()
    return dto(item)


def collect_folder_tree_and_notes(
    root_folder_id: UUID,
    items: list[LibraryItem],
    use_published: bool = False,
) -> tuple[list[dict], list[dict[str, str]], dict[UUID, str]]:
    children_map: dict[UUID, list[LibraryItem]] = {}
    for it in items:
        if it.parent_id is not None:
            children_map.setdefault(it.parent_id, []).append(it)

    flat_notes: list[dict[str, str]] = []
    path_map: dict[UUID, str] = {}

    def build_tree(pid: UUID, current_path: str = "") -> list[dict]:
        nodes = []
        for ch in sorted(children_map.get(pid, []), key=lambda x: x.title):
            node_title = (ch.published_title if use_published else None) or ch.title
            node_path = f"{current_path}/{node_title}" if current_path else node_title
            path_map[ch.id] = node_path
            node = {
                "id": str(ch.id),
                "title": node_title,
                "kind": ch.kind,
                "path": node_path,
            }
            if ch.kind == "folder":
                node["children"] = build_tree(ch.id, node_path)
            else:
                flat_notes.append({
                    "id": str(ch.id),
                    "title": node_title,
                    "path": node_path,
                })
            nodes.append(node)
        return nodes

    tree = build_tree(root_folder_id)
    return tree, flat_notes, path_map


@router.get("/items/{item_id}")
async def read_item(item_id: UUID, db: DB, user: Me, note: str | None = None):
    item = await owned(db, user.id, item_id)
    all_user_items = (
        await db.scalars(
            select(LibraryItem).where(
                LibraryItem.user_id == user.id,
                LibraryItem.trashed_at.is_(None),
            )
        )
    ).all()
    item_map = {it.id: it for it in all_user_items}

    if item.kind == "folder":
        tree, flat_notes, path_map = collect_folder_tree_and_notes(
            item.id, all_user_items, use_published=False
        )
        git_source = await db.scalar(
            select(LibraryGitSource).where(
                LibraryGitSource.item_id == item.id,
                LibraryGitSource.user_id == user.id,
            )
        )
        descendants = [it for it in all_user_items if it.id in path_map]
        descendant_ids = set(path_map.keys())

        target_note: LibraryItem | None = None
        if note:
            try:
                target_uuid = UUID(note)
                if target_uuid in descendant_ids:
                    target_note = item_map.get(target_uuid)
            except (ValueError, TypeError):
                pass

        if target_note is None or target_note.kind != "note":
            notes = [it for it in descendants if it.kind == "note"]
            target_note = next(
                (n for n in notes if n.title.lower() in ("readme", "راهنما", "index")),
                notes[0] if notes else None,
            )

        res = dto(item)
        res["tree"] = tree
        res["notes"] = flat_notes
        res["has_git"] = bool(git_source)
        res["git_repo_url"] = git_source.repo_url if git_source else None
        res["root_folder_id"] = str(item.id)
        res["root_folder_title"] = item.title

        if target_note:
            res["active_note_id"] = str(target_note.id)
            res["active_note_title"] = target_note.title
            res["active_note_path"] = path_map.get(target_note.id, "")
            res["content"] = target_note.content
            res["current_hash"] = target_note.current_hash
            res["title"] = target_note.title
        else:
            res["active_note_id"] = None
            res["active_note_title"] = None
            res["active_note_path"] = ""
        return res

    # item.kind == "note"
    res = dto(item)
    curr_pid = item.parent_id
    root_folder: LibraryItem | None = None
    while curr_pid:
        p = item_map.get(curr_pid)
        if not p:
            break
        root_folder = p
        curr_pid = p.parent_id

    if root_folder:
        tree, flat_notes, path_map = collect_folder_tree_and_notes(
            root_folder.id, all_user_items, use_published=False
        )
        git_source = await db.scalar(
            select(LibraryGitSource).where(
                LibraryGitSource.item_id == root_folder.id,
                LibraryGitSource.user_id == user.id,
            )
        )
        res["notes"] = flat_notes
        res["path"] = path_map.get(item.id, item.title)
        res["root_folder_id"] = str(root_folder.id)
        res["root_folder_title"] = root_folder.title
        res["has_git"] = bool(git_source)
        res["git_repo_url"] = git_source.repo_url if git_source else None
    else:
        res["notes"] = []
        res["path"] = item.title
        res["root_folder_id"] = None
        res["root_folder_title"] = None
        res["has_git"] = False
        res["git_repo_url"] = None

    return res


async def save_content(db, user, item, content, expected_hash):
    if item.kind != "note":
        raise HTTPException(422, "Not a note")
    association = await db.scalar(
        select(LibraryCanonical).where(
            LibraryCanonical.item_id == item.id, LibraryCanonical.user_id == user.id
        )
    )
    if association is not None:
        fork = await owned_fork(db, association.note_id, user.id, lock=True)
        if fork is None or fork.current_hash != expected_hash:
            raise HTTPException(409, "Note changed; reload before saving")
        await persist_fork(db, fork, content, commit=False)
        return
    changed = await db.execute(
        update(LibraryItem)
        .where(
            LibraryItem.id == item.id,
            LibraryItem.user_id == user.id,
            LibraryItem.current_hash == expected_hash,
        )
        .values(content=content, current_hash=digest(content), updated_at=datetime.now(UTC))
    )
    if changed.rowcount != 1:
        raise HTTPException(409, "Note changed; reload before saving")
    item.verified_hash = None
    item.verified_by = None
    item.verified_at = None
    db.add(
        LibraryRevision(
            user_id=user.id, item_id=item.id, content=content, content_hash=digest(content)
        )
    )


@router.patch("/items/{item_id}")
async def edit_item(item_id: UUID, body: EditItem, db: DB, user: Me, _: Writes):
    if "parent_id" in body.model_fields_set:
        # Serialize tree moves per owner so concurrent moves cannot create a cycle.
        await db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    item = await owned(db, user.id, item_id, lock=True)
    if body.content is not None:
        await save_content(db, user, item, body.content, body.expected_hash)
    if "title" in body.model_fields_set:
        if body.title is None:
            raise HTTPException(422, "Name required")
        item.title = body.title
    if "parent_id" in body.model_fields_set:
        await parent(db, user.id, body.parent_id, item.id)
        item.parent_id = body.parent_id
        await db.execute(
            update(LibraryCanonical)
            .where(LibraryCanonical.item_id == item.id, LibraryCanonical.user_id == user.id)
            .values(relocated=True)
        )
    item.updated_at = datetime.now(UTC)
    item.verified_hash = None
    item.verified_by = None
    item.verified_at = None
    await db.commit()
    await db.refresh(item)
    return dto(item)


@router.post("/items/{item_id}/trash")
async def trash_item(item_id: UUID, db: DB, user: Me, _: Writes, subtree: bool = False):
    item = await owned(db, user.id, item_id, lock=True)
    if (
        item.kind == "folder"
        and not subtree
        and await db.scalar(
            select(LibraryItem.id)
            .where(LibraryItem.parent_id == item.id, LibraryItem.user_id == user.id)
            .limit(1)
        )
    ):
        raise HTTPException(409, "Folder has children; confirm subtree=true")
    item.trashed_at = datetime.now(UTC)
    await db.commit()
    return dto(item)


@router.post("/items/{item_id}/restore")
async def restore_item(item_id: UUID, db: DB, user: Me, _: Writes):
    item = await owned(db, user.id, item_id, active=False)
    await parent(db, user.id, item.parent_id)
    item.trashed_at = None
    await db.commit()
    return dto(item)


@router.get("/items/{item_id}/history")
async def history(
    item_id: UUID,
    db: DB,
    user: Me,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    await owned(db, user.id, item_id)
    rows = (
        await db.scalars(
            select(LibraryRevision)
            .where(LibraryRevision.item_id == item_id, LibraryRevision.user_id == user.id)
            .order_by(LibraryRevision.created_at.desc(), LibraryRevision.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [
        dict(id=r.id, content=r.content, content_hash=r.content_hash, created_at=r.created_at)
        for r in rows
    ]


@router.post("/items/{item_id}/history/{revision_id}/restore")
async def restore_revision(
    item_id: UUID, revision_id: UUID, body: Expected, db: DB, user: Me, _: Writes
):
    item = await owned(db, user.id, item_id, lock=True)
    revision = await db.scalar(
        select(LibraryRevision).where(
            LibraryRevision.id == revision_id,
            LibraryRevision.item_id == item_id,
            LibraryRevision.user_id == user.id,
        )
    )
    if revision is None:
        raise HTTPException(404, "Revision not found")
    await save_content(db, user, item, revision.content, body.expected_hash)
    await db.commit()
    await db.refresh(item)
    return dto(item)


@router.put("/items/{item_id}/publication")
async def publish(item_id: UUID, body: Publication, db: DB, user: Me, _: Writes):
    item = await owned(db, user.id, item_id, lock=True)
    item.verified_hash = None
    item.verified_by = None
    item.verified_at = None

    if item.kind == "note":
        await db.execute(
            update(LibraryAttachment)
            .where(LibraryAttachment.item_id == item.id, LibraryAttachment.user_id == user.id)
            .values(published=body.visibility != "private")
        )
        item.visibility = body.visibility
        item.share_token = secrets.token_urlsafe(32) if body.visibility == "unlisted" else None
        item.published_title = item.title if body.visibility != "private" else None
        item.published_content = item.content if body.visibility != "private" else None
        item.published_hash = item.current_hash if body.visibility != "private" else None
    elif item.kind == "folder":
        item.visibility = body.visibility
        item.share_token = secrets.token_urlsafe(32) if body.visibility == "unlisted" else None
        item.published_title = item.title if body.visibility != "private" else None
        item.published_content = None
        item.published_hash = "folder" if body.visibility != "private" else None

        all_items = (
            await db.scalars(
                select(LibraryItem).where(
                    LibraryItem.user_id == user.id, LibraryItem.trashed_at.is_(None)
                )
            )
        ).all()
        frontier = [item.id]
        while frontier:
            next_frontier = []
            for desc in all_items:
                if desc.parent_id in frontier:
                    desc.visibility = body.visibility
                    desc.published_title = desc.title if body.visibility != "private" else None
                    if desc.kind == "note":
                        desc.published_content = (
                            desc.content if body.visibility != "private" else None
                        )
                        desc.published_hash = (
                            desc.current_hash if body.visibility != "private" else None
                        )
                        await db.execute(
                            update(LibraryAttachment)
                            .where(
                                LibraryAttachment.item_id == desc.id,
                                LibraryAttachment.user_id == user.id,
                            )
                            .values(published=body.visibility != "private")
                        )
                    else:
                        desc.published_content = None
                        desc.published_hash = (
                            "folder" if body.visibility != "private" else None
                        )
                    next_frontier.append(desc.id)
            frontier = next_frontier

    await db.commit()
    return dto(item)


async def public_item(db, *, item_id=None, token=None, note_id=None):
    query = select(LibraryItem).where(LibraryItem.published_hash.is_not(None))
    query = (
        query.where(LibraryItem.share_token == token, LibraryItem.visibility == "unlisted")
        if token
        else query.where(LibraryItem.id == item_id, LibraryItem.visibility == "public")
    )
    item = await db.scalar(query)
    if item is None:
        raise HTTPException(404, "Page not found")

    if item.kind == "note":
        await ancestors(db, item, item.user_id)
        return dto(item, public=True)

    all_user_items = (
        await db.scalars(
            select(LibraryItem).where(
                LibraryItem.user_id == item.user_id,
                LibraryItem.trashed_at.is_(None),
                LibraryItem.published_hash.is_not(None),
            )
        )
    ).all()

    tree, flat_notes, path_map = collect_folder_tree_and_notes(
        item.id, all_user_items, use_published=True
    )
    descendants = [it for it in all_user_items if it.id in path_map]
    descendant_ids = set(path_map.keys())

    target_note: LibraryItem | None = None
    if note_id:
        try:
            target_uuid = UUID(note_id) if isinstance(note_id, str) else note_id
            if target_uuid in descendant_ids:
                target_note = next(
                    (it for it in all_user_items if it.id == target_uuid and it.kind == "note"),
                    None,
                )
        except (ValueError, TypeError):
            pass

    if target_note is None:
        notes = [it for it in descendants if it.kind == "note"]
        target_note = next(
            (n for n in notes if n.title.lower() in ("readme", "راهنما", "index")),
            notes[0] if notes else None,
        )

    res = dto(item, public=True)
    res["tree"] = tree
    res["notes"] = flat_notes
    res["folder_title"] = item.published_title or item.title
    if target_note:
        res["active_note_id"] = str(target_note.id)
        res["active_note_title"] = target_note.published_title or target_note.title
        res["active_note_path"] = path_map.get(target_note.id, "")
        note_t = target_note.published_title or target_note.title
        folder_t = item.published_title or item.title
        res["title"] = f"{note_t} — {folder_t}"
        res["content"] = target_note.published_content or ""
        res["current_hash"] = target_note.published_hash or ""
        res["verified"] = bool(
            target_note.published_hash and target_note.verified_hash == target_note.published_hash
        )
    else:
        res["active_note_id"] = None
        res["active_note_title"] = None
        res["content"] = "این پوشه هنوز یادداشت منتشرشده‌ای ندارد."

    return res


@router.get("/public/{item_id}")
async def public_page(item_id: UUID, db: DB, note: str | None = None):
    return await public_item(db, item_id=item_id, note_id=note)


@router.get("/shared/{token}")
async def shared_page(token: str, db: DB, note: str | None = None):
    return await public_item(db, token=token, note_id=note)


@router.get("/shared/{token}/notes/{note_id}")
async def shared_note(token: str, note_id: UUID, db: DB):
    return await public_item(db, token=token, note_id=str(note_id))


@router.get("/public/{item_id}/notes/{note_id}")
async def public_note(item_id: UUID, note_id: UUID, db: DB):
    return await public_item(db, item_id=item_id, note_id=str(note_id))


@router.post("/import/git", status_code=201)
async def import_git(body: GitImportRequest, db: DB, user: Me, _: Writes):
    validate_git_url(body.repo_url)

    title = body.title
    if not title:
        raw_name = body.repo_url.rstrip("/").split("/")[-1]
        if raw_name.endswith(".git"):
            raw_name = raw_name[:-4]
        title = raw_name or "مستندات گیت"

    if body.parent_id:
        parent_item = await owned(db, user.id, body.parent_id)
        if parent_item.kind != "folder":
            raise HTTPException(422, "Parent must be a folder")

    root_folder = LibraryItem(
        user_id=user.id,
        parent_id=body.parent_id,
        kind="folder",
        title=title,
        content="",
        current_hash=digest(""),
    )
    db.add(root_folder)
    await db.flush()

    with tempfile.TemporaryDirectory() as tmp_dir:
        clone_dir = os.path.join(tmp_dir, "repo")
        commit_sha = clone_git_repo(body.repo_url, body.branch, clone_dir)
        stats = await ingest_directory_to_library(
            db, user.id, clone_dir, root_folder, is_sync=False
        )

    git_source = LibraryGitSource(
        item_id=root_folder.id,
        user_id=user.id,
        repo_url=body.repo_url,
        branch=body.branch,
        last_synced_hash=commit_sha,
        last_synced_at=datetime.now(UTC),
        sync_status="synced",
    )
    db.add(git_source)
    await db.commit()
    await db.refresh(root_folder)

    res = dto(root_folder)
    res["stats"] = stats
    res["has_git"] = True
    res["git_repo_url"] = git_source.repo_url
    return res


@router.post("/import/zip", status_code=201)
async def import_zip(body: ZipImportRequest, db: DB, user: Me, _: Writes):
    try:
        zip_bytes = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "داده‌های فایل زیپ نامعتبر است.") from None

    title = body.title
    if not title:
        title = os.path.splitext(body.filename)[0].strip() or "مستندات زیپ"

    if body.parent_id:
        parent_item = await owned(db, user.id, body.parent_id)
        if parent_item.kind != "folder":
            raise HTTPException(422, "Parent must be a folder")

    root_folder = LibraryItem(
        user_id=user.id,
        parent_id=body.parent_id,
        kind="folder",
        title=title,
        content="",
        current_hash=digest(""),
    )
    db.add(root_folder)
    await db.flush()

    with tempfile.TemporaryDirectory() as tmp_dir:
        extract_zip_archive(zip_bytes, tmp_dir)
        stats = await ingest_directory_to_library(
            db, user.id, tmp_dir, root_folder, is_sync=False
        )

    await db.commit()
    await db.refresh(root_folder)

    res = dto(root_folder)
    res["stats"] = stats
    return res


@router.post("/items/{item_id}/git-sync")
async def git_sync(item_id: UUID, db: DB, user: Me, _: Writes):
    root_folder = await owned(db, user.id, item_id, lock=True)
    if root_folder.kind != "folder":
        raise HTTPException(422, "تنها پوشه‌های متصل به گیت امکان بروزرسانی دارند.")

    git_source = await db.scalar(
        select(LibraryGitSource).where(
            LibraryGitSource.item_id == item_id, LibraryGitSource.user_id == user.id
        )
    )
    if git_source is None:
        raise HTTPException(404, "منبع گیت برای این پوشه یافت نشد.")

    validate_git_url(git_source.repo_url)

    git_source.sync_status = "syncing"
    await db.commit()

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            clone_dir = os.path.join(tmp_dir, "repo")
            commit_sha = clone_git_repo(git_source.repo_url, git_source.branch, clone_dir)
            stats = await ingest_directory_to_library(
                db, user.id, clone_dir, root_folder, is_sync=True
            )

        git_source.last_synced_hash = commit_sha
        git_source.last_synced_at = datetime.now(UTC)
        git_source.sync_status = "synced"
        git_source.error_message = None

        if root_folder.published_hash or root_folder.visibility != "private":
            all_items = (
                await db.scalars(
                    select(LibraryItem).where(
                        LibraryItem.user_id == user.id, LibraryItem.trashed_at.is_(None)
                    )
                )
            ).all()
            frontier = [root_folder.id]
            while frontier:
                next_frontier = []
                for it in all_items:
                    if it.parent_id in frontier:
                        it.visibility = root_folder.visibility
                        if it.kind == "note":
                            it.published_title = it.title
                            it.published_content = it.content
                            it.published_hash = it.current_hash
                        else:
                            it.published_title = it.title
                            it.published_hash = "folder"
                        next_frontier.append(it.id)
                frontier = next_frontier

        msg = (
            f"بروزرسانی با موفقیت انجام شد "
            f"({stats['added']} جدید، {stats['updated']} ویرایش، {stats['deleted']} حذف)."
        )
        await db.commit()
        return {
            "status": "success",
            "commit_sha": commit_sha,
            "stats": stats,
            "message": msg,
        }
    except Exception as exc:
        git_source.sync_status = "error"
        git_source.error_message = str(exc)
        await db.commit()
        raise HTTPException(500, f"خطا در بروزرسانی مخزن: {exc}") from exc


@router.get("/items/{item_id}/git-source")
async def get_git_source(item_id: UUID, db: DB, user: Me):
    git_source = await db.scalar(
        select(LibraryGitSource).where(
            LibraryGitSource.item_id == item_id, LibraryGitSource.user_id == user.id
        )
    )
    if git_source is None:
        return {"has_git": False}
    return {
        "has_git": True,
        "repo_url": git_source.repo_url,
        "branch": git_source.branch,
        "last_synced_hash": git_source.last_synced_hash,
        "last_synced_at": (
            git_source.last_synced_at.isoformat() if git_source.last_synced_at else None
        ),
        "sync_status": git_source.sync_status,
        "error_message": git_source.error_message,
    }


@router.post("/items/{item_id}/attachments", status_code=201)
async def upload(item_id: UUID, body: Attachment, db: DB, user: Me, _: Writes):
    item = await owned(db, user.id, item_id, lock=True)
    if item.kind != "note":
        raise HTTPException(422, "Not a note")
    try:
        data = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "Invalid base64") from None
    if not data or len(data) > 5_000_000:
        raise HTTPException(413, "Attachment must be between 1 byte and 5 MB")
    attachment = LibraryAttachment(
        item_id=item_id, user_id=user.id, filename=body.filename, data=data
    )
    db.add(attachment)
    await db.commit()
    return dict(id=attachment.id, filename=attachment.filename, size=len(data))


@router.get("/items/{item_id}/attachments")
async def attachments(
    item_id: UUID,
    db: DB,
    user: Me,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    await owned(db, user.id, item_id)
    rows = (
        await db.scalars(
            select(LibraryAttachment)
            .where(LibraryAttachment.item_id == item_id, LibraryAttachment.user_id == user.id)
            .order_by(LibraryAttachment.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [dict(id=a.id, filename=a.filename, size=len(a.data)) for a in rows]


@router.get("/attachments/{attachment_id}")
async def download(attachment_id: UUID, db: DB, user: Me):
    attachment = await db.scalar(
        select(LibraryAttachment).where(
            LibraryAttachment.id == attachment_id, LibraryAttachment.user_id == user.id
        )
    )
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    await owned(db, user.id, attachment.item_id)
    return Response(
        attachment.data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(attachment.filename, safe=""),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


async def comment_target(request: Request, db: DB, user: Me, token: str | None = None):
    slug = request.path_params.get("slug")
    if slug is not None:
        note = await note_by_slug(db, slug)
        return dict(note_id=note.id), True, user.role in {"author", "admin"}
    try:
        item_id = UUID(request.path_params["item_id"])
    except ValueError:
        raise HTTPException(422, "Invalid item ID") from None
    item = await accessible(db, item_id, user, token)
    return (
        dict(item_id=item_id),
        bool(item.published_hash),
        item.user_id == user.id or user.role == "admin",
    )


CommentTarget = Annotated[tuple, Depends(comment_target)]


@router.get("/canonical/{slug}/comments")
@router.get("/items/{item_id}/comments")
async def comments(
    target: CommentTarget,
    db: DB,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    rows = (
        await db.scalars(
            select(LibraryComment)
            .filter_by(**target[0])
            .order_by(LibraryComment.created_at, LibraryComment.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [
        dict(
            id=c.id,
            content=c.content,
            user_id=c.user_id,
            created_at=c.created_at,
            parent_id=c.parent_id,
            resolved=c.resolved,
        )
        for c in rows
    ]


@router.post("/canonical/{slug}/comments", status_code=201)
@router.post("/items/{item_id}/comments", status_code=201)
async def comment(target: CommentTarget, body: Comment, db: DB, user: Me, _: Writes):
    if not target[1]:
        raise HTTPException(409, "Publish or share before commenting")
    if body.parent_id:
        thread = await db.scalar(
            select(LibraryComment).filter_by(**target[0]).where(LibraryComment.id == body.parent_id)
        )
        if thread is None or thread.parent_id:
            raise HTTPException(422, "Reply must reference a page-level thread")
    entry = LibraryComment(
        **target[0], user_id=user.id, content=body.content, parent_id=body.parent_id
    )
    db.add(entry)
    await db.commit()
    return dict(
        id=entry.id,
        content=entry.content,
        user_id=entry.user_id,
        created_at=entry.created_at,
        parent_id=entry.parent_id,
        resolved=entry.resolved,
    )


def watch_hash(item, user):
    title = item.title if item.user_id == user.id else item.published_title
    content_hash = item.current_hash if item.user_id == user.id else item.published_hash
    return digest((title or "") + "\0" + (content_hash or ""))


@router.get("/items/{item_id}/watch")
async def watching(item_id: UUID, db: DB, user: Me, token: str | None = None):
    item = await accessible(db, item_id, user, token)
    watch = await db.get(LibraryWatch, (item_id, user.id))
    visible_hash = watch_hash(item, user)
    return dict(watching=watch is not None, updated=bool(watch and watch.seen_hash != visible_hash))


@router.put("/items/{item_id}/watch")
async def watch(item_id: UUID, body: Watch, db: DB, user: Me, _: Writes, token: str | None = None):
    item = await accessible(db, item_id, user, token)
    entry = await db.get(LibraryWatch, (item_id, user.id))
    if body.watching:
        if entry is None:
            entry = LibraryWatch(item_id=item_id, user_id=user.id)
            db.add(entry)
        entry.seen_hash = watch_hash(item, user)
        entry.access_token = token if item.user_id != user.id else None
    elif entry:
        await db.delete(entry)
    await db.commit()
    return dict(watching=body.watching, updated=False)


async def subscriptions(db, user, model, offset, limit):
    hidden = select(LibraryItem.id).where(LibraryItem.trashed_at.is_not(None)).cte(recursive=True)
    hidden = hidden.union_all(
        select(LibraryItem.id).join(hidden, LibraryItem.parent_id == hidden.c.id)
    )
    return (
        await db.execute(
            select(LibraryItem, model)
            .join(model, model.item_id == LibraryItem.id)
            .where(
                model.user_id == user.id,
                LibraryItem.id.not_in(select(hidden.c.id)),
                or_(
                    LibraryItem.user_id == user.id,
                    and_(
                        LibraryItem.published_hash.is_not(None),
                        or_(
                            LibraryItem.visibility == "public",
                            and_(
                                LibraryItem.visibility == "unlisted",
                                model.access_token == LibraryItem.share_token,
                            ),
                        ),
                    ),
                ),
            )
            .order_by(LibraryItem.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()


def subscription_link(item, user, entry):
    if item.user_id == user.id:
        return "/library/" + str(item.id)
    return (
        "/shared/" + entry.access_token
        if item.visibility == "unlisted"
        else "/published/" + str(item.id)
    )


@router.get("/watching")
async def watch_list(
    db: DB, user: Me, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100)
):
    rows = await subscriptions(db, user, LibraryWatch, offset, limit)
    return [
        dict(
            id=item.id,
            title=item.title if item.user_id == user.id else item.published_title,
            updated=entry.seen_hash != watch_hash(item, user),
            href=subscription_link(item, user, entry),
        )
        for item, entry in rows
    ]


@router.put("/items/{item_id}/verification")
async def verify(item_id: UUID, body: Verification, db: DB, user: Me, _: Writes):
    if user.role != "admin":
        raise HTTPException(403, "Admin role required")
    item = await accessible(db, item_id, user, lock=True)
    if not item.published_hash:
        raise HTTPException(409, "Published snapshot required")
    item.verified_hash = item.published_hash if body.verified else None
    item.verified_by = user.id if body.verified else None
    item.verified_at = datetime.now(UTC) if body.verified else None
    await db.commit()
    return dict(verified=body.verified)


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(attachment_id: UUID, db: DB, user: Me, _: Writes):
    attachment = await db.scalar(
        select(LibraryAttachment).where(
            LibraryAttachment.id == attachment_id, LibraryAttachment.user_id == user.id
        )
    )
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    await owned(db, user.id, attachment.item_id)
    await db.delete(attachment)
    await db.commit()
    return Response(status_code=204)


@router.get("/public")
async def publications(db: DB, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100)):
    hidden = select(LibraryItem.id).where(LibraryItem.trashed_at.is_not(None)).cte(recursive=True)
    hidden = hidden.union_all(
        select(LibraryItem.id).join(hidden, LibraryItem.parent_id == hidden.c.id)
    )
    rows = (
        await db.scalars(
            select(LibraryItem)
            .where(
                LibraryItem.visibility == "public",
                LibraryItem.published_hash.is_not(None),
                LibraryItem.id.not_in(select(hidden.c.id)),
            )
            .order_by(LibraryItem.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [dto(item, public=True) for item in rows]


@router.get("/public/{item_id}/attachments")
async def published_attachments(
    item_id: UUID,
    db: DB,
    token: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    page = await public_item(db, token=token) if token else await public_item(db, item_id=item_id)
    if page["id"] != item_id:
        raise HTTPException(404, "Page not found")
    rows = (
        await db.scalars(
            select(LibraryAttachment)
            .where(LibraryAttachment.item_id == item_id, LibraryAttachment.published.is_(True))
            .order_by(LibraryAttachment.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [dict(id=a.id, filename=a.filename, size=len(a.data)) for a in rows]


@router.get("/public/{item_id}/attachments/{attachment_id}")
async def published_download(item_id: UUID, attachment_id: UUID, db: DB, token: str | None = None):
    page = await public_item(db, token=token) if token else await public_item(db, item_id=item_id)
    if page["id"] != item_id:
        raise HTTPException(404, "Page not found")
    attachment = await db.scalar(
        select(LibraryAttachment).where(
            LibraryAttachment.id == attachment_id,
            LibraryAttachment.item_id == item_id,
            LibraryAttachment.published.is_(True),
        )
    )
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    return Response(
        attachment.data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(attachment.filename, safe=""),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )


@router.patch("/canonical/{slug}/comments/{comment_id}")
@router.patch("/items/{item_id}/comments/{comment_id}")
async def edit_comment(
    target: CommentTarget,
    comment_id: UUID,
    body: Comment,
    db: DB,
    user: Me,
    _: Writes,
):
    entry = await db.scalar(
        select(LibraryComment)
        .filter_by(**target[0])
        .where(
            LibraryComment.id == comment_id,
            LibraryComment.user_id == user.id,
        )
    )
    if entry is None:
        raise HTTPException(404, "Comment not found")
    entry.content = body.content
    await db.commit()
    return dict(id=entry.id, content=entry.content)


@router.delete("/canonical/{slug}/comments/{comment_id}", status_code=204)
@router.delete("/items/{item_id}/comments/{comment_id}", status_code=204)
async def delete_comment(target: CommentTarget, comment_id: UUID, db: DB, user: Me, _: Writes):
    entry = await db.scalar(
        select(LibraryComment)
        .filter_by(**target[0])
        .where(
            LibraryComment.id == comment_id,
            LibraryComment.user_id == user.id,
        )
    )
    if entry is None:
        raise HTTPException(404, "Comment not found")
    # Preserve replies when their author deletes the parent comment.
    entry.content = "[deleted]"
    await db.commit()
    return Response(status_code=204)


@router.put("/canonical/{slug}/comments/{comment_id}/resolve")
@router.put("/items/{item_id}/comments/{comment_id}/resolve")
async def resolve_comment(
    target: CommentTarget,
    comment_id: UUID,
    body: Resolve,
    db: DB,
    user: Me,
    _: Writes,
):
    if not target[2]:
        raise HTTPException(403, "Owner or admin required")
    entry = await db.scalar(
        select(LibraryComment)
        .filter_by(**target[0])
        .where(
            LibraryComment.id == comment_id,
            LibraryComment.parent_id.is_(None),
        )
    )
    if entry is None:
        raise HTTPException(404, "Thread not found")
    entry.resolved = body.resolved
    await db.commit()
    return dict(resolved=entry.resolved)


class Favorite(Contract):
    favorite: bool


@router.get("/items/{item_id}/favorite")
async def favorite_status(item_id: UUID, db: DB, user: Me, token: str | None = None):
    await accessible(db, item_id, user, token)
    return dict(favorite=await db.get(LibraryFavorite, (item_id, user.id)) is not None)


@router.put("/items/{item_id}/favorite")
async def favorite(
    item_id: UUID, body: Favorite, db: DB, user: Me, _: Writes, token: str | None = None
):
    item = await accessible(db, item_id, user, token)
    entry = await db.get(LibraryFavorite, (item_id, user.id))
    if body.favorite:
        if entry is None:
            entry = LibraryFavorite(item_id=item_id, user_id=user.id)
            db.add(entry)
        entry.access_token = token if item.user_id != user.id else None
    elif entry is not None:
        await db.delete(entry)
    await db.commit()
    return dict(favorite=body.favorite)


@router.get("/favorites")
async def favorites(
    db: DB, user: Me, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100)
):
    rows = await subscriptions(db, user, LibraryFavorite, offset, limit)
    return [
        dict(
            id=item.id,
            title=item.title if item.user_id == user.id else item.published_title,
            href=subscription_link(item, user, entry),
            favorite=True,
        )
        for item, entry in rows
    ]
