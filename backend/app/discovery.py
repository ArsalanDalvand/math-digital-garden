"""PostgreSQL-backed discovery APIs: /api/graph, /api/books, /api/search."""

from __future__ import annotations

import math
import re
from hashlib import sha256
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import and_, case, func, literal, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

from backend.app.database import get_session
from backend.app.knowledge_schema import UMKO_KINDS, UMKO_LEVELS, infer_kind
from backend.app.models import CanonicalNote, NoteEdge

router = APIRouter(prefix="/api", tags=["discovery"])

DB = Annotated[AsyncSession, Depends(get_session)]

BOOKS_CATALOGUE_META: dict[str, dict[str, Any]] = {
    "axler": {
        "order": 1,
        "title": "جبر خطی آکسلر (Linear Algebra Done Right)",
        "edition": "ویرایش چهارم ۲۰۲۴",
        "description": (
            "مرجع کامل مفاهیم، قضایا، برهان‌های ریاضی و تمرینات کتاب آکسلر، شامل فضاهای برداری، "
            "پایه‌ها و بعد، ترکیب‌های خطی، زیرفضاها، جمع مستقیم و فرمول گراسمان."
        ),
        "entry_label": "نقشه راه جامع",
        "preferred_entry_slug": "axler-2debc85d452ad205",
        "highlights": [
            {"label": "فصل ۱: فضاهای برداری", "slug": "axler-e4a02d4295df7fb9"},
            {"label": "فصل ۲: بعد متناهی", "slug": "axler-e3c2143b75ca96b1"},
            {"label": "حل تمرینات", "slug": "axler-9bafd064aa1cbbd2"},
            {"label": "تجسم‌های هندسی", "slug": "axler-a354fd365fa3e3ed"},
        ],
    },
    "abstract-algebra": {
        "order": 2,
        "title": "مبانی جبر و ماتریس‌ها (Abstract Algebra & Matrices)",
        "edition": "نسخهٔ رسمی",
        "description": (
            "مرجع ساختاریافتهٔ مفاهیم ساختارهای جبری، نیم‌گروه‌ها، کاتالوگ مثال‌ها، "
            "عناصر همانی و معکوس، توان‌ها، شرکت‌پذیری تعمیم‌یافته، زیرنیم‌گروه‌ها، مسائل و قضایا."
        ),
        "entry_label": "نقشه راه کلان",
        "preferred_entry_slug": "alg-232009403065653b",
        "highlights": [
            {"label": "فصل ۱: نیم‌گروه‌ها", "slug": "alg-d317c2026b6ac291"},
            {"label": "حل مسئله و تمرینات", "slug": "alg-1fb1b4082fe0dc00"},
            {"label": "اثبات‌های صوری", "slug": "alg-d04e2d30d5997348"},
            {"label": "گراف وابستگی", "slug": "alg-64aca55db469823c"},
        ],
    },
}

_FRONTMATTER_STRIP_RE = re.compile(r"\A---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)")
_WHITESPACE_RE = re.compile(r"\s+")


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _clean_tags(raw_tags: Any) -> list[str]:
    if not isinstance(raw_tags, list):
        return []
    return [str(t).strip() for t in raw_tags if isinstance(t, (str, int, float)) and str(t).strip()]


def build_sitemap_from_rows(
    notes: list[Any], edges: list[Any]
) -> dict[str, dict[str, Any]]:
    """Build exact graph sitemap payload expected by KnowledgeGraphEngine."""
    id_to_path: dict[Any, str] = {}
    entries: dict[str, dict[str, Any]] = {}
    outgoing_by_id: dict[Any, list[str]] = {}
    backlinks_by_id: dict[Any, list[str]] = {}
    rels_by_id: dict[Any, dict[str, list[str]]] = {}

    for row in notes:
        path = f"notes/{row.slug}"
        id_to_path[row.id] = path
        outgoing_by_id[row.id] = []
        backlinks_by_id[row.id] = []
        rels_by_id[row.id] = {}

        fm = row.frontmatter if isinstance(getattr(row, "frontmatter", None), dict) else {}
        normal_tags = [t if t.startswith("#") else f"#{t}" for t in _clean_tags(fm.get("tags"))]
        kind = str(fm.get("kind") or "")
        if not kind:
            kind = infer_kind(fm, normal_tags, row.title)
        subtype = str(fm.get("subtype") or "")
        level = str(fm.get("level") or "")
        slogan = str(fm.get("slogan_fa") or "")
        uid = str(fm.get("uid") or "")
        tracks = _clean_tags(fm.get("tracks"))

        merged_tags = list(normal_tags)
        if kind:
            merged_tags.append(f"#kind:{kind}")
        if subtype:
            merged_tags.append(f"#sub:{subtype}")
        if level:
            merged_tags.append(f"#level:{level}")
        merged_tags.extend(f"#track:{tr}" for tr in tracks)
        deduped_tags = list(dict.fromkeys(merged_tags))

        entries[path] = {
            "title": row.title,
            "exists": True,
            "external": False,
            "links": outgoing_by_id[row.id],
            "backlinks": backlinks_by_id[row.id],
            "tags": deduped_tags,
            "kind": kind,
            "subtype": subtype,
            "level": level,
            "slogan": slogan,
            "uid": uid,
            "book_slug": getattr(row, "book_slug", ""),
            "chapter_slug": getattr(row, "chapter_slug", ""),
        }

    for edge in edges:
        src_id = edge.source_note_id
        tgt_id = edge.target_note_id
        src_path = id_to_path.get(src_id)
        tgt_path = id_to_path.get(tgt_id)
        if not src_path or not tgt_path or src_id == tgt_id:
            continue
        if tgt_path not in outgoing_by_id[src_id]:
            outgoing_by_id[src_id].append(tgt_path)
        if src_path not in backlinks_by_id[tgt_id]:
            backlinks_by_id[tgt_id].append(src_path)
        if edge.edge_source == "frontmatter" and edge.relation_type != "wikilink":
            rel_list = rels_by_id[src_id].setdefault(tgt_path, [])
            if edge.relation_type not in rel_list:
                rel_list.append(edge.relation_type)

    for row in notes:
        path = id_to_path[row.id]
        if rels_by_id[row.id]:
            entries[path]["rels"] = rels_by_id[row.id]

    return entries


def build_books_catalogue(rows: list[Any]) -> dict[str, Any]:
    """Aggregate dynamic book statistics cleanly without hardcoded counts."""
    grouped: dict[str, list[Any]] = {}
    for row in rows:
        book_slug = str(row.book_slug or "").strip() or "general"
        grouped.setdefault(book_slug, []).append(row)

    books: list[dict[str, Any]] = []
    for book_slug, items in grouped.items():
        meta = BOOKS_CATALOGUE_META.get(book_slug, {})
        chapters = {str(item.chapter_slug or "").strip() for item in items if item.chapter_slug}
        slugs = {item.slug for item in items}

        preferred = meta.get("preferred_entry_slug")
        entry_slug = preferred if preferred in slugs else None
        if entry_slug is None:
            moc_candidate = next(
                (
                    item.slug
                    for item in items
                    if "MOC" in (item.title or "") or item.slug.endswith("-index")
                ),
                None,
            )
            entry_slug = moc_candidate or items[0].slug

        highlights = [
            h for h in meta.get("highlights", []) if h["slug"] in slugs
        ]

        books.append(
            {
                "book_slug": book_slug,
                "title": meta.get("title") or book_slug,
                "edition": meta.get("edition") or "مخزن فعال",
                "description": meta.get("description") or f"پایگاه دانش {book_slug}",
                "note_count": len(items),
                "chapter_count": len(chapters),
                "entry_slug": entry_slug,
                "entry_label": meta.get("entry_label") or "مشاهده یادداشت‌ها",
                "highlights": highlights,
                "_order": meta.get("order", 999),
            }
        )

    books.sort(key=lambda b: (b["_order"], b["book_slug"]))
    for book in books:
        book.pop("_order", None)

    return {"total_notes": len(rows), "books": books}


def extract_search_snippet(content: str, query: str, radius: int = 85) -> str:
    """Return compact human-readable snippet centered on query match outside YAML."""
    stripped = _FRONTMATTER_STRIP_RE.sub("", content or "")
    plain = _WHITESPACE_RE.sub(" ", stripped).strip()
    if not plain:
        return ""
    clean_q = query.strip()
    if clean_q:
        idx = plain.lower().find(clean_q.lower())
        if idx < 0:
            first_word = next((w for w in clean_q.split() if w), "")
            if first_word:
                idx = plain.lower().find(first_word.lower())
        if idx >= 0:
            start = max(0, idx - radius)
            end = min(len(plain), idx + len(clean_q) + radius)
            prefix = "…" if start > 0 else ""
            suffix = "…" if end < len(plain) else ""
            return f"{prefix}{plain[start:end].strip()}{suffix}"
    return plain[:160] + ("…" if len(plain) > 160 else "")


@router.get("/graph")
async def get_graph(request: Request, db: DB) -> Response:
    try:
        notes_res = await db.execute(
            select(
                CanonicalNote.id,
                CanonicalNote.slug,
                CanonicalNote.title,
                CanonicalNote.book_slug,
                CanonicalNote.chapter_slug,
                CanonicalNote.current_hash,
                CanonicalNote.frontmatter,
            ).order_by(CanonicalNote.slug)
        )
        note_rows = notes_res.all()

        edges_res = await db.execute(
            select(
                NoteEdge.source_note_id,
                NoteEdge.target_note_id,
                NoteEdge.relation_type,
                NoteEdge.edge_source,
            )
        )
        edge_rows = edges_res.all()
    except (SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(503, "Database unavailable") from None

    sig = "\n".join(f"{r.slug}:{r.current_hash}" for r in note_rows) + f"\nedges:{len(edge_rows)}"
    digest = sha256(sig.encode("utf-8")).hexdigest()[:16]
    etag = f'W/"graph-pg-{digest}"'
    headers = {
        "ETag": etag,
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    payload = build_sitemap_from_rows(note_rows, edge_rows)
    return JSONResponse(content=payload, headers=headers)


@router.get("/books")
async def get_books(request: Request, db: DB) -> Response:
    try:
        res = await db.execute(
            select(
                CanonicalNote.slug,
                CanonicalNote.title,
                CanonicalNote.book_slug,
                CanonicalNote.chapter_slug,
                CanonicalNote.current_hash,
            ).order_by(CanonicalNote.slug)
        )
        rows = res.all()
    except (SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(503, "Database unavailable") from None

    digest = sha256(
        "\n".join(f"{r.book_slug}:{r.slug}:{r.current_hash}" for r in rows).encode("utf-8")
    ).hexdigest()[:16]
    etag = f'W/"books-{digest}"'
    headers = {
        "ETag": etag,
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    return JSONResponse(content=build_books_catalogue(rows), headers=headers)


@router.get("/search")
async def search_notes(
    db: DB,
    q: Annotated[str, Query(max_length=200)] = "",
    book: Annotated[str, Query(max_length=100)] = "",
    kind: Annotated[str, Query(max_length=64)] = "",
    tag: Annotated[str, Query(max_length=120)] = "",
    track: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    clean_q = q.strip()
    filters = []

    if book.strip():
        filters.append(CanonicalNote.book_slug == book.strip())
    if kind.strip():
        filters.append(CanonicalNote.frontmatter["kind"].astext == kind.strip())
    if tag.strip():
        clean_tag = tag.strip().lstrip("#")
        filters.append(
            or_(
                CanonicalNote.frontmatter["tags"].contains([clean_tag]),
                CanonicalNote.frontmatter["tags"].contains([f"#{clean_tag}"]),
            )
        )
    if track.strip():
        filters.append(CanonicalNote.frontmatter["tracks"].contains([track.strip()]))

    if clean_q:
        pattern = f"%{_escape_like(clean_q)}%"
        ts_query = func.plainto_tsquery("simple", clean_q)
        trgm_sim = func.similarity(CanonicalNote.title, clean_q)
        fts_match = CanonicalNote.search_vector.op("@@")(ts_query)
        text_match = or_(
            CanonicalNote.title.ilike(pattern, escape="\\"),
            CanonicalNote.current_content.ilike(pattern, escape="\\"),
            fts_match,
            trgm_sim > 0.15,
        )
        filters.append(text_match)
        score_expr = (
            func.coalesce(func.ts_rank(CanonicalNote.search_vector, ts_query), 0.0)
            + (trgm_sim * 2.0)
            + case((CanonicalNote.title.ilike(pattern, escape="\\"), 3.0), else_=0.0)
        ).label("score")
    else:
        score_expr = literal(0.0).label("score")

    where_clause = and_(*filters) if filters else literal(True)

    count_stmt = select(func.count(CanonicalNote.id)).where(where_clause)
    rows_stmt = (
        select(
            CanonicalNote.slug,
            CanonicalNote.title,
            CanonicalNote.book_slug,
            CanonicalNote.chapter_slug,
            CanonicalNote.frontmatter,
            CanonicalNote.current_content,
            score_expr,
        )
        .where(where_clause)
        .order_by(score_expr.desc(), CanonicalNote.title.asc())
        .offset(offset)
        .limit(limit)
    )

    try:
        total = int((await db.execute(count_stmt)).scalar_one() or 0)
        rows = (await db.execute(rows_stmt)).all()
    except (SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(503, "Database unavailable") from None

    items = []
    for row in rows:
        fm = row.frontmatter if isinstance(row.frontmatter, dict) else {}
        tags_list = _clean_tags(fm.get("tags"))
        note_kind = str(fm.get("kind") or "") or infer_kind(fm, tags_list, row.title)
        kind_meta = UMKO_KINDS.get(note_kind, {})
        level_key = str(fm.get("level") or "")
        level_meta = UMKO_LEVELS.get(level_key, {})
        raw_score = float(row.score or 0.0)
        safe_score = round(raw_score, 4) if math.isfinite(raw_score) else 0.0
        items.append(
            {
                "slug": row.slug,
                "title": row.title,
                "book_slug": row.book_slug,
                "chapter_slug": row.chapter_slug,
                "kind": note_kind,
                "kind_label": kind_meta.get("label", ""),
                "kind_color": kind_meta.get("color", ""),
                "level": level_key,
                "level_label": level_meta.get("label", ""),
                "slogan": str(fm.get("slogan_fa") or ""),
                "tags": tags_list,
                "tracks": _clean_tags(fm.get("tracks")),
                "snippet": extract_search_snippet(row.current_content, clean_q),
                "score": safe_score,
            }
        )

    return {"total": total, "query": clean_q, "items": items}
