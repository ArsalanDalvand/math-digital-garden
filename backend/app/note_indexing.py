"""Populate flexible PostgreSQL frontmatter JSONB, tsvector, and note_edges."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.knowledge_schema import (
    extract_frontmatter,
    extract_note_edges,
    normalize_lookup_key,
)
from backend.app.models import CanonicalNote, NoteEdge


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(v).strip() for v in value if isinstance(v, (str, int, float)) and str(v).strip()]


def build_note_lookup(notes: Iterable[Any]) -> Callable[[str], str | None]:
    """Build deterministic target-name resolver matching frontend wikilink resolution."""
    exact: dict[str, str] = {}
    ambiguous: set[str] = set()

    def register(candidate: str, slug: str, *, allow_override: bool = False) -> None:
        key = normalize_lookup_key(candidate)
        if not key:
            return
        if allow_override:
            exact[key] = slug
            ambiguous.discard(key)
            return
        if key in exact and exact[key] != slug:
            ambiguous.add(key)
        else:
            exact[key] = slug

    note_list = list(notes)
    # First register non-ambiguous secondary keys (titles, stems, relative paths, aliases)
    for note in note_list:
        slug = note.slug
        fm = getattr(note, "frontmatter", None) or {}
        if not fm and getattr(note, "current_content", None):
            fm, _ = extract_frontmatter(note.current_content)
        title = getattr(note, "title", "") or ""
        rel_path = getattr(note, "relative_path", "") or ""
        if title:
            register(title, slug)
        if rel_path:
            no_ext = rel_path[:-3] if rel_path.endswith(".md") else rel_path
            parts = no_ext.split("/")
            if len(parts) > 1:
                register("/".join(parts[1:]), slug)
            register(no_ext, slug)
            stem = parts[-1]
            if stem:
                register(stem, slug)
        for alias in _str_list(fm.get("aliases")):
            register(alias, slug)
        title_fa = fm.get("title_fa")
        if isinstance(title_fa, str) and title_fa:
            register(title_fa, slug)
        title_en = fm.get("title_en")
        if isinstance(title_en, str) and title_en:
            register(title_en, slug)

    # Exact slugs and UIDs always win cleanly
    for note in note_list:
        slug = note.slug
        register(slug, slug, allow_override=True)
        register(f"notes/{slug}", slug, allow_override=True)
        fm = getattr(note, "frontmatter", None) or {}
        if not fm and getattr(note, "current_content", None):
            fm, _ = extract_frontmatter(note.current_content)
        uid = fm.get("uid")
        if isinstance(uid, str) and uid:
            register(uid, slug, allow_override=True)

    def resolve(target: str) -> str | None:
        clean = target.strip()
        if clean.startswith("/"):
            clean = clean[1:]
        key = normalize_lookup_key(clean)
        if not key or key in ambiguous:
            return None
        return exact.get(key)

    return resolve


def build_search_text(
    note_title: str, book_slug: str, chapter_slug: str, fm: dict[str, Any], body: str
) -> str:
    tokens = [
        note_title,
        book_slug,
        chapter_slug,
        str(fm.get("title_fa") or ""),
        str(fm.get("title_en") or ""),
        str(fm.get("slogan_fa") or ""),
        " ".join(_str_list(fm.get("tags"))),
        " ".join(_str_list(fm.get("aliases"))),
        body,
    ]
    return "\n".join(part for part in tokens if part)


async def sync_note_index(
    db: AsyncSession,
    note: CanonicalNote,
    resolve_slug: Callable[[str], str | None],
    slug_to_id: dict[str, UUID],
) -> int:
    """Update a note's JSONB frontmatter, tsvector, and outgoing note_edges rows."""
    fm, body = extract_frontmatter(note.current_content)
    note.frontmatter = fm
    search_text = build_search_text(note.title, note.book_slug, note.chapter_slug, fm, body)

    try:
        dialect_name = db.get_bind().dialect.name
    except Exception:
        dialect_name = "postgresql"

    update_values: dict[str, Any] = {"frontmatter": fm}
    if dialect_name == "postgresql":
        update_values["search_vector"] = func.to_tsvector("simple", search_text)

    await db.execute(
        update(CanonicalNote)
        .where(CanonicalNote.id == note.id)
        .values(**update_values)
    )

    await db.execute(delete(NoteEdge).where(NoteEdge.source_note_id == note.id))

    edge_triples = extract_note_edges(
        note.current_content,
        fm,
        resolve_slug=resolve_slug,
        current_slug=note.slug,
    )
    rows_to_insert: list[dict[str, Any]] = []
    seen_edges: set[tuple[UUID, str, str]] = set()
    for target_slug, rel_type, edge_source in edge_triples:
        target_id = slug_to_id.get(target_slug)
        if target_id is None or target_id == note.id:
            continue
        key = (target_id, rel_type, edge_source)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        rows_to_insert.append(
            {
                "source_note_id": note.id,
                "target_note_id": target_id,
                "relation_type": rel_type,
                "edge_source": edge_source,
            }
        )

    if rows_to_insert:
        if dialect_name == "postgresql":
            await db.execute(
                pg_insert(NoteEdge)
                .values(rows_to_insert)
                .on_conflict_do_nothing(constraint="uq_note_edges_quad")
            )
        else:
            await db.execute(insert(NoteEdge).values(rows_to_insert))
    return len(rows_to_insert)


async def reindex_all_notes(db: AsyncSession) -> dict[str, int]:
    """Recompute frontmatter JSONB, search_vector, and note_edges across all canonical notes."""
    notes = (
        await db.scalars(select(CanonicalNote).order_by(CanonicalNote.slug))
    ).all()
    if not notes:
        return {"notes": 0, "edges": 0}

    resolve_slug = build_note_lookup(notes)
    slug_to_id = {note.slug: note.id for note in notes}

    total_edges = 0
    for note in notes:
        total_edges += await sync_note_index(db, note, resolve_slug, slug_to_id)

    return {"notes": len(notes), "edges": total_edges}
