"""Unit tests for Phase 1 security fixes, AI feature gate, and lightweight metadata API."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError
from starlette.requests import Request

from backend.app.config import settings
from backend.app.database import get_session
from backend.app.main import app
from backend.app.workspace import current_user, write_guard


def _make_request(origin: str) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/notes/test/fork",
        "scheme": "http",
        "server": ("testserver", 80),
        "headers": [
            (b"host", b"testserver"),
            (b"x-requested-with", b"MathGarden"),
            (b"origin", origin.encode("latin-1")),
        ],
    }
    return Request(scope)


def test_write_guard_rejects_hardcoded_lan_ip_and_allows_configured_origins(monkeypatch):
    monkeypatch.setattr(settings, "extra_allowed_origins", "")
    with pytest.raises(HTTPException) as exc:
        write_guard(_make_request("http://192.168.1.191"))
    assert exc.value.status_code == 403

    monkeypatch.setattr(
        settings,
        "extra_allowed_origins",
        "https://custom.example.org/, https://studio.example.org",
    )
    write_guard(_make_request("https://custom.example.org"))
    write_guard(_make_request("https://studio.example.org"))
    with pytest.raises(HTTPException) as exc2:
        write_guard(_make_request("https://evil.example.org"))
    assert exc2.value.status_code == 403


async def test_ai_chat_returns_503_when_disabled(monkeypatch):
    assert settings.ai_enabled is False
    fake_user = SimpleNamespace(id=uuid4(), email="u@example.org", role="student")

    async def fake_user_dep():
        return fake_user

    class NoQuerySession:
        async def execute(self, *args, **kwargs):
            raise AssertionError("Disabled AI chat must not execute queries")

        async def scalar(self, *args, **kwargs):
            raise AssertionError("Disabled AI chat must not execute scalar queries")

    async def dummy_session():
        yield NoQuerySession()

    app.dependency_overrides[current_user] = fake_user_dep
    app.dependency_overrides[get_session] = dummy_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/ai/chat",
                headers={"X-Requested-With": "MathGarden", "Origin": "http://test"},
                json={
                    "question": "توضیح بده",
                    "slug": "cantor",
                    "scope": "canonical",
                    "expected_hash": "a" * 64,
                },
            )
            assert resp.status_code == 503
            assert "disabled" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


async def test_catalogue_meta_returns_lightweight_etag_and_304():
    rows = [
        SimpleNamespace(
            id=uuid4(),
            slug="alg-1",
            title="مقدمه جبر",
            book_slug="algebra",
            chapter_slug="ch1",
            relative_path="algebra/ch1/intro.md",
            current_hash="1" * 64,
            updated_at=datetime(2026, 1, 1, tzinfo=UTC),
        ),
        SimpleNamespace(
            id=uuid4(),
            slug="axler-1",
            title="فضای برداری",
            book_slug="axler",
            chapter_slug="ch1",
            relative_path="axler/ch1/vs.md",
            current_hash="2" * 64,
            updated_at=datetime(2026, 1, 2, tzinfo=UTC),
        ),
    ]

    class MetaResult:
        def all(self):
            return rows

    class MetaSession:
        def __init__(self):
            self.queries = []

        async def execute(self, query):
            self.queries.append(query)
            return MetaResult()

    session = MetaSession()

    async def dep():
        yield session

    app.dependency_overrides[get_session] = dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/catalogue/meta")
            assert res.status_code == 200
            assert "ETag" in res.headers
            assert res.headers.get("cache-control") == "no-cache"
            data = res.json()
            assert len(data) == 2
            assert set(data[0]) == {
                "id",
                "slug",
                "title",
                "book_slug",
                "chapter_slug",
                "relative_path",
                "current_hash",
                "updated_at",
            }
            assert "current_content" not in str(session.queries[0])

            etag = res.headers["ETag"]
            not_modified = await client.get("/api/catalogue/meta", headers={"If-None-Match": etag})
            assert not_modified.status_code == 304
            assert not_modified.text == ""
    finally:
        app.dependency_overrides.clear()


async def test_catalogue_meta_database_error_stays_private():
    class BrokenSession:
        async def execute(self, query):
            raise OperationalError("secret credentials", {}, Exception("password"))

    async def dep():
        yield BrokenSession()

    app.dependency_overrides[get_session] = dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/catalogue/meta")
            assert res.status_code == 503
            assert res.json() == {"detail": "Database unavailable"}
    finally:
        app.dependency_overrides.clear()
