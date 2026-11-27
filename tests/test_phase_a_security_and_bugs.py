"""Phase A backend TDD regression tests: security, crashes, sharing, import & proxy limiter."""

from __future__ import annotations

import base64
import tempfile
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from backend.app.account_settings import router as account_router
from backend.app.database import get_session
from backend.app.library import router as library_router
from backend.app.library_import import ingest_directory_to_library
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
from backend.app.workspace import digest, passwords
from backend.app.workspace.auth import router as auth_router
from backend.app.workspace.security import client_ip_key, limiter

HEADERS = {"X-Requested-With": "MathGarden", "Origin": "http://test"}


@asynccontextmanager
async def isolated_sqlite_db(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "phase_a.sqlite"))
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

    class AsyncDatabaseShim:
        def __init__(self, session: Session):
            self.session = session

        def expire_all(self):
            self.session.expire_all()

        def add(self, value):
            self.session.add(value)

        def add_all(self, values):
            self.session.add_all(values)

        async def get(self, model, ident):
            return self.session.get(model, ident)

        async def scalar(self, query):
            return self.session.scalar(query)

        async def scalars(self, query):
            return self.session.scalars(query)

        async def execute(self, query, params=None):
            return (
                self.session.execute(query, params)
                if params is not None
                else self.session.execute(query)
            )

        async def delete(self, value):
            self.session.delete(value)

        async def flush(self):
            self.session.flush()

        async def commit(self):
            self.session.commit()

        async def rollback(self):
            self.session.rollback()

        async def refresh(self, instance):
            self.session.refresh(instance)

    with Session(engine, expire_on_commit=False) as session:
        yield AsyncDatabaseShim(session)
    engine.dispose()


@pytest.fixture
async def api_env(tmp_path):
    limiter.reset()
    async with isolated_sqlite_db(tmp_path) as db:
        alice = User(
            id=uuid4(),
            email="alice@example.org",
            full_name="آلیس",
            role="student",
            password_hash=passwords.hash("alice-password-1234"),
        )
        bob = User(
            id=uuid4(),
            email="bob@example.org",
            full_name="باب",
            role="student",
            password_hash=passwords.hash("bob-password-12345"),
        )
        admin = User(
            id=uuid4(),
            email="admin@example.org",
            full_name="مدیر",
            role="admin",
            password_hash=passwords.hash("admin-password-123"),
        )
        db.add_all([alice, bob, admin])
        await db.commit()

        app = FastAPI()
        app.include_router(auth_router, prefix="/api")
        app.include_router(account_router)
        app.include_router(library_router)

        async def dependency():
            yield db

        app.dependency_overrides[get_session] = dependency
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers=HEADERS,
        ) as client:
            yield client, db, {"alice": alice, "bob": bob, "admin": admin}


async def test_session_endpoint_guest_and_authenticated(api_env):
    client, db, users = api_env
    guest = await client.get("/api/auth/session")
    assert guest.status_code == 200
    assert guest.headers.get("cache-control") == "no-store"
    assert guest.json() == {"authenticated": False, "account": None}

    login = await client.post(
        "/api/auth/login",
        json={"email": "alice@example.org", "password": "alice-password-1234"},
    )
    assert login.status_code == 200
    authed = await client.get("/api/auth/session")
    assert authed.status_code == 200
    payload = authed.json()
    assert payload["authenticated"] is True
    assert payload["account"]["id"] == str(users["alice"].id)
    assert payload["account"]["email"] == "alice@example.org"
    assert payload["account"]["role"] == "student"
    assert payload["account"]["preferences"]["theme"] == "light"


async def test_logout_without_session_returns_204_and_switch_revokes_prior_user(api_env):
    client, db, users = api_env
    anon_logout = await client.post("/api/auth/logout")
    assert anon_logout.status_code == 204
    assert "garden_session" in anon_logout.headers.get("set-cookie", "")

    expired = AuthSession(
        token_hash=digest("expired-tok"),
        user_id=users["alice"].id,
        expires_at=datetime.now(UTC) - timedelta(hours=1),
    )
    db.add(expired)
    await db.commit()
    client.cookies.clear()
    client.cookies.set("garden_session", "expired-tok", domain="test.local")
    expired_logout = await client.post("/api/auth/logout")
    assert expired_logout.status_code == 204
    client.cookies.clear()

    # Switching from Alice to Bob on same browser must delete Alice's DB session row.
    await client.post(
        "/api/auth/login",
        json={"email": "alice@example.org", "password": "alice-password-1234"},
    )
    alice_token = client.cookies.get("garden_session", domain="test.local")
    assert alice_token
    await client.post(
        "/api/auth/login",
        json={"email": "bob@example.org", "password": "bob-password-12345"},
    )
    old_session = await db.scalar(
        select(AuthSession).where(AuthSession.token_hash == digest(alice_token))
    )
    assert old_session is None


async def test_malformed_preferences_json_falls_back_to_defaults(api_env):
    client, db, users = api_env
    users["alice"].preferences_json = "{broken-json"
    await db.commit()
    await client.post(
        "/api/auth/login",
        json={"email": "alice@example.org", "password": "alice-password-1234"},
    )
    res = await client.get("/api/account")
    assert res.status_code == 200
    assert res.json()["preferences"]["theme"] == "light"
    sess = await client.get("/api/auth/session")
    assert sess.status_code == 200
    assert sess.json()["account"]["preferences"]["size"] == 19


async def test_trashed_shared_folders_and_nested_parent_trash_return_404(api_env):
    client, _db, _users = api_env
    await client.post(
        "/api/auth/login",
        json={"email": "alice@example.org", "password": "alice-password-1234"},
    )
    parent_folder = (
        await client.post("/api/library/items", json={"kind": "folder", "title": "پوشه والد"})
    ).json()
    child_folder = (
        await client.post(
            "/api/library/items",
            json={"kind": "folder", "title": "زیرپوشه", "parent_id": parent_folder["id"]},
        )
    ).json()
    pub_unlisted = (
        await client.put(
            f"/api/library/items/{child_folder['id']}/publication",
            json={"visibility": "unlisted"},
        )
    ).json()
    token = pub_unlisted["share_token"]
    assert (await client.get(f"/api/library/shared/{token}")).status_code == 200

    # Trashing the parent folder must block shared access to child_folder too.
    assert (
        await client.post(f"/api/library/items/{parent_folder['id']}/trash?subtree=true")
    ).status_code == 200
    assert (await client.get(f"/api/library/shared/{token}")).status_code == 404

    # Restore parent, publish top folder as public, trash top folder -> 404.
    assert (
        await client.post(f"/api/library/items/{parent_folder['id']}/restore")
    ).status_code == 200
    assert (
        await client.put(
            f"/api/library/items/{parent_folder['id']}/publication",
            json={"visibility": "public"},
        )
    ).status_code == 200
    assert (await client.get(f"/api/library/public/{parent_folder['id']}")).status_code == 200
    assert (
        await client.post(f"/api/library/items/{parent_folder['id']}/trash?subtree=true")
    ).status_code == 200
    assert (await client.get(f"/api/library/public/{parent_folder['id']}")).status_code == 404


async def test_unlisted_folder_child_interactions_and_unrelated_isolation(api_env):
    client, _db, _users = api_env
    await client.post(
        "/api/auth/login",
        json={"email": "alice@example.org", "password": "alice-password-1234"},
    )
    folder = (
        await client.post("/api/library/items", json={"kind": "folder", "title": "درسنامه"})
    ).json()
    child_note = (
        await client.post(
            "/api/library/items",
            json={
                "kind": "note",
                "title": "یادداشت داخل پوشه",
                "parent_id": folder["id"],
                "content": "متن",
            },
        )
    ).json()
    att = (
        await client.post(
            f"/api/library/items/{child_note['id']}/attachments",
            json={
                "filename": "diagram.txt",
                "content_base64": base64.b64encode(b"diagram bytes").decode(),
            },
        )
    ).json()
    unrelated_note = (
        await client.post(
            "/api/library/items",
            json={"kind": "note", "title": "یادداشت خصوصی دیگر", "content": "راز"},
        )
    ).json()

    shared_folder = (
        await client.put(
            f"/api/library/items/{folder['id']}/publication",
            json={"visibility": "unlisted"},
        )
    ).json()
    token = shared_folder["share_token"]

    # Switch to Bob (non-owner).
    await client.post(
        "/api/auth/login",
        json={"email": "bob@example.org", "password": "bob-password-12345"},
    )
    qs = f"?token={token}"
    assert (
        await client.get(f"/api/library/items/{child_note['id']}/comments{qs}")
    ).status_code == 200
    created_comment = await client.post(
        f"/api/library/items/{child_note['id']}/comments{qs}",
        json={"content": "سوال درباره این بخش"},
    )
    assert created_comment.status_code == 201, created_comment.text
    assert (
        await client.put(
            f"/api/library/items/{child_note['id']}/favorite{qs}", json={"favorite": True}
        )
    ).status_code == 200
    assert (
        await client.put(
            f"/api/library/items/{child_note['id']}/watch{qs}", json={"watching": True}
        )
    ).status_code == 200

    att_list = await client.get(f"/api/library/public/{child_note['id']}/attachments{qs}")
    assert att_list.status_code == 200, att_list.text
    assert [row["id"] for row in att_list.json()] == [att["id"]]
    att_dl = await client.get(f"/api/library/public/{child_note['id']}/attachments/{att['id']}{qs}")
    assert att_dl.status_code == 200
    assert att_dl.content == b"diagram bytes"

    # Unrelated note outside the folder MUST remain hidden!
    assert (
        await client.get(f"/api/library/items/{unrelated_note['id']}/comments{qs}")
    ).status_code == 404
    assert (
        await client.get(f"/api/library/public/{unrelated_note['id']}/attachments{qs}")
    ).status_code == 404


async def test_publication_rotate_token_false_preserves_token_and_admin_verify_accepts_token(
    api_env,
):
    client, _db, _users = api_env
    await client.post(
        "/api/auth/login",
        json={"email": "alice@example.org", "password": "alice-password-1234"},
    )
    note = (
        await client.post(
            "/api/library/items", json={"kind": "note", "title": "اثبات", "content": "v1"}
        )
    ).json()
    first = (
        await client.put(
            f"/api/library/items/{note['id']}/publication",
            json={"visibility": "unlisted"},
        )
    ).json()
    token1 = first["share_token"]
    assert token1

    await client.patch(
        f"/api/library/items/{note['id']}",
        json={"content": "v2", "expected_hash": note["current_hash"]},
    )
    republished = (
        await client.put(
            f"/api/library/items/{note['id']}/publication",
            json={"visibility": "unlisted", "rotate_token": False},
        )
    ).json()
    assert republished["share_token"] == token1

    # Admin verifies unlisted note via ?token=
    await client.post(
        "/api/auth/login",
        json={"email": "admin@example.org", "password": "admin-password-123"},
    )
    verified = await client.put(
        f"/api/library/items/{note['id']}/verification?token={token1}",
        json={"verified": True},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["verified"] is True


async def test_import_separates_folder_and_file_names_records_revision_and_preserves_git_400(
    api_env, monkeypatch
):
    client, db, users = api_env
    user = users["alice"]
    root_folder = LibraryItem(
        user_id=user.id,
        kind="folder",
        title="repo",
        content="",
        current_hash=digest(""),
    )
    db.add(root_folder)
    await db.flush()

    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = Path(tmp_dir)
        (repo / "intro").mkdir()
        (repo / "intro" / "sub.md").write_text("# زیرمجموعه", encoding="utf-8")
        (repo / "intro.md").write_text("# مقدمه v1", encoding="utf-8")

        stats1 = await ingest_directory_to_library(
            db, user.id, str(repo), root_folder, is_sync=False
        )
        assert stats1["added"] == 3

        items = (
            await db.scalars(
                select(LibraryItem).where(
                    LibraryItem.user_id == user.id,
                    LibraryItem.parent_id == root_folder.id,
                )
            )
        ).all()
        assert {(it.kind, it.title) for it in items} == {("folder", "intro"), ("note", "intro")}

        intro_note = next(it for it in items if it.kind == "note")
        intro_note.verified_hash = intro_note.current_hash
        await db.commit()

        (repo / "intro.md").write_text("# مقدمه v2", encoding="utf-8")
        stats2 = await ingest_directory_to_library(
            db, user.id, str(repo), root_folder, is_sync=True
        )
        assert stats2["updated"] == 1
        await db.commit()
        await db.refresh(intro_note)
        assert intro_note.verified_hash is None
        revs = (
            await db.scalars(
                select(LibraryRevision).where(LibraryRevision.item_id == intro_note.id)
            )
        ).all()
        assert any("# مقدمه v2" in r.content for r in revs)

    # Verify git_sync preserves 400 HTTPException instead of wrapping as 500
    import backend.app.library as lib_pkg

    git_src = LibraryGitSource(
        item_id=root_folder.id,
        user_id=user.id,
        repo_url="https://github.com/example/repo.git",
        branch="main",
        sync_status="synced",
    )
    db.add(git_src)
    await db.commit()

    def raise_400(*_a, **_kw):
        raise HTTPException(400, "Branch not found")

    monkeypatch.setattr(lib_pkg, "validate_git_url", lambda _u: None)
    monkeypatch.setattr(lib_pkg, "clone_git_repo", raise_400)
    await client.post(
        "/api/auth/login",
        json={"email": "alice@example.org", "password": "alice-password-1234"},
    )
    sync_resp = await client.post(f"/api/library/items/{root_folder.id}/git-sync")
    assert sync_resp.status_code == 400


def test_client_ip_key_uses_forwarded_headers_only_from_loopback():
    def req(peer: str, xff: str | None = None, real_ip: str | None = None) -> Request:
        headers = []
        if xff:
            headers.append((b"x-forwarded-for", xff.encode()))
        if real_ip:
            headers.append((b"x-real-ip", real_ip.encode()))
        return Request({"type": "http", "client": (peer, 12345), "headers": headers})

    assert client_ip_key(req("127.0.0.1", real_ip="203.0.113.9")) == "203.0.113.9"
    assert client_ip_key(req("::1", xff="198.51.100.7, 127.0.0.1")) == "198.51.100.7"
    assert client_ip_key(req("192.0.2.5", xff="203.0.113.9", real_ip="203.0.113.9")) == "192.0.2.5"
