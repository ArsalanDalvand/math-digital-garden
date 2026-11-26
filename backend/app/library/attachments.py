"""Personal and published library attachment upload/list/download/delete routes."""

from __future__ import annotations

import base64
import binascii
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import Field, field_validator
from sqlalchemy import select

from backend.app.library.common import owned, validate_safe_name
from backend.app.library.sharing import public_item
from backend.app.library_models import LibraryAttachment
from backend.app.workspace import DB, Contract, Me, Writes

router = APIRouter()


class Attachment(Contract):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(max_length=7_000_000)

    @field_validator("filename")
    @classmethod
    def valid_filename(cls, value: str) -> str:
        return validate_safe_name(value)


@router.post("/items/{item_id}/attachments", status_code=201)
async def upload(item_id: UUID, body: Attachment, db: DB, user: Me, _: Writes):
    item = await owned(db, user.id, item_id, lock=True)
    if item.kind != "note":
        raise HTTPException(422, "Not a note")
    try:
        data = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "Invalid base64") from None
    if not data or len(data) > 5_000_000:
        raise HTTPException(413, "Attachment must be between 1 byte and 5 MB")
    attachment = LibraryAttachment(
        item_id=item_id, user_id=user.id, filename=body.filename, data=data
    )
    db.add(attachment)
    await db.commit()
    return dict(id=attachment.id, filename=attachment.filename, size=len(data))


@router.get("/items/{item_id}/attachments")
async def attachments(
    item_id: UUID,
    db: DB,
    user: Me,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    await owned(db, user.id, item_id)
    rows = (
        await db.scalars(
            select(LibraryAttachment)
            .where(LibraryAttachment.item_id == item_id, LibraryAttachment.user_id == user.id)
            .order_by(LibraryAttachment.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [dict(id=a.id, filename=a.filename, size=len(a.data or b"")) for a in rows]


@router.get("/attachments/{attachment_id}")
async def download(attachment_id: UUID, db: DB, user: Me):
    attachment = await db.scalar(
        select(LibraryAttachment).where(
            LibraryAttachment.id == attachment_id, LibraryAttachment.user_id == user.id
        )
    )
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    await owned(db, user.id, attachment.item_id)
    return Response(
        attachment.data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(attachment.filename, safe=""),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(attachment_id: UUID, db: DB, user: Me, _: Writes):
    attachment = await db.scalar(
        select(LibraryAttachment).where(
            LibraryAttachment.id == attachment_id, LibraryAttachment.user_id == user.id
        )
    )
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    await owned(db, user.id, attachment.item_id)
    await db.delete(attachment)
    await db.commit()
    return Response(status_code=204)


@router.get("/public/{item_id}/attachments")
async def published_attachments(
    item_id: UUID,
    db: DB,
    token: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    page = await public_item(db, token=token) if token else await public_item(db, item_id=item_id)
    if page["id"] != item_id:
        raise HTTPException(404, "Page not found")
    rows = (
        await db.scalars(
            select(LibraryAttachment)
            .where(LibraryAttachment.item_id == item_id, LibraryAttachment.published.is_(True))
            .order_by(LibraryAttachment.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [dict(id=a.id, filename=a.filename, size=len(a.data or b"")) for a in rows]


@router.get("/public/{item_id}/attachments/{attachment_id}")
async def published_download(
    item_id: UUID, attachment_id: UUID, db: DB, token: str | None = None
):
    page = await public_item(db, token=token) if token else await public_item(db, item_id=item_id)
    if page["id"] != item_id:
        raise HTTPException(404, "Page not found")
    attachment = await db.scalar(
        select(LibraryAttachment).where(
            LibraryAttachment.id == attachment_id,
            LibraryAttachment.item_id == item_id,
            LibraryAttachment.published.is_(True),
        )
    )
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    return Response(
        attachment.data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(attachment.filename, safe=""),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )
