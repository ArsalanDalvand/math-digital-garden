"""Canonical-linked personal library item routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import Field, field_validator
from sqlalchemy import insert, literal, select

from backend.app.library.common import dto, owned
from backend.app.library_models import LibraryCanonical, LibraryItem, LibraryRevision
from backend.app.models import CanonicalNote, ForkRevision, UserNoteFork
from backend.app.workspace import DB, Contract, Me, Writes, note_by_slug, owned_fork, persist_fork

router = APIRouter()


class CanonicalMetadata(Contract):
    slugs: list[str] = Field(max_length=100)

    @field_validator("slugs")
    @classmethod
    def valid_slugs(cls, values):
        if any(not value or len(value) > 255 for value in values):
            raise ValueError("Invalid slug")
        return values


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
