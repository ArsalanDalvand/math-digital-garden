"""Comment and review-thread routes on canonical and personal library items."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import Field
from sqlalchemy import select

from backend.app.library.common import accessible
from backend.app.library_models import LibraryComment
from backend.app.models import User
from backend.app.workspace import DB, Contract, Me, Writes, note_by_slug

router = APIRouter()


def _comment_author(user: User | None) -> tuple[str, str]:
    if user is None:
        return ("عضو باغ", "student")
    name = (user.full_name or "").strip()
    if not name:
        name = "مؤلف" if user.role in {"author", "admin"} else "عضو باغ"
    return (name, user.role)


def _comment_dto(c: LibraryComment, author: User | None) -> dict[str, object]:
    author_name, author_role = _comment_author(author)
    return dict(
        id=c.id,
        content=c.content,
        user_id=c.user_id,
        author_name=author_name,
        author_role=author_role,
        created_at=c.created_at,
        parent_id=c.parent_id,
        resolved=c.resolved,
    )


class Comment(Contract):
    parent_id: UUID | None = None
    content: str = Field(min_length=1, max_length=10_000)


class Resolve(Contract):
    resolved: bool


async def comment_target(request: Request, db: DB, user: Me, token: str | None = None):
    slug = request.path_params.get("slug")
    if slug is not None:
        note = await note_by_slug(db, slug)
        return dict(note_id=note.id), True, user.role in {"author", "admin"}
    try:
        item_id = UUID(request.path_params["item_id"])
    except ValueError:
        raise HTTPException(422, "Invalid item ID") from None
    item = await accessible(db, item_id, user, token)
    return (
        dict(item_id=item_id),
        bool(item.published_hash),
        item.user_id == user.id or user.role == "admin",
    )


CommentTarget = Annotated[tuple, Depends(comment_target)]


@router.get("/canonical/{slug}/comments")
@router.get("/items/{item_id}/comments")
async def comments(
    target: CommentTarget,
    db: DB,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    filters = [getattr(LibraryComment, k) == v for k, v in target[0].items()]
    rows = (
        await db.execute(
            select(LibraryComment, User)
            .outerjoin(User, LibraryComment.user_id == User.id)
            .where(*filters)
            .order_by(LibraryComment.created_at, LibraryComment.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [_comment_dto(c, author) for c, author in rows]


@router.post("/canonical/{slug}/comments", status_code=201)
@router.post("/items/{item_id}/comments", status_code=201)
async def comment(target: CommentTarget, body: Comment, db: DB, user: Me, _: Writes):
    if not target[1]:
        raise HTTPException(409, "Publish or share before commenting")
    if body.parent_id:
        thread = await db.scalar(
            select(LibraryComment).filter_by(**target[0]).where(LibraryComment.id == body.parent_id)
        )
        if thread is None or thread.parent_id:
            raise HTTPException(422, "Reply must reference a page-level thread")
    entry = LibraryComment(
        **target[0], user_id=user.id, content=body.content, parent_id=body.parent_id
    )
    db.add(entry)
    await db.commit()
    return _comment_dto(entry, user)


@router.patch("/canonical/{slug}/comments/{comment_id}")
@router.patch("/items/{item_id}/comments/{comment_id}")
async def edit_comment(
    target: CommentTarget,
    comment_id: UUID,
    body: Comment,
    db: DB,
    user: Me,
    _: Writes,
):
    entry = await db.scalar(
        select(LibraryComment)
        .filter_by(**target[0])
        .where(
            LibraryComment.id == comment_id,
            LibraryComment.user_id == user.id,
        )
    )
    if entry is None:
        raise HTTPException(404, "Comment not found")
    entry.content = body.content
    await db.commit()
    return dict(id=entry.id, content=entry.content)


@router.delete("/canonical/{slug}/comments/{comment_id}", status_code=204)
@router.delete("/items/{item_id}/comments/{comment_id}", status_code=204)
async def delete_comment(target: CommentTarget, comment_id: UUID, db: DB, user: Me, _: Writes):
    entry = await db.scalar(
        select(LibraryComment)
        .filter_by(**target[0])
        .where(
            LibraryComment.id == comment_id,
            LibraryComment.user_id == user.id,
        )
    )
    if entry is None:
        raise HTTPException(404, "Comment not found")
    # Preserve replies when their author deletes the parent comment.
    entry.content = "[deleted]"
    await db.commit()
    return Response(status_code=204)


@router.put("/canonical/{slug}/comments/{comment_id}/resolve")
@router.put("/items/{item_id}/comments/{comment_id}/resolve")
async def resolve_comment(
    target: CommentTarget,
    comment_id: UUID,
    body: Resolve,
    db: DB,
    user: Me,
    _: Writes,
):
    if not target[2]:
        raise HTTPException(403, "Owner or admin required")
    entry = await db.scalar(
        select(LibraryComment)
        .filter_by(**target[0])
        .where(
            LibraryComment.id == comment_id,
            LibraryComment.parent_id.is_(None),
        )
    )
    if entry is None:
        raise HTTPException(404, "Thread not found")
    entry.resolved = body.resolved
    await db.commit()
    return dict(resolved=entry.resolved)
