from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import datetime
from hashlib import sha256
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Path, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from starlette.responses import Response

from backend.app.account_settings import router as account_router
from backend.app.config import settings
from backend.app.database import get_engine, get_session, get_session_factory
from backend.app.dify import router as dify_router
from backend.app.discovery import router as discovery_router
from backend.app.library import router as library_router
from backend.app.models import CanonicalNote
from backend.app.rag import router as rag_router
from backend.app.workspace import limiter
from backend.app.workspace import router as workspace_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    if get_engine.cache_info().currsize:
        await get_engine().dispose()
        get_engine.cache_clear()
    get_session_factory.cache_clear()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=settings.app_description,
    lifespan=lifespan,
)


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    slug: str
    title: str
    book_slug: str
    chapter_slug: str
    relative_path: str
    current_content: str
    current_hash: str
    updated_at: datetime


class NoteMetaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    slug: str
    title: str
    book_slug: str
    chapter_slug: str
    relative_path: str
    current_hash: str
    updated_at: datetime


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


NoteSlug = Annotated[str, Path(min_length=1, max_length=255, pattern=r"^[\w-]+$")]


async def get_note_session(slug: NoteSlug) -> AsyncIterator[AsyncSession]:
    async with asynccontextmanager(get_session)() as session:
        yield session


@app.get("/api/notes/{slug}", response_model=NoteResponse)
async def read_note(
    slug: NoteSlug,
    session: Annotated[AsyncSession, Depends(get_note_session)],
) -> NoteResponse:
    try:
        result = await session.execute(select(CanonicalNote).where(CanonicalNote.slug == slug))
    except (SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(503, "Database unavailable") from None
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(404, "Note not found")
    return NoteResponse.model_validate(note)


CatalogueOffset = Annotated[int, Query(ge=0)]
CatalogueLimit = Annotated[int, Query(ge=1, le=100)]
CatalogueQuery = Annotated[str, Query(max_length=200)]


async def get_catalogue_session(
    offset: CatalogueOffset = 0,
    limit: CatalogueLimit = 100,
    q: CatalogueQuery = "",
) -> AsyncIterator[AsyncSession]:
    async with asynccontextmanager(get_session)() as session:
        yield session


@app.get("/api/catalogue/meta")
async def list_catalogue_meta(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    query = select(
        CanonicalNote.id,
        CanonicalNote.slug,
        CanonicalNote.title,
        CanonicalNote.book_slug,
        CanonicalNote.chapter_slug,
        CanonicalNote.relative_path,
        CanonicalNote.current_hash,
        CanonicalNote.updated_at,
    ).order_by(CanonicalNote.slug)
    try:
        result = await session.execute(query)
        rows = result.all()
    except (SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(503, "Database unavailable") from None

    digest = sha256(
        "\n".join(f"{row.slug}:{row.current_hash}" for row in rows).encode("utf-8")
    ).hexdigest()[:16]
    etag = f'W/"{digest}"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    payload = [
        NoteMetaResponse.model_validate(row, from_attributes=True).model_dump(mode="json")
        for row in rows
    ]
    return JSONResponse(content=payload, headers=headers)


@app.get("/api/notes", response_model=list[NoteResponse])
async def list_notes(
    session: Annotated[AsyncSession, Depends(get_catalogue_session)],
    offset: CatalogueOffset = 0,
    limit: CatalogueLimit = 100,
    q: CatalogueQuery = "",
) -> list[NoteResponse]:
    query = select(CanonicalNote).order_by(CanonicalNote.slug).offset(offset).limit(limit)
    if q:
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(
            or_(
                CanonicalNote.title.ilike(pattern, escape="\\"),
                CanonicalNote.current_content.ilike(pattern, escape="\\"),
            )
        )
    try:
        result = await session.execute(query)
    except (SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(503, "Database unavailable") from None
    return [NoteResponse.model_validate(note) for note in result.scalars().all()]


app.state.limiter = limiter


def rate_limit_handler(request: Request, exc: Exception) -> Response:
    assert isinstance(exc, RateLimitExceeded)
    return _rate_limit_exceeded_handler(request, exc)


app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.include_router(workspace_router)
app.include_router(account_router)
app.include_router(library_router)
app.include_router(discovery_router)


@app.middleware("http")
async def private_cache_control(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    if (
        request.url.path.startswith(
            (
                "/api/auth",
                "/api/account",
                "/api/library",
                "/api/workspace",
                "/api/proposals",
                "/api/review",
                "/api/ai",
            )
        )
        or request.method != "GET"
    ):
        response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(rag_router)


app.include_router(dify_router)
