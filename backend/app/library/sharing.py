"""Publication snapshots and unlisted/public reader routes."""

from __future__ import annotations

import secrets
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.library.common import (
    ancestors,
    collect_folder_tree_and_notes,
    dto,
    owned,
)
from backend.app.library_models import LibraryAttachment, LibraryItem
from backend.app.workspace import DB, Contract, Me, Writes

router = APIRouter()


class Publication(Contract):
    visibility: Literal["private", "unlisted", "public"]
    rotate_token: bool = True


def _next_share_token(item: LibraryItem, visibility: str, rotate_token: bool) -> str | None:
    if visibility != "unlisted":
        return None
    if rotate_token or not item.share_token:
        return secrets.token_urlsafe(32)
    return item.share_token


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
        item.share_token = _next_share_token(item, body.visibility, body.rotate_token)
        item.published_title = item.title if body.visibility != "private" else None
        item.published_content = item.content if body.visibility != "private" else None
        item.published_hash = item.current_hash if body.visibility != "private" else None
    elif item.kind == "folder":
        item.visibility = body.visibility
        item.share_token = _next_share_token(item, body.visibility, body.rotate_token)
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
                        desc.published_hash = "folder" if body.visibility != "private" else None
                    next_frontier.append(desc.id)
            frontier = next_frontier

    await db.commit()
    return dto(item)


async def public_item(db: AsyncSession, *, item_id=None, token=None, note_id=None):
    query = select(LibraryItem).where(LibraryItem.published_hash.is_not(None))
    query = (
        query.where(LibraryItem.share_token == token, LibraryItem.visibility == "unlisted")
        if token
        else query.where(LibraryItem.id == item_id, LibraryItem.visibility == "public")
    )
    item = await db.scalar(query)
    if item is None:
        raise HTTPException(404, "Page not found")

    await ancestors(db, item, item.user_id)
    if item.kind == "note":
        return dto(item, public=True)

    meta_rows = (
        await db.execute(
            select(
                LibraryItem.id,
                LibraryItem.parent_id,
                LibraryItem.kind,
                LibraryItem.title,
                LibraryItem.published_title,
            ).where(
                LibraryItem.user_id == item.user_id,
                LibraryItem.trashed_at.is_(None),
                LibraryItem.published_hash.is_not(None),
            )
        )
    ).all()

    tree, flat_notes, path_map = collect_folder_tree_and_notes(
        item.id, list(meta_rows), use_published=True
    )
    descendant_ids = set(path_map.keys())

    target_id: UUID | None = None
    if note_id:
        try:
            target_uuid = UUID(note_id) if isinstance(note_id, str) else note_id
            if target_uuid in descendant_ids:
                meta = next(
                    (it for it in meta_rows if it.id == target_uuid and it.kind == "note"),
                    None,
                )
                if meta is not None:
                    target_id = meta.id
        except (ValueError, TypeError):
            pass

    if target_id is None:
        notes = [it for it in meta_rows if it.id in descendant_ids and it.kind == "note"]
        chosen = next(
            (n for n in notes if n.title.lower() in ("readme", "راهنما", "index")),
            notes[0] if notes else None,
        )
        if chosen is not None:
            target_id = chosen.id

    target_note = await db.get(LibraryItem, target_id) if target_id is not None else None

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
