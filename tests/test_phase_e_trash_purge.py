"""Phase E backend TDD tests: permanent delete & empty trash with Zero IDOR and disk cleanup."""

from __future__ import annotations

import base64
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from backend.app.config import settings
from backend.app.database import get_session
from backend.app.library import router as library_router
from backend.app.library_models import (
    LibraryAttachment,
    LibraryCanonical,
    LibraryComment,
    LibraryFavorite,
    LibraryGitSource,
    LibraryItem,
    LibraryRevision,
    LibraryWatch,
)
from backend.app.models import AuthSession, User
from backend.app.workspace import current_user

HEADERS = {"X-Requested-With": "MathGarden", "Origin": "http://test"}


@asynccontextmanager
async def sqlite_env(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "phase_e_trash.sqlite"))
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS canonical_notes "
            "(id CHAR(32) PRIMARY KEY, slug VARCHAR(255) UNIQUE)"
        )
    for tbl in (
        User.__table__,
        AuthSession.__table__,
        LibraryItem.__table__,
        LibraryRevision.__table__,
        LibraryCanonical.__table__,
        LibraryAttachment.__table__,
        LibraryComment.__table__,
        LibraryWatch.__table__,
        LibraryFavorite.__table__,
        LibraryGitSource.__table__,
    ):
        tbl.create(engine)

    class AsyncDbShim:
        def __init__(self, session: Session):
            self.session = session

        def add(self, obj):
            self.session.add(obj)

        def add_all(self, objs):
            self.session.add_all(objs)

        async def flush(self):
            self.session.flush()

        async def commit(self):
            self.session.commit()

        async def refresh(self, obj):
            self.session.refresh(obj)

        async def delete(self, obj):
            self.session.delete(obj)

        async def execute(self, stmt, *args, **kwargs):
            return self.session.execute(stmt, *args, **kwargs)

        async def scalar(self, stmt, *args, **kwargs):
            return self.session.scalar(stmt, *args, **kwargs)

        async def scalars(self, stmt, *args, **kwargs):
            return self.session.scalars(stmt, *args, **kwargs)

    with Session(engine) as sync_sess:
        db = AsyncDbShim(sync_sess)
        users = [
            User(
                id=uuid4(),
                email=f"u{i}@example.org",
                role="student",
                password_hash="unused",
            )
            for i in range(2)
        ]
        db.add_all(users)
        await db.commit()

        app = FastAPI()
        app.include_router(library_router)

        async def get_db():
            yield db

        async def get_user(request: Request):
            idx = int(request.headers.get("x-test-user", "0"))
            return users[idx]

        app.dependency_overrides[get_session] = get_db
        app.dependency_overrides[current_user] = get_user

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers=HEADERS,
        ) as client:
            yield client, db, users

    engine.dispose()


@pytest.mark.asyncio
async def test_permanent_delete_requires_trashed_and_enforces_idor(tmp_path, monkeypatch):
    att_dir = tmp_path / "attachments"
    att_dir.mkdir()
    monkeypatch.setattr(settings, "attachments_dir", str(att_dir))

    async with sqlite_env(tmp_path) as (client, db, users):
        folder = (
            await client.post("/api/library/items", json={"kind": "folder", "title": "پوشه"})
        ).json()
        note = (
            await client.post(
                "/api/library/items",
                json={"kind": "note", "title": "یادداشت", "parent_id": folder["id"]},
            )
        ).json()
        att = (
            await client.post(
                f"/api/library/items/{note['id']}/attachments",
                json={
                    "filename": "proof.txt",
                    "content_base64": base64.b64encode(b"hello math").decode(),
                },
            )
        ).json()
        assert (
            await client.put(
                f"/api/library/items/{note['id']}/publication",
                json={"visibility": "public"},
            )
        ).status_code == 200
        c1_res = await client.post(
            f"/api/library/items/{note['id']}/comments",
            json={"content": "first"},
        )
        assert c1_res.status_code == 201
        c1 = c1_res.json()
        assert (
            await client.post(
                f"/api/library/items/{note['id']}/comments",
                json={"content": "reply", "parent_id": c1["id"]},
            )
        ).status_code == 201

        # Active item cannot be permanently deleted
        resp_active = await client.delete(f"/api/library/items/{note['id']}")
        assert resp_active.status_code == 409

        # Trash the folder subtree
        assert (
            await client.post(f"/api/library/items/{folder['id']}/trash?subtree=true")
        ).status_code == 200

        # Another user cannot permanently delete it (IDOR)
        resp_other = await client.delete(
            f"/api/library/items/{folder['id']}", headers={"x-test-user": "1"}
        )
        assert resp_other.status_code == 404

        # Owner permanently deletes the trashed folder subtree
        resp_del = await client.delete(f"/api/library/items/{folder['id']}")
        assert resp_del.status_code == 204

        remaining_items = (
            await db.scalars(select(LibraryItem).where(LibraryItem.user_id == users[0].id))
        ).all()
        assert remaining_items == []
        remaining_atts = (
            await db.scalars(
                select(LibraryAttachment).where(LibraryAttachment.id == UUID(att["id"]))
            )
        ).all()
        assert remaining_atts == []
        assert list(att_dir.rglob("*")) == [p for p in att_dir.rglob("*") if p.is_dir()]


@pytest.mark.asyncio
async def test_empty_trash_purges_only_current_users_trashed_items(tmp_path):
    async with sqlite_env(tmp_path) as (client, db, users):
        keep_active = (
            await client.post("/api/library/items", json={"kind": "note", "title": "فعال"})
        ).json()
        trash_note = (
            await client.post("/api/library/items", json={"kind": "note", "title": "حذفی"})
        ).json()
        assert (
            await client.post(f"/api/library/items/{trash_note['id']}/trash")
        ).status_code == 200

        other_trash = (
            await client.post(
                "/api/library/items",
                json={"kind": "note", "title": "حذفی کاربر دو"},
                headers={"x-test-user": "1"},
            )
        ).json()
        assert (
            await client.post(
                f"/api/library/items/{other_trash['id']}/trash",
                headers={"x-test-user": "1"},
            )
        ).status_code == 200

        res = await client.delete("/api/library/trash")
        assert res.status_code == 200
        assert res.json()["deleted"] == 1

        u0_items = (
            await db.scalars(select(LibraryItem).where(LibraryItem.user_id == users[0].id))
        ).all()
        assert [str(i.id) for i in u0_items] == [keep_active["id"]]

        u1_items = (
            await db.scalars(select(LibraryItem).where(LibraryItem.user_id == users[1].id))
        ).all()
        assert [str(i.id) for i in u1_items] == [other_trash["id"]]
