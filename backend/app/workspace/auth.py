"""Authentication session routes: register, login, current identity, logout."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.config import settings
from backend.app.models import AuthSession, User
from backend.app.workspace.security import (
    DB,
    DUMMY_HASH,
    Contract,
    Me,
    digest,
    limiter,
    passwords,
    user_json,
    write_guard,
)

router = APIRouter()


class Credentials(Contract):
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)


class Registration(Credentials):
    full_name: str | None = Field(default=None, max_length=255)


async def issue_session(
    db: AsyncSession, user: User, response: Response, request: Request
) -> None:
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
    response.delete_cookie(
        "garden_session",
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )
