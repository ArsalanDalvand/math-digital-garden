"""Shared security dependencies, helpers, and persistence primitives for workspace APIs."""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from secrets import token_urlsafe
from subprocess import SubprocessError
from typing import Annotated
from uuid import UUID

from fastapi import BackgroundTasks, Depends, HTTPException, Request
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.config import settings
from backend.app.database import get_session
from backend.app.models import (
    AuthSession,
    CanonicalNote,
    ChangeProposal,
    ForkRevision,
    NoteEmbedding,
    User,
    UserNoteFork,
)

limiter = Limiter(key_func=get_remote_address)
passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash(token_urlsafe(32))
DB = Annotated[AsyncSession, Depends(get_session)]


def digest(content: str) -> str:
    return sha256(content.encode("utf-8")).hexdigest()


def write_guard(request: Request) -> None:
    if request.headers.get("x-requested-with") != "MathGarden":
        raise HTTPException(403, "CSRF header required")
    origin = request.headers.get("origin")
    allowed = {
        str(request.base_url).rstrip("/"),
        settings.frontend_origin.rstrip("/"),
        "http://localhost",
        "http://localhost:4321",
        "http://127.0.0.1:4321",
        *settings.allowed_extra_origins,
    }
    if origin and origin.rstrip("/") not in allowed:
        raise HTTPException(403, "Origin not allowed")


Writes = Annotated[None, Depends(write_guard)]


async def current_user(request: Request, db: DB) -> User:
    token = request.cookies.get("garden_session", "")
    if not token or len(token) > 128:
        raise HTTPException(401, "Login required")
    user = await db.scalar(
        select(User)
        .join(AuthSession, User.id == AuthSession.user_id)
        .where(
            AuthSession.token_hash == digest(token),
            AuthSession.expires_at > datetime.now(UTC),
        )
    )
    if user is None:
        raise HTTPException(401, "Session expired")
    return user


Me = Annotated[User, Depends(current_user)]


async def author_user(user: Me) -> User:
    if user.role not in {"author", "admin"}:
        raise HTTPException(403, "Author role required")
    return user


Author = Annotated[User, Depends(author_user)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


def user_json(user: User) -> dict[str, object]:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
    }


def fork_json(fork: UserNoteFork) -> dict[str, object]:
    return {
        k: getattr(fork, k)
        for k in (
            "id",
            "base_hash",
            "base_content",
            "custom_content",
            "current_hash",
            "updated_at",
        )
    }


async def note_by_slug(db: AsyncSession, slug: str, lock: bool = False) -> CanonicalNote:
    query = select(CanonicalNote).where(CanonicalNote.slug == slug)
    if lock:
        query = query.with_for_update()
    note = await db.scalar(query)
    if note is None:
        raise HTTPException(404, "Note not found")
    return note


async def owned_fork(
    db: AsyncSession, note_id: UUID, user_id: UUID, lock: bool = False
) -> UserNoteFork | None:
    query = select(UserNoteFork).where(
        UserNoteFork.note_id == note_id, UserNoteFork.user_id == user_id
    )
    return await db.scalar(
        query.with_for_update().execution_options(populate_existing=True) if lock else query
    )


async def invalidate_vectors(db: AsyncSession, note_id: UUID, user_id: UUID | None) -> None:
    query = delete(NoteEmbedding).where(NoteEmbedding.note_id == note_id)
    query = (
        query.where(NoteEmbedding.is_canonical.is_(True))
        if user_id is None
        else query.where(NoteEmbedding.is_canonical.is_(False), NoteEmbedding.user_id == user_id)
    )
    await db.execute(query)


async def persist_fork(
    db: AsyncSession, fork: UserNoteFork, content: str, *, commit: bool = True
) -> None:
    from backend.app.library_models import LibraryCanonical, LibraryItem, LibraryRevision

    fork.custom_content = content
    fork.current_hash = digest(content)
    fork.updated_at = datetime.now(UTC)
    db.add(
        ForkRevision(
            user_id=fork.user_id,
            fork_id=fork.id,
            content=content,
            content_hash=fork.current_hash,
        )
    )
    await invalidate_vectors(db, fork.note_id, fork.user_id)
    item = await db.scalar(
        select(LibraryItem)
        .join(LibraryCanonical, LibraryCanonical.item_id == LibraryItem.id)
        .where(
            LibraryCanonical.note_id == fork.note_id,
            LibraryCanonical.user_id == fork.user_id,
            LibraryItem.user_id == fork.user_id,
        )
        .with_for_update(of=LibraryItem)
    )
    if item is not None:
        item.content, item.current_hash = content, fork.current_hash
        item.updated_at = fork.updated_at
        item.verified_hash = item.verified_by = item.verified_at = None
        db.add(
            LibraryRevision(
                user_id=fork.user_id,
                item_id=item.id,
                content=content,
                content_hash=fork.current_hash,
            )
        )
    if commit:
        await db.commit()


def schedule_index(tasks: BackgroundTasks, note_id: UUID, user_id: UUID | None) -> None:
    if settings.ai_api_key and settings.ai_embedding_model:
        from backend.app.rag import refresh_index

        tasks.add_task(refresh_index, note_id, user_id)


async def sync_approved(db: AsyncSession, p: ChangeProposal, note: CanonicalNote) -> None:
    from backend.app.content_sync import export_note

    if not settings.content_git_repo:
        p.sync_status = "pending"
    else:
        try:
            p.sync_commit = await run_in_threadpool(
                export_note,
                Path(settings.content_git_repo),
                note.relative_path,
                p.base_content,
                p.proposed_content,
                str(p.id),
            )
            p.sync_status = "synced"
        except (ValueError, OSError, SubprocessError):
            p.sync_status = "failed"
    await db.commit()
