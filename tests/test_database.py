import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from backend.app.config import settings
from backend.app.database import get_engine, get_session
from backend.app.main import app, lifespan


async def test_unconfigured_database_returns_private_503(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "")
    get_engine.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/notes/cantor")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}


async def test_session_yields_and_engine_is_disposed_on_shutdown(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "postgresql+asyncpg://localhost/math_garden_test")
    get_engine.cache_clear()
    async with lifespan(app):
        dependency = get_session()
        session = await anext(dependency)
        assert session.is_active
        await dependency.aclose()
        assert get_engine.cache_info().currsize == 1
    assert get_engine.cache_info().currsize == 0


async def test_connection_error_is_private(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "postgresql+asyncpg://localhost/math_garden_test")
    get_engine.cache_clear()
    async with lifespan(app):
        dependency = get_session()
        await anext(dependency)
        with pytest.raises(HTTPException) as error:
            await dependency.athrow(OSError("sensitive connection information"))
        assert error.value.status_code == 503
        assert error.value.detail == "Database unavailable"


async def test_invalid_slug_rejected_before_database_access(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "")
    get_engine.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/notes/bad%20slug")
    assert response.status_code == 422


async def test_note_session_closes_after_failed_request(monkeypatch):
    from backend.app.main import get_note_session

    monkeypatch.setattr(settings, "database_url", "postgresql+asyncpg://localhost/math_garden_test")
    get_engine.cache_clear()
    async with lifespan(app):
        dependency = get_note_session("cantor")
        session = await anext(dependency)
        assert session.is_active
        with pytest.raises(HTTPException):
            await dependency.athrow(HTTPException(404, "Note not found"))
        assert session.in_transaction() is False
