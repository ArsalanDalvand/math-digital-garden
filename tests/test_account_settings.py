"""Isolated account API acceptance: no live database or environment URL used."""

import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import Session

from backend.app.account_settings import router
from backend.app.database import get_session
from backend.app.models import AuthSession, User
from backend.app.workspace import digest, passwords

output = BytesIO()
Image.new("RGBA", (2, 2), (255, 0, 0, 255)).save(output, format="PNG")
PNG = output.getvalue()
HEADERS = {"X-Requested-With": "MathGarden", "Origin": "http://test"}


@asynccontextmanager
async def isolated_database(tmp_path, postgres):
    if postgres:
        url = os.environ["TEST_DATABASE_URL"]
        assert url.split("?")[0].endswith("_test")
        engine = create_async_engine(url)
        async with engine.connect() as connection:
            transaction = await connection.begin()
            async with AsyncSession(
                bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
            ) as db:
                yield db
            await transaction.rollback()
        await engine.dispose()
        return
    engine = create_engine("sqlite:///" + str(tmp_path / "accounts.sqlite"))
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    User.__table__.create(engine)
    AuthSession.__table__.create(engine)

    class Database:
        # Real SQL persistence without adding an unused async SQLite driver.
        def __init__(self, session):
            self.session = session

        def expire_all(self):
            self.session.expire_all()

        def add(self, value):
            self.session.add(value)

        async def scalar(self, query):
            return self.session.scalar(query)

        async def execute(self, query):
            return self.session.execute(query)

        async def flush(self):
            self.session.flush()

        async def commit(self):
            self.session.commit()

        async def rollback(self):
            self.session.rollback()

    with Session(engine, expire_on_commit=False) as session:
        db = Database(session)
        yield db
    engine.dispose()


@pytest.fixture(
    params=[False, True] if os.environ.get("TEST_DATABASE_URL") else [False],
    ids=lambda value: "postgres" if value else "sqlite",
)
async def account(tmp_path, request):
    async with isolated_database(tmp_path, request.param) as db:
        users = []
        for token in ("alice", "bob"):
            user = User(
                id=uuid4(),
                email=token + "@example.org",
                full_name=token,
                role="student",
                password_hash=passwords.hash("original-password"),
            )
            db.add(user)
            await db.flush()
            users.append(user)
            db.add(
                AuthSession(
                    token_hash=digest(token),
                    user_id=user.id,
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                )
            )
        await db.commit()
        app = FastAPI()
        app.include_router(router)

        async def dependency():
            yield db

        app.dependency_overrides[get_session] = dependency
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers=HEADERS,
            cookies={"garden_session": "alice"},
        ) as client:
            yield client, db, users


async def test_profile_preferences_ownership_and_csrf(account):
    client, db, users = account
    assert (await client.get("/api/account")).json()["role"] == "student"
    response = await client.patch("/api/account/profile", json={"full_name": "  نام جدید  "})
    assert response.status_code == 200 and response.json()["full_name"] == "نام جدید"
    assert users[1].full_name == "bob"
    assert (
        await client.patch("/api/account/profile", json={"full_name": "x", "role": "admin"})
    ).status_code == 422
    assert (
        await client.patch(
            "/api/account/profile",
            json={"full_name": "x"},
            headers={"Origin": "https://evil.invalid"},
        )
    ).status_code == 403
    prefs = {
        "theme": "dark",
        "size": 22,
        "leading": 2.2,
        "width": 960,
        "focus": True,
        "default_mode": "read",
        "fixed_toolbar": False,
    }
    assert (await client.patch("/api/account/preferences", json=prefs)).status_code == 200
    db.expire_all()
    assert (await client.get("/api/account")).json()["preferences"] == prefs
    assert (
        await client.patch("/api/account/preferences", json={**prefs, "size": 999})
    ).status_code == 422
    client.cookies.clear()
    assert (await client.get("/api/account")).status_code == 401


async def test_avatar_validation_and_removal(account):
    client, _, _ = account
    assert (
        await client.put(
            "/api/account/avatar", content=b"<svg/>", headers={"Content-Type": "image/svg+xml"}
        )
    ).status_code == 415
    assert (
        await client.put(
            "/api/account/avatar", content=b"bad", headers={"Content-Type": "image/png"}
        )
    ).status_code == 422
    assert (
        await client.put(
            "/api/account/avatar", content=b"x" * 524289, headers={"Content-Type": "image/png"}
        )
    ).status_code == 413
    response = await client.put(
        "/api/account/avatar", content=PNG, headers={"Content-Type": "image/png"}
    )
    assert response.status_code == 200, response.text
    response = await client.get("/api/account/avatar")
    assert response.status_code == 200 and response.content.startswith(b"\x89PNG")
    assert response.headers["cache-control"] == "no-store"
    client.cookies.set("garden_session", "bob")
    assert (await client.get("/api/account/avatar")).status_code == 404
    client.cookies.set("garden_session", "alice")
    assert (await client.delete("/api/account/avatar")).status_code == 200
    assert (await client.get("/api/account/avatar")).status_code == 404


async def test_credentials_require_password_and_revoke_other_sessions(account):
    client, db, users = account
    assert (
        await client.patch(
            "/api/account/email",
            json={"email": "new@example.org", "current_password": "wrong-password"},
        )
    ).status_code == 403
    assert (
        await client.patch(
            "/api/account/email",
            json={"email": "bob@example.org", "current_password": "original-password"},
        )
    ).status_code == 409
    assert (
        await client.patch(
            "/api/account/email",
            json={"email": "new@example.org", "current_password": "original-password"},
        )
    ).status_code == 200
    db.add(
        AuthSession(
            token_hash=digest("other"),
            user_id=users[0].id,
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
    )
    await db.commit()
    assert (
        await client.patch(
            "/api/account/password",
            json={"current_password": "original-password", "password": "replacement-password"},
        )
    ).status_code == 200
    assert passwords.verify("replacement-password", users[0].password_hash)
    client.cookies.set("garden_session", "other")
    assert (await client.get("/api/account")).status_code == 401


async def test_avatar_pixel_bounds_metadata_and_actual_decode(account):
    client, _, _ = account
    output = BytesIO()
    Image.new("RGB", (513, 1)).save(output, format="PNG")
    assert (
        await client.put(
            "/api/account/avatar", content=output.getvalue(), headers={"Content-Type": "image/png"}
        )
    ).status_code == 422
    assert (
        await client.put(
            "/api/account/avatar", content=PNG[:-12], headers={"Content-Type": "image/png"}
        )
    ).status_code == 422
    from PIL.PngImagePlugin import PngInfo

    info = PngInfo()
    info.add_text("private", "must not persist")
    output = BytesIO()
    Image.new("RGB", (2, 2)).save(output, format="PNG", pnginfo=info)
    assert (
        await client.put(
            "/api/account/avatar", content=output.getvalue(), headers={"Content-Type": "image/png"}
        )
    ).status_code == 200
    image = Image.open(BytesIO((await client.get("/api/account/avatar")).content))
    assert not image.info


async def test_preference_write_rejects_changed_session_owner(account):
    client, _, users = account
    response = await client.patch(
        "/api/account/preferences", json={"theme": "dark", "expected_user_id": str(users[1].id)}
    )
    assert response.status_code == 409
    assert (await client.get("/api/account")).json()["preferences"]["theme"] == "light"
    response = await client.patch(
        "/api/account/preferences", json={"theme": "dark", "expected_user_id": str(users[0].id)}
    )
    assert response.status_code == 200
    assert "expected_user_id" not in response.json()["preferences"]
