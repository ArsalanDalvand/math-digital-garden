import os
import subprocess
import sys
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from backend.app.main import app, get_catalogue_session, get_note_session
from backend.app.models import CanonicalNote, User

DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not DATABASE_URL,
        reason="TEST_DATABASE_URL is required for real PostgreSQL verification",
    ),
]


async def test_postgres_migration_roundtrip_constraints_and_public_api():
    url = make_url(DATABASE_URL)
    assert url.drivername == "postgresql+asyncpg"
    assert url.database and url.database.endswith("_test"), "Use a dedicated *_test database"
    migration = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "backend/alembic.ini", "upgrade", "head"],
        env={**os.environ, "DATABASE_URL": DATABASE_URL},
        capture_output=True,
        timeout=30,
    )
    assert migration.returncode == 0, "PostgreSQL migration failed; inspect the local database"
    engine = create_async_engine(DATABASE_URL, poolclass=NullPool)
    raw = Path("tests/fixtures/cantor.md").read_bytes().decode("utf-8") + "\r\nپایان\r\n"
    suffix = uuid4().hex
    try:
        async with engine.connect() as connection:
            assert int(await connection.scalar(text("SHOW server_version_num"))) // 10000 == 16
            assert (
                await connection.scalar(
                    text("SELECT extname FROM pg_extension WHERE extname='vector'")
                )
                == "vector"
            )
            async with connection.begin_nested():
                async with AsyncSession(
                    bind=connection, join_transaction_mode="create_savepoint"
                ) as session:
                    note = CanonicalNote(
                        slug="cantor-" + suffix,
                        title="کانتور",
                        book_slug="math",
                        chapter_slug="sets",
                        relative_path="math/cantor.md",
                        current_content=raw,
                        current_hash=sha256(raw.encode()).hexdigest(),
                    )
                    user = User(
                        email=suffix + "@example.invalid", password_hash="unusable-test-hash"
                    )
                    session.add_all([note, user])
                    await session.flush()

                    async def dependency():
                        yield session

                    app.dependency_overrides[get_note_session] = dependency
                    app.dependency_overrides[get_catalogue_session] = dependency
                    try:
                        async with AsyncClient(
                            transport=ASGITransport(app=app), base_url="http://test"
                        ) as client:
                            response = await client.get("/api/notes/" + note.slug)
                            catalogue = await client.get("/api/notes", params={"q": suffix})
                            assert catalogue.status_code == 200
                            assert catalogue.json() == []
                            catalogue = await client.get("/api/notes", params={"q": "کانتور"})
                            assert any(item["slug"] == note.slug for item in catalogue.json())
                            assert "password_hash" not in catalogue.text
                            literal = await client.get("/api/notes", params={"q": "%_"})
                            assert literal.json() == []
                        assert response.status_code == 200
                        assert response.json()["current_content"] == raw
                        assert response.json()["current_hash"] == sha256(raw.encode()).hexdigest()
                        assert "password_hash" not in response.text
                    finally:
                        app.dependency_overrides.clear()
                    for duplicate in [
                        User(email=user.email, password_hash="unusable-test-hash"),
                        User(
                            email=uuid4().hex + "@example.invalid",
                            role="owner",
                            password_hash="unusable-test-hash",
                        ),
                        CanonicalNote(
                            slug=note.slug,
                            title="duplicate",
                            book_slug="math",
                            chapter_slug="sets",
                            relative_path="math/cantor.md",
                            current_content=raw,
                            current_hash=note.current_hash,
                        ),
                    ]:
                        with pytest.raises(IntegrityError):
                            async with session.begin_nested():
                                session.add(duplicate)
                                await session.flush()
            await connection.rollback()
    finally:
        await engine.dispose()
