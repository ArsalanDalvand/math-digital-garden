"""Shared helpers, validators, and ownership/tree queries for personal library."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, Response
from sqlalchemy import and_, exists, literal, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from backend.app.library_models import (
    LibraryCanonical,
    LibraryItem,
    LibraryRevision,
)
from backend.app.models import CanonicalNote
from backend.app.workspace import digest, owned_fork, persist_fork


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def validate_safe_name(value: str) -> str:
    if (
        not value.strip()
        or value in {".", ".."}
        or any(ord(char) < 32 for char in value)
        or any(char in value for char in "/\\")
    ):
        raise ValueError("Invalid name")
    return value


def dto(item: LibraryItem, public: bool = False) -> dict:
    result = dict(
        id=item.id,
        kind=item.kind,
        title=item.published_title if public else item.title,
        content=item.published_content if public else item.content,
        current_hash=item.published_hash if public else item.current_hash,
        verified=bool(item.published_hash and item.verified_hash == item.published_hash),
        verified_by=item.verified_by,
        verified_at=item.verified_at,
    )
    if not public:
        result.update(
            parent_id=item.parent_id,
            updated_at=item.updated_at,
            trashed_at=item.trashed_at,
            visibility=item.visibility,
            share_token=item.share_token,
            published_hash=item.published_hash,
            canonical_slug=getattr(item, "canonical_slug", None),
        )
    return result


async def _ancestor_chain_rows(db: AsyncSession, item: LibraryItem, user_id: UUID):
    if not item.parent_id:
        return []
    base = select(
        LibraryItem.id,
        LibraryItem.parent_id,
        LibraryItem.trashed_at,
        LibraryItem.visibility,
        LibraryItem.share_token,
        LibraryItem.published_hash,
        literal(1).label("depth"),
    ).where(LibraryItem.id == item.parent_id, LibraryItem.user_id == user_id)
    tree = base.cte("ancestor_tree", recursive=True)
    parent_alias = aliased(LibraryItem)
    tree = tree.union_all(
        select(
            parent_alias.id,
            parent_alias.parent_id,
            parent_alias.trashed_at,
            parent_alias.visibility,
            parent_alias.share_token,
            parent_alias.published_hash,
            (tree.c.depth + 1).label("depth"),
        )
        .join(tree, parent_alias.id == tree.c.parent_id)
        .where(parent_alias.user_id == user_id, tree.c.depth < 50)
    )
    return (await db.execute(select(tree))).fetchall()


async def ancestors(db: AsyncSession, item: LibraryItem | None, user_id: UUID, forbidden=None):
    if item is None:
        return
    if item.id == forbidden:
        raise HTTPException(409, "Folder cycle")
    if item.trashed_at is not None:
        raise HTTPException(404, "Item not found")
    if not item.parent_id:
        return

    rows = await _ancestor_chain_rows(db, item, user_id)
    seen = {item.id}
    for row in rows:
        if row.id in seen or row.id == forbidden:
            raise HTTPException(409, "Folder cycle")
        seen.add(row.id)
        if row.trashed_at is not None:
            raise HTTPException(404, "Item not found")


async def _matches_ancestor_share_token(
    db: AsyncSession, item: LibraryItem, token: str | None
) -> bool:
    if not token or not item.parent_id:
        return False
    rows = await _ancestor_chain_rows(db, item, item.user_id)
    seen = {item.id}
    for row in rows:
        if row.id in seen or row.trashed_at is not None:
            return False
        seen.add(row.id)
        if (
            row.visibility == "unlisted"
            and row.published_hash
            and row.share_token
            and secrets.compare_digest(row.share_token.encode(), token.encode())
        ):
            return True
    return False


async def owned(db: AsyncSession, user_id: UUID, item_id: UUID, *, active=True, lock=False):
    association = await db.scalar(
        select(LibraryCanonical).where(
            LibraryCanonical.item_id == item_id, LibraryCanonical.user_id == user_id
        )
    )
    if association is not None and lock:
        # All linked writes follow the fork writer's canonical -> fork -> item order.
        await db.scalar(
            select(CanonicalNote.id)
            .where(CanonicalNote.id == association.note_id)
            .with_for_update()
        )
        await owned_fork(db, association.note_id, user_id, lock=True)
    query = select(LibraryItem).where(LibraryItem.id == item_id, LibraryItem.user_id == user_id)
    item = await db.scalar(
        query.with_for_update().execution_options(populate_existing=True) if lock else query
    )
    if item is None:
        raise HTTPException(404, "Item not found")
    if active:
        await ancestors(db, item, user_id)
    if association is not None:
        item.canonical_slug = await db.scalar(
            select(CanonicalNote.slug).where(CanonicalNote.id == association.note_id)
        )
    return item


async def parent(db: AsyncSession, user_id: UUID, parent_id: UUID | None, forbidden=None):
    if parent_id is not None:
        item = await owned(db, user_id, parent_id)
        if item.kind != "folder":
            raise HTTPException(422, "Parent must be a folder")
        await ancestors(db, item, user_id, forbidden)


async def accessible(db: AsyncSession, item_id: UUID, user, token=None, *, lock=False):
    query = select(LibraryItem).where(LibraryItem.id == item_id)
    item = await db.scalar(query.with_for_update() if lock else query)
    if item is None:
        raise HTTPException(404, "Item not found")
    await ancestors(db, item, item.user_id)
    if item.user_id != user.id:
        direct_unlisted = (
            item.visibility == "unlisted"
            and bool(token)
            and bool(item.share_token)
            and secrets.compare_digest((item.share_token or "").encode(), token.encode())
        )
        folder_unlisted = (
            item.visibility == "unlisted"
            and bool(token)
            and await _matches_ancestor_share_token(db, item, token)
        )
        if not (
            item.published_hash
            and (item.visibility == "public" or direct_unlisted or folder_unlisted)
        ):
            raise HTTPException(404, "Item not found")
    return item


def collect_folder_tree_and_notes(
    root_folder_id: UUID,
    items: list[LibraryItem],
    use_published: bool = False,
) -> tuple[list[dict], list[dict[str, str]], dict[UUID, str]]:
    children_map: dict[UUID, list[LibraryItem]] = {}
    for it in items:
        if it.parent_id is not None:
            children_map.setdefault(it.parent_id, []).append(it)

    flat_notes: list[dict[str, str]] = []
    path_map: dict[UUID, str] = {}

    def build_tree(pid: UUID, current_path: str = "") -> list[dict]:
        nodes = []
        for ch in sorted(children_map.get(pid, []), key=lambda x: x.title):
            node_title = (ch.published_title if use_published else None) or ch.title
            node_path = f"{current_path}/{node_title}" if current_path else node_title
            path_map[ch.id] = node_path
            node = {
                "id": str(ch.id),
                "title": node_title,
                "kind": ch.kind,
                "path": node_path,
            }
            if ch.kind == "folder":
                node["children"] = build_tree(ch.id, node_path)
            else:
                flat_notes.append(
                    {
                        "id": str(ch.id),
                        "title": node_title,
                        "path": node_path,
                    }
                )
            nodes.append(node)
        return nodes

    tree = build_tree(root_folder_id)
    return tree, flat_notes, path_map


async def save_content(db: AsyncSession, user, item: LibraryItem, content: str, expected_hash):
    if item.kind != "note":
        raise HTTPException(422, "Not a note")
    association = await db.scalar(
        select(LibraryCanonical).where(
            LibraryCanonical.item_id == item.id, LibraryCanonical.user_id == user.id
        )
    )
    if association is not None:
        fork = await owned_fork(db, association.note_id, user.id, lock=True)
        if fork is None or fork.current_hash != expected_hash:
            raise HTTPException(409, "Note changed; reload before saving")
        await persist_fork(db, fork, content, commit=False)
        return
    changed = await db.execute(
        update(LibraryItem)
        .where(
            LibraryItem.id == item.id,
            LibraryItem.user_id == user.id,
            LibraryItem.current_hash == expected_hash,
        )
        .values(content=content, current_hash=digest(content), updated_at=datetime.now(UTC))
    )
    if changed.rowcount != 1:
        raise HTTPException(409, "Note changed; reload before saving")
    item.verified_hash = None
    item.verified_by = None
    item.verified_at = None
    db.add(
        LibraryRevision(
            user_id=user.id, item_id=item.id, content=content, content_hash=digest(content)
        )
    )


async def subscriptions(db: AsyncSession, user, model, offset: int, limit: int):
    hidden = select(LibraryItem.id).where(LibraryItem.trashed_at.is_not(None)).cte(recursive=True)
    hidden = hidden.union_all(
        select(LibraryItem.id).join(hidden, LibraryItem.parent_id == hidden.c.id)
    )
    unlisted_ancestors = (
        select(
            LibraryItem.id,
            LibraryItem.share_token,
            literal(1).label("depth"),
        )
        .where(
            LibraryItem.visibility == "unlisted",
            LibraryItem.published_hash.is_not(None),
            LibraryItem.share_token.is_not(None),
            LibraryItem.trashed_at.is_(None),
        )
        .cte("unlisted_ancestors", recursive=True)
    )
    unlisted_child = aliased(LibraryItem)
    unlisted_ancestors = unlisted_ancestors.union_all(
        select(
            unlisted_child.id,
            unlisted_ancestors.c.share_token,
            (unlisted_ancestors.c.depth + 1).label("depth"),
        )
        .join(unlisted_ancestors, unlisted_child.parent_id == unlisted_ancestors.c.id)
        .where(unlisted_child.trashed_at.is_(None), unlisted_ancestors.c.depth < 50)
    )
    return (
        await db.execute(
            select(LibraryItem, model)
            .join(model, model.item_id == LibraryItem.id)
            .where(
                model.user_id == user.id,
                LibraryItem.id.not_in(select(hidden.c.id)),
                or_(
                    LibraryItem.user_id == user.id,
                    and_(
                        LibraryItem.published_hash.is_not(None),
                        or_(
                            LibraryItem.visibility == "public",
                            and_(
                                LibraryItem.visibility == "unlisted",
                                or_(
                                    model.access_token == LibraryItem.share_token,
                                    exists(
                                        select(literal(1)).where(
                                            unlisted_ancestors.c.id == LibraryItem.id,
                                            unlisted_ancestors.c.share_token == model.access_token,
                                        )
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            )
            .order_by(LibraryItem.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()


def subscription_link(item: LibraryItem, user, entry) -> str:
    if item.user_id == user.id:
        return "/library/" + str(item.id)
    if item.visibility == "unlisted":
        token = getattr(entry, "access_token", None) or item.share_token or ""
        if item.kind == "note" and not item.share_token:
            return f"/shared/{token}?note={item.id}"
        return "/shared/" + token
    return "/published/" + str(item.id)
