from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from backend.app.main import app, get_note_session
from backend.app.models import CanonicalNote, User

RAW = Path("tests/fixtures/cantor.md").read_text()


class Result:
    def __init__(self, note):
        self.note = note

    def scalar_one_or_none(self):
        return self.note


class Session:
    def __init__(self, note=None, unavailable=False):
        self.note = note
        self.unavailable = unavailable
        self.queries = []

    async def execute(self, query):
        self.queries.append(query)
        if self.unavailable:
            raise OperationalError("secret connection", {}, Exception("password"))
        return Result(self.note)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


def override(session):
    async def dependency():
        yield session

    app.dependency_overrides[get_note_session] = dependency


async def test_health_without_database(client):
    assert (await client.get("/health")).json() == {"status": "ok"}


async def test_note_raw_and_public_fields(client):
    note = CanonicalNote(
        id=uuid4(),
        slug="cantor",
        title="کانتور",
        book_slug="math",
        chapter_slug="sets",
        relative_path="math/cantor.md",
        current_content=RAW,
        current_hash=sha256(RAW.encode()).hexdigest(),
        updated_at=datetime.now(UTC),
    )
    session = Session(note)
    override(session)
    response = await client.get("/api/notes/cantor")
    assert response.status_code == 200
    assert response.json()["current_content"] == RAW
    assert set(response.json()) == {
        "id",
        "slug",
        "title",
        "book_slug",
        "chapter_slug",
        "relative_path",
        "current_content",
        "current_hash",
        "updated_at",
    }
    assert "canonical_notes.slug" in str(session.queries[0])
    assert session.queries[0].compile().params["slug_1"] == "cantor"


async def test_missing_note(client):
    override(Session())
    assert (await client.get("/api/notes/missing")).status_code == 404


@pytest.mark.parametrize("slug", ["bad slug", "a" * 256])
async def test_invalid_slug(client, slug):
    session = Session()
    override(session)
    assert (await client.get("/api/notes/" + slug)).status_code == 422
    assert session.queries == []


async def test_database_error_is_private(client):
    override(Session(unavailable=True))
    response = await client.get("/api/notes/cantor")
    assert response.status_code == 503
    assert "password" not in response.text
    assert "secret" not in response.text


async def test_no_public_user_or_write_api(client):
    assert (await client.get("/api/users")).status_code == 404
    assert (await client.post("/api/notes/cantor", json={})).status_code == 405


def test_database_constraints():
    assert User.__table__.c.email.unique
    assert CanonicalNote.__table__.c.slug.unique
    assert not CanonicalNote.__table__.c.current_content.nullable
    assert any(c.name == "valid_user_role" for c in User.__table__.constraints)
