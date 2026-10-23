"""AST source slices and retained owner-filtered vector index."""

import logging
import math
import re
from contextlib import asynccontextmanager
from typing import Any, TypedDict
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin
from mdit_py_plugins.front_matter import front_matter_plugin
from pydantic import Field
from sqlalchemy import and_, or_, select

from backend.app.config import settings
from backend.app.database import get_session
from backend.app.models import CanonicalNote, NoteEmbedding, UserNoteFork
from backend.app.workspace import (
    DB,
    Author,
    Contract,
    Me,
    digest,
    invalidate_vectors,
    note_by_slug,
    owned_fork,
    write_guard,
)

router = APIRouter(prefix="/api/ai")


class Chunk(TypedDict):
    content: str
    header: str


class Source(TypedDict):
    id: str
    title: str
    url: str
    content: str


def chunk_markdown(raw: str, limit: int = 2000) -> list[Chunk]:
    parser = MarkdownIt().use(front_matter_plugin).use(dollarmath_plugin)
    lines = raw.splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    tokens = parser.parse(raw)
    starts: dict[int, str | None] = {}
    for i, token in enumerate(tokens):
        if token.level == 0 and token.map and token.nesting != -1:
            header = None
            if token.type == "heading_open" and i + 1 < len(tokens):
                header = tokens[i + 1].content[:500]
            starts[offsets[token.map[0]]] = header
    starts[0] = starts.get(0)
    positions = sorted(starts)
    result: list[Chunk] = []
    current = ""
    current_header = "یادداشت"
    for i, start in enumerate(positions):
        end = positions[i + 1] if i + 1 < len(positions) else len(raw)
        unit = raw[start:end]
        heading = starts[start]
        if current and (heading or len(current) + len(unit) > limit):
            result.append({"content": current, "header": current_header})
            current = ""
        if heading:
            current_header = heading
        current += unit
    if current:
        result.append({"content": current, "header": current_header})
    return result


async def provider(path: str, payload: dict[str, object]) -> dict[str, Any]:
    if not settings.ai_api_key:
        raise HTTPException(503, "AI provider is not configured")
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                settings.ai_base_url.rstrip("/") + path,
                headers={"Authorization": "Bearer " + settings.ai_api_key},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError("Invalid provider response")
            return data
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "AI provider unavailable") from None


async def embed(texts: list[str]) -> list[list[float]]:
    result = await provider(
        "/embeddings", {"model": settings.ai_embedding_model, "input": texts, "dimensions": 1536}
    )
    try:
        data = sorted(result["data"], key=lambda item: item["index"])
        vectors = [[float(x) for x in item["embedding"]] for item in data]
        if len(vectors) != len(texts) or any(
            len(v) != 1536 or not all(math.isfinite(x) for x in v) or not any(v) for v in vectors
        ):
            raise ValueError("Invalid vectors")
        return vectors
    except (KeyError, TypeError, ValueError):
        raise HTTPException(503, "Invalid embedding response") from None


class IndexInput(Contract):
    slug: str = Field(min_length=1, max_length=255)


async def index_content(db: DB, note_id: UUID, raw: str, user_id: UUID | None) -> int:
    chunks = chunk_markdown(raw)
    if not chunks:
        return 0
    # Snapshot before network; verify under lock afterwards to prevent stale publication.
    snapshot = digest(raw)
    vectors: list[list[float]] = []
    for i in range(0, len(chunks), 32):
        vectors.extend(await embed([c["content"] for c in chunks[i : i + 32]]))
    note = await db.scalar(
        select(CanonicalNote)
        .where(CanonicalNote.id == note_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert note is not None
    if user_id is None:
        current_hash = note.current_hash
    else:
        fork = await owned_fork(db, note_id, user_id, lock=True)
        current_hash = fork.current_hash if fork else ""
    if current_hash != snapshot:
        raise HTTPException(409, "Content changed during indexing")
    await invalidate_vectors(db, note_id, user_id)
    for i, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
        db.add(
            NoteEmbedding(
                note_id=note_id,
                user_id=user_id,
                is_canonical=user_id is None,
                chunk_index=i,
                chunk_header=chunk["header"],
                chunk_content=chunk["content"],
                content_hash=snapshot,
                embedding=vector,
            )
        )
    await db.commit()
    return len(chunks)


@router.post("/index/personal", dependencies=[Depends(write_guard)])
async def index_personal(data: IndexInput, user: Me, db: DB) -> dict[str, int]:
    note = await note_by_slug(db, data.slug)
    fork = await owned_fork(db, note.id, user.id)
    if fork is None:
        raise HTTPException(404, "Personal note not found")
    return {"chunks": await index_content(db, note.id, fork.custom_content, user.id)}


@router.post("/index/canonical", dependencies=[Depends(write_guard)])
async def index_canonical(data: IndexInput, user: Author, db: DB) -> dict[str, int]:
    note = await note_by_slug(db, data.slug)
    return {"chunks": await index_content(db, note.id, note.current_content, None)}


async def retrieve(db: DB, user_id: UUID, vector: list[float]) -> list[Source]:
    distance = NoteEmbedding.embedding.cosine_distance(vector)
    query = (
        select(NoteEmbedding, CanonicalNote)
        .join(CanonicalNote)
        .outerjoin(
            UserNoteFork,
            and_(UserNoteFork.note_id == NoteEmbedding.note_id, UserNoteFork.user_id == user_id),
        )
        .where(
            or_(NoteEmbedding.is_canonical.is_(True), NoteEmbedding.user_id == user_id),
            or_(
                and_(
                    NoteEmbedding.is_canonical.is_(True),
                    NoteEmbedding.content_hash == CanonicalNote.current_hash,
                ),
                and_(
                    NoteEmbedding.user_id == user_id,
                    NoteEmbedding.content_hash == UserNoteFork.current_hash,
                ),
            ),
            distance < 0.65,
        )
        .order_by(distance)
        .limit(6)
    )
    rows = (await db.execute(query)).all()
    return [
        {
            "id": f"S{i + 1}",
            "title": f"{n.title} — {e.chunk_header}",
            "url": f"/notes/{n.slug}" + ("?personal=1" if not e.is_canonical else ""),
            "content": e.chunk_content,
        }
        for i, (e, n) in enumerate(rows)
    ]


def validate_answer(data: dict[str, Any], sources: list[Source]) -> bool:
    answer = data.get("answer")
    citations = data.get("citations")
    if not isinstance(answer, str) or not isinstance(citations, list) or not answer.strip():
        return False
    if not all(isinstance(c, str) for c in citations):
        return False
    allowed = {s["id"] for s in sources}
    used = set(re.findall(r"\[(S\d+)\]", answer))
    if not used or not used.issubset(allowed) or used != set(citations):
        return False
    # Every nonempty paragraph must carry an actual retrieval citation.
    return all(
        re.search(r"\[S\d+\]", paragraph) for paragraph in answer.split("\n\n") if paragraph.strip()
    )


async def refresh_index(note_id: UUID, user_id: UUID | None) -> None:
    """Use an independent session; provider failure must not undo an acknowledged save."""
    try:
        async with asynccontextmanager(get_session)() as db:
            note = await db.scalar(select(CanonicalNote).where(CanonicalNote.id == note_id))
            if note is None:
                return
            fork = await owned_fork(db, note_id, user_id) if user_id is not None else None
            if user_id is not None and fork is None:
                return
            raw = fork.custom_content if fork is not None else note.current_content
            await index_content(db, note_id, raw, user_id)
    except (HTTPException, OSError, TimeoutError, ValueError):
        logging.getLogger(__name__).warning("Index refresh failed for note %s", note_id)
