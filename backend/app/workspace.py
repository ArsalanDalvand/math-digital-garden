"""Authenticated workspace and the author review boundary."""

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from typing import Annotated, Literal
from uuid import UUID

from diff_match_patch import diff_match_patch  # type: ignore[import-untyped]
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.config import settings
from backend.app.database import get_session
from backend.app.models import (
    AuthSession,
    Bookmark,
    CanonicalNote,
    ChangeProposal,
    ForkRevision,
    NoteEmbedding,
    User,
    UserNoteFork,
)

router = APIRouter(prefix="/api")
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
        .where(AuthSession.token_hash == digest(token), AuthSession.expires_at > datetime.now(UTC))
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


class Credentials(Contract):
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)


class Registration(Credentials):
    full_name: str | None = Field(default=None, max_length=255)


class SaveFork(Contract):
    content: str = Field(max_length=2_000_000)
    expected_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class ResetFork(Contract):
    expected_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class ProposalInput(Contract):
    slug: str = Field(min_length=1, max_length=255)
    comment: str = Field(min_length=1, max_length=4000)


class ReviewInput(Contract):
    decision: Literal["approve", "reject", "changes_requested"]
    comment: str = Field(default="", max_length=4000)


def user_json(user: User) -> dict[str, object]:
    return {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": user.role}


def fork_json(fork: UserNoteFork) -> dict[str, object]:
    return {
        k: getattr(fork, k)
        for k in ("id", "base_hash", "base_content", "custom_content", "current_hash", "updated_at")
    }


def proposal_json(p: ChangeProposal, slug: str = "") -> dict[str, object]:
    return {
        **{
            k: getattr(p, k)
            for k in (
                "id",
                "note_id",
                "base_hash",
                "base_content",
                "proposed_content",
                "diff_patch",
                "student_comment",
                "status",
                "author_review_comment",
                "created_at",
                "reviewed_at",
                "sync_status",
                "sync_commit",
            )
        },
        "slug": slug,
    }


async def issue_session(db: AsyncSession, user: User, response: Response, request: Request) -> None:
    old = request.cookies.get("garden_session")
    if old:
        await db.execute(
            delete(AuthSession).where(
                AuthSession.token_hash == digest(old), AuthSession.user_id == user.id
            )
        )
    token = token_urlsafe(32)
    db.add(
        AuthSession(
            token_hash=digest(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
    )
    await db.commit()
    response.set_cookie(
        "garden_session",
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=7 * 86400,
        path="/",
    )


@router.post("/auth/register", status_code=201, dependencies=[Depends(write_guard)])
@limiter.limit("10/minute")
async def register(
    request: Request, data: Registration, response: Response, db: DB
) -> dict[str, object]:
    user = User(
        email=str(data.email).lower(),
        full_name=data.full_name,
        role="student",
        password_hash=await run_in_threadpool(passwords.hash, data.password),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Registration unavailable for this email") from None
    await issue_session(db, user, response, request)
    return user_json(user)


@router.post("/auth/login", dependencies=[Depends(write_guard)])
@limiter.limit("20/minute")
async def login(
    request: Request, data: Credentials, response: Response, db: DB
) -> dict[str, object]:
    user = await db.scalar(select(User).where(User.email == str(data.email).lower()))
    hashed = user.password_hash if user else DUMMY_HASH
    try:
        valid = await run_in_threadpool(passwords.verify, data.password, hashed)
    except (ValueError, TypeError):
        valid = False
    if not valid or user is None:
        raise HTTPException(401, "Invalid credentials")
    await issue_session(db, user, response, request)
    return user_json(user)


@router.get("/auth/me")
async def me(user: Me) -> dict[str, object]:
    return user_json(user)


@router.post("/auth/logout", status_code=204, dependencies=[Depends(write_guard)])
async def logout(request: Request, response: Response, user: Me, db: DB) -> None:
    await db.execute(
        delete(AuthSession).where(
            AuthSession.token_hash == digest(request.cookies.get("garden_session", "")),
            AuthSession.user_id == user.id,
        )
    )
    await db.commit()
    response.delete_cookie("garden_session", path="/", httponly=True, samesite="lax", secure=settings.cookie_secure)


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


@router.get("/workspace/notes/{slug}")
async def workspace_note(slug: str, user: Me, db: DB) -> dict[str, object]:
    note = await note_by_slug(db, slug)
    fork = await owned_fork(db, note.id, user.id)
    return {
        "canonical": {
            "slug": note.slug,
            "title": note.title,
            "content": note.current_content,
            "current_hash": note.current_hash,
        },
        "fork": fork_json(fork) if fork else None,
    }


async def invalidate_vectors(db: AsyncSession, note_id: UUID, user_id: UUID | None) -> None:
    query = delete(NoteEmbedding).where(NoteEmbedding.note_id == note_id)
    query = (
        query.where(NoteEmbedding.is_canonical.is_(True))
        if user_id is None
        else query.where(NoteEmbedding.is_canonical.is_(False), NoteEmbedding.user_id == user_id)
    )
    await db.execute(query)


async def persist_fork(db: AsyncSession, fork: UserNoteFork, content: str, *, commit=True) -> None:
    from backend.app.library_models import LibraryCanonical, LibraryItem, LibraryRevision

    fork.custom_content = content
    fork.current_hash = digest(content)
    fork.updated_at = datetime.now(UTC)
    db.add(
        ForkRevision(
            user_id=fork.user_id, fork_id=fork.id, content=content, content_hash=fork.current_hash
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


@router.post("/notes/{slug}/fork", dependencies=[Depends(write_guard)])
async def save_fork(
    slug: str, data: SaveFork, user: Me, db: DB, tasks: BackgroundTasks
) -> dict[str, object]:
    # Lock canonical first for both creation and review: consistent ordering prevents deadlocks.
    note = await note_by_slug(db, slug, lock=True)
    fork = await owned_fork(db, note.id, user.id, lock=True)
    if data.expected_hash != (fork.current_hash if fork else note.current_hash):
        raise HTTPException(409, "Content changed; reload before saving")
    if fork is None:
        fork = UserNoteFork(
            user_id=user.id,
            note_id=note.id,
            base_hash=note.current_hash,
            base_content=note.current_content,
            custom_content=data.content,
            current_hash=digest(data.content),
        )
        db.add(fork)
        await db.flush()
    await persist_fork(db, fork, data.content)
    schedule_index(tasks, note.id, user.id)
    return fork_json(fork)


@router.post("/notes/{slug}/fork/reset", dependencies=[Depends(write_guard)])
async def reset_fork(
    slug: str, data: ResetFork, user: Me, db: DB, tasks: BackgroundTasks
) -> dict[str, object]:
    note = await note_by_slug(db, slug, lock=True)
    fork = await owned_fork(db, note.id, user.id, lock=True)
    if fork is None:
        raise HTTPException(404, "Fork not found")
    if fork.current_hash != data.expected_hash:
        raise HTTPException(409, "Content changed")
    fork.base_content, fork.base_hash = note.current_content, note.current_hash
    await persist_fork(db, fork, note.current_content)
    schedule_index(tasks, note.id, user.id)
    return fork_json(fork)


@router.get("/workspace")
async def workspace(user: Me, db: DB) -> dict[str, object]:
    rows = (
        await db.execute(
            select(UserNoteFork, CanonicalNote)
            .join(CanonicalNote, UserNoteFork.note_id == CanonicalNote.id)
            .where(UserNoteFork.user_id == user.id)
            .order_by(UserNoteFork.updated_at.desc())
        )
    ).all()
    marks = (
        await db.scalars(
            select(CanonicalNote)
            .join(Bookmark)
            .where(Bookmark.user_id == user.id)
            .order_by(CanonicalNote.title)
        )
    ).all()
    return {
        "forks": [{**fork_json(f), "slug": n.slug, "title": n.title} for f, n in rows],
        "bookmarks": [{"slug": n.slug, "title": n.title} for n in marks],
    }


@router.get("/workspace/forks/{fork_id}/history")
async def history(fork_id: UUID, user: Me, db: DB) -> list[dict[str, object]]:
    fork = await db.scalar(
        select(UserNoteFork).where(UserNoteFork.id == fork_id, UserNoteFork.user_id == user.id)
    )
    if fork is None:
        raise HTTPException(404, "Fork not found")
    revisions = (
        await db.scalars(
            select(ForkRevision)
            .where(ForkRevision.fork_id == fork_id, ForkRevision.user_id == user.id)
            .order_by(ForkRevision.created_at.desc())
            .limit(100)
        )
    ).all()
    return [
        {
            "id": r.id,
            "content": r.content,
            "content_hash": r.content_hash,
            "created_at": r.created_at,
        }
        for r in revisions
    ]


@router.put("/workspace/bookmarks/{slug}", status_code=204, dependencies=[Depends(write_guard)])
async def bookmark(slug: str, user: Me, db: DB) -> None:
    note = await note_by_slug(db, slug)
    await db.execute(
        insert(Bookmark).values(user_id=user.id, note_id=note.id).on_conflict_do_nothing()
    )
    await db.commit()


@router.delete("/workspace/bookmarks/{slug}", status_code=204, dependencies=[Depends(write_guard)])
async def unbookmark(slug: str, user: Me, db: DB) -> None:
    note = await note_by_slug(db, slug)
    await db.execute(
        delete(Bookmark).where(Bookmark.note_id == note.id, Bookmark.user_id == user.id)
    )
    await db.commit()


@router.post("/proposals", status_code=201, dependencies=[Depends(write_guard)])
async def propose(data: ProposalInput, user: Me, db: DB) -> dict[str, object]:
    note = await note_by_slug(db, data.slug)
    fork = await owned_fork(db, note.id, user.id, lock=True)
    if fork is None or fork.custom_content == fork.base_content:
        raise HTTPException(409, "No personal changes to propose")
    dmp = diff_match_patch()
    proposal = ChangeProposal(
        user_id=user.id,
        note_id=note.id,
        base_hash=fork.base_hash,
        base_content=fork.base_content,
        proposed_content=fork.custom_content,
        diff_patch=dmp.patch_toText(dmp.patch_make(fork.base_content, fork.custom_content)),
        student_comment=data.comment,
    )
    db.add(proposal)
    await db.commit()
    return proposal_json(proposal, note.slug)


@router.get("/proposals")
async def proposals(user: Me, db: DB) -> list[dict[str, object]]:
    rows = (
        await db.execute(
            select(ChangeProposal, CanonicalNote.slug)
            .join(CanonicalNote)
            .where(ChangeProposal.user_id == user.id)
            .order_by(ChangeProposal.created_at.desc())
            .limit(100)
        )
    ).all()
    return [proposal_json(p, slug) for p, slug in rows]


@router.get("/proposals/{proposal_id}")
async def proposal(proposal_id: UUID, user: Me, db: DB) -> dict[str, object]:
    row = (
        await db.execute(
            select(ChangeProposal, CanonicalNote.slug)
            .join(CanonicalNote)
            .where(ChangeProposal.id == proposal_id, ChangeProposal.user_id == user.id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Proposal not found")
    return proposal_json(*row)


# Explicit author review boundary: students always use the owner-scoped endpoints above.
@router.get("/review")
async def review_list(user: Author, db: DB) -> list[dict[str, object]]:
    rows = (
        await db.execute(
            select(ChangeProposal, CanonicalNote.slug)
            .join(CanonicalNote)
            .order_by(ChangeProposal.created_at.desc())
            .limit(100)
        )
    ).all()
    return [proposal_json(p, slug) for p, slug in rows]


@router.get("/review/{proposal_id}")
async def review_detail(proposal_id: UUID, user: Author, db: DB) -> dict[str, object]:
    row = (
        await db.execute(
            select(ChangeProposal, CanonicalNote.slug)
            .join(CanonicalNote)
            .where(ChangeProposal.id == proposal_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Proposal not found")
    return proposal_json(*row)


@router.post("/review/{proposal_id}", dependencies=[Depends(write_guard)])
async def decide(
    proposal_id: UUID, data: ReviewInput, user: Author, db: DB, tasks: BackgroundTasks
) -> dict[str, object]:
    # Discover note ID without a proposal lock, then acquire canonical before proposal/fork locks.
    note_id = await db.scalar(
        select(ChangeProposal.note_id).where(ChangeProposal.id == proposal_id)
    )
    if note_id is None:
        raise HTTPException(404, "Proposal not found")
    note = await db.scalar(
        select(CanonicalNote).where(CanonicalNote.id == note_id).with_for_update()
    )
    p = await db.scalar(
        select(ChangeProposal).where(ChangeProposal.id == proposal_id).with_for_update()
    )
    assert note is not None and p is not None
    if p.status != "pending":
        raise HTTPException(409, "Proposal already reviewed")
    if data.decision == "approve":
        if note.current_hash != p.base_hash or digest(p.base_content) != p.base_hash:
            raise HTTPException(409, "Canonical base changed; request a new proposal")
        dmp = diff_match_patch()
        merged, results = dmp.patch_apply(dmp.patch_fromText(p.diff_patch), note.current_content)
        if not all(results) or merged != p.proposed_content:
            raise HTTPException(409, "Patch does not apply exactly")
        note.current_content, note.current_hash = merged, digest(merged)
        note.updated_at = datetime.now(UTC)
        await invalidate_vectors(db, note.id, None)
    p.status = {
        "approve": "approved",
        "reject": "rejected",
        "changes_requested": "changes_requested",
    }[data.decision]
    p.author_review_comment, p.reviewed_by = data.comment, user.id
    p.reviewed_at = datetime.now(UTC)
    await db.commit()
    if p.status == "approved":
        schedule_index(tasks, note.id, None)
    if p.status == "approved" and settings.content_git_repo:
        await sync_approved(db, p, note)
    return proposal_json(p, note.slug)


async def sync_approved(db: AsyncSession, p: ChangeProposal, note: CanonicalNote) -> None:
    from pathlib import Path
    from subprocess import SubprocessError

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


@router.post("/review/{proposal_id}/sync", dependencies=[Depends(write_guard)])
async def retry_sync(proposal_id: UUID, user: Author, db: DB) -> dict[str, object]:
    p = await db.scalar(
        select(ChangeProposal).where(ChangeProposal.id == proposal_id).with_for_update()
    )
    if p is None:
        raise HTTPException(404, "Proposal not found")
    if p.status != "approved":
        raise HTTPException(409, "Only approved proposals can be exported")
    note = await db.scalar(select(CanonicalNote).where(CanonicalNote.id == p.note_id))
    assert note is not None
    await sync_approved(db, p, note)
    return proposal_json(p, note.slug)


class RebaseInput(SaveFork):
    canonical_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


@router.post("/notes/{slug}/fork/rebase", dependencies=[Depends(write_guard)])
async def rebase_fork(
    slug: str, data: RebaseInput, user: Me, db: DB, tasks: BackgroundTasks
) -> dict[str, object]:
    note = await note_by_slug(db, slug, lock=True)
    fork = await owned_fork(db, note.id, user.id, lock=True)
    if fork is None:
        raise HTTPException(404, "Fork not found")
    if fork.current_hash != data.expected_hash or note.current_hash != data.canonical_hash:
        raise HTTPException(409, "Personal or canonical version changed")
    fork.base_hash, fork.base_content = note.current_hash, note.current_content
    await persist_fork(db, fork, data.content)
    schedule_index(tasks, note.id, user.id)
    return fork_json(fork)
