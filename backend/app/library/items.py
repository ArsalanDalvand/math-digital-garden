"""Personal library items, revisions, watchlists, favorites, and verification routes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field, field_validator
from sqlalchemy import and_, or_, select, update

from backend.app.library.common import (
    accessible,
    collect_folder_tree_and_notes,
    dto,
    owned,
    parent,
    save_content,
    subscription_link,
    subscriptions,
    validate_safe_name,
)
from backend.app.library_models import (
    LibraryCanonical,
    LibraryFavorite,
    LibraryGitSource,
    LibraryItem,
    LibraryRevision,
    LibraryWatch,
)
from backend.app.models import CanonicalNote, User
from backend.app.workspace import DB, Contract, Me, Writes, digest

router = APIRouter()


class CreateItem(Contract):
    kind: Literal["folder", "note"]
    title: str = Field(min_length=1, max_length=255)
    parent_id: UUID | None = None
    content: str = Field(default="", max_length=2_000_000)

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str) -> str:
        return validate_safe_name(value)


class EditItem(Contract):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: UUID | None = None
    content: str | None = Field(default=None, max_length=2_000_000)
    expected_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        return validate_safe_name(value) if value is not None else None


class Expected(Contract):
    expected_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class Watch(Contract):
    watching: bool


class Verification(Contract):
    verified: bool


class Favorite(Contract):
    favorite: bool


def watch_hash(item: LibraryItem, user: User) -> str:
    title = item.title if item.user_id == user.id else item.published_title
    content_hash = item.current_hash if item.user_id == user.id else item.published_hash
    return digest((title or "") + "\0" + (content_hash or ""))


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


@router.get("/items/{item_id}")
async def read_item(item_id: UUID, db: DB, user: Me, note: str | None = None):
    item = await owned(db, user.id, item_id)
    meta_rows = (
        await db.execute(
            select(
                LibraryItem.id,
                LibraryItem.parent_id,
                LibraryItem.kind,
                LibraryItem.title,
                LibraryItem.published_title,
            ).where(
                LibraryItem.user_id == user.id,
                LibraryItem.trashed_at.is_(None),
            )
        )
    ).all()
    item_map = {it.id: it for it in meta_rows}

    if item.kind == "folder":
        tree, flat_notes, path_map = collect_folder_tree_and_notes(
            item.id, list(meta_rows), use_published=False
        )
        git_source = await db.scalar(
            select(LibraryGitSource).where(
                LibraryGitSource.item_id == item.id,
                LibraryGitSource.user_id == user.id,
            )
        )
        descendants = [it for it in meta_rows if it.id in path_map]
        descendant_ids = set(path_map.keys())

        target_id: UUID | None = None
        if note:
            try:
                target_uuid = UUID(note)
                if target_uuid in descendant_ids:
                    candidate = item_map.get(target_uuid)
                    if candidate is not None and candidate.kind == "note":
                        target_id = candidate.id
            except (ValueError, TypeError):
                pass

        if target_id is None:
            notes = [it for it in descendants if it.kind == "note"]
            chosen = next(
                (n for n in notes if n.title.lower() in ("readme", "راهنما", "index")),
                notes[0] if notes else None,
            )
            if chosen is not None:
                target_id = chosen.id

        target_note = await db.get(LibraryItem, target_id) if target_id is not None else None

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
        _, flat_notes, path_map = collect_folder_tree_and_notes(
            root_folder.id, list(meta_rows), use_published=False
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


@router.get("/items/{item_id}/watch")
async def watching(item_id: UUID, db: DB, user: Me, token: str | None = None):
    item = await accessible(db, item_id, user, token)
    watch_entry = await db.get(LibraryWatch, (item_id, user.id))
    visible_hash = watch_hash(item, user)
    return dict(
        watching=watch_entry is not None,
        updated=bool(watch_entry and watch_entry.seen_hash != visible_hash),
    )


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
async def verify(
    item_id: UUID, body: Verification, db: DB, user: Me, _: Writes, token: str | None = None
):
    if user.role != "admin":
        raise HTTPException(403, "Admin role required")
    item = await accessible(db, item_id, user, token, lock=True)
    if not item.published_hash:
        raise HTTPException(409, "Published snapshot required")
    item.verified_hash = item.published_hash if body.verified else None
    item.verified_by = user.id if body.verified else None
    item.verified_at = datetime.now(UTC) if body.verified else None
    await db.commit()
    return dict(verified=body.verified)


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
