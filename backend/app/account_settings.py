"""Account changes scoped exclusively to the authenticated session owner."""

import json
from io import BytesIO
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from PIL import Image, UnidentifiedImageError
from pydantic import EmailStr, Field, ValidationError, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from backend.app.models import AuthSession, User
from backend.app.workspace import (
    DB,
    Contract,
    Me,
    digest,
    limiter,
    passwords,
    user_json,
    write_guard,
)

router = APIRouter(prefix="/api/account")
MAX_AVATAR = 512 * 1024


class Preferences(Contract):
    theme: Literal["light", "dark", "system"] = "light"
    size: int = Field(default=19, ge=16, le=26)
    leading: float = Field(default=2, ge=1.5, le=2.5)
    width: Literal[620, 760, 960] = 760
    focus: bool = False
    default_mode: Literal["read", "edit"] = "read"
    fixed_toolbar: bool = True


class PreferencesChange(Preferences):
    expected_user_id: UUID | None = None


class Profile(Contract):
    full_name: str = Field(min_length=1, max_length=255)

    @field_validator("full_name")
    @classmethod
    def name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(char) < 32 for char in value):
            raise ValueError("Name is required and cannot contain control characters")
        return value


class EmailChange(Contract):
    email: EmailStr
    current_password: str = Field(min_length=1, max_length=256)


class PasswordChange(Contract):
    current_password: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=12, max_length=256)


def account_json(user: User) -> dict[str, object]:
    try:
        preferences = Preferences.model_validate_json(user.preferences_json or "{}")
    except (ValueError, ValidationError):
        preferences = Preferences()
    return {
        **user_json(user),
        "avatar_url": "/api/account/avatar" if user.avatar_png else None,
        "preferences": preferences.model_dump(),
    }


@router.get("")
async def account(user: Me, response: Response) -> dict[str, object]:
    response.headers["Cache-Control"] = "no-store"
    return account_json(user)


@router.patch("/profile", dependencies=[Depends(write_guard)])
async def profile(data: Profile, user: Me, db: DB) -> dict[str, object]:
    user.full_name = data.full_name
    await db.commit()
    return account_json(user)


async def verify_password(user: User, value: str) -> None:
    if not await run_in_threadpool(passwords.verify, value, user.password_hash):
        raise HTTPException(403, "Current password is incorrect")


@router.patch("/email", dependencies=[Depends(write_guard)])
@limiter.limit("10/minute")
async def email(request: Request, data: EmailChange, user: Me, db: DB) -> dict[str, object]:
    await verify_password(user, data.current_password)
    address = str(data.email).lower()
    if await db.scalar(select(User.id).where(User.email == address, User.id != user.id)):
        raise HTTPException(409, "Email unavailable")
    user.email = address
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Email unavailable") from None
    return account_json(user)


@router.patch("/password", dependencies=[Depends(write_guard)])
@limiter.limit("10/minute")
async def password(data: PasswordChange, request: Request, user: Me, db: DB) -> dict[str, object]:
    await verify_password(user, data.current_password)
    user.password_hash = await run_in_threadpool(passwords.hash, data.password)
    await db.execute(
        delete(AuthSession).where(
            AuthSession.user_id == user.id,
            AuthSession.token_hash != digest(request.cookies.get("garden_session", "")),
        )
    )
    await db.commit()
    return {"saved": True}


def validate_avatar(data: bytes) -> bytes:
    try:
        with Image.open(BytesIO(data), formats=["PNG", "JPEG", "WEBP"]) as image:
            if image.width > 512 or image.height > 512 or getattr(image, "n_frames", 1) != 1:
                raise ValueError
            image.verify()
        with Image.open(BytesIO(data), formats=["PNG", "JPEG", "WEBP"]) as image:
            image.load()
            output = BytesIO()
            pixels = image.convert("RGBA")
            pixels.info.clear()
            pixels.save(output, format="PNG")
            return output.getvalue()
    except (ValueError, OSError, SyntaxError, UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(422, "Use a valid raster image up to 512 by 512 pixels") from None


@router.put("/avatar", dependencies=[Depends(write_guard)])
async def avatar_upload(request: Request, user: Me, db: DB) -> dict[str, object]:
    if request.headers.get("content-type", "").split(";")[0] not in {
        "image/png",
        "image/jpeg",
        "image/webp",
    }:
        raise HTTPException(415, "PNG, JPEG or WebP image required")
    data = bytearray()
    async for part in request.stream():
        data.extend(part)
        if len(data) > MAX_AVATAR:
            raise HTTPException(413, "Avatar must be at most 512 KiB")
    user.avatar_png = await run_in_threadpool(validate_avatar, bytes(data))
    await db.commit()
    return account_json(user)


@router.get("/avatar")
async def avatar(user: Me) -> Response:
    if not user.avatar_png:
        raise HTTPException(404, "No avatar")
    return Response(
        content=user.avatar_png,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.delete("/avatar", dependencies=[Depends(write_guard)])
async def avatar_remove(user: Me, db: DB) -> dict[str, object]:
    user.avatar_png = None
    await db.commit()
    return account_json(user)


@router.patch("/preferences", dependencies=[Depends(write_guard)])
async def preferences(data: PreferencesChange, user: Me, db: DB) -> dict[str, object]:
    if data.expected_user_id is not None and data.expected_user_id != user.id:
        raise HTTPException(409, "Account changed; reload before saving preferences")
    user.preferences_json = json.dumps(data.model_dump(exclude={"expected_user_id"}))
    await db.commit()
    return account_json(user)
