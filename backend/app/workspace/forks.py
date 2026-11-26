"""Personal note fork, revision history, rebase, and bookmark workspace routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import Field
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from backend.app.models import Bookmark, CanonicalNote, ForkRevision, UserNoteFork
from backend.app.workspace.security import (
    DB,
    Contract,
    Me,
    digest,
    fork_json,
    note_by_slug,
    owned_fork,
    persist_fork,
    schedule_index,
    write_guard,
)

router = APIRouter()


class SaveFork(Contract):
    content: str = Field(max_length=2_000_000)
    expected_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class ResetFork(Contract):
    expected_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class RebaseInput(SaveFork):
    canonical_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


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
