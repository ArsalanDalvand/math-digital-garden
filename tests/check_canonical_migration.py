"""0006->0007, rerun and backup/restore checks on newly named synthetic DBs only."""

import asyncio
import json
import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from urllib.parse import unquote, urlsplit, urlunsplit
from uuid import uuid4

import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from backend.app.library_models import LibraryAttachment, LibraryItem, LibraryRevision
from backend.app.models import AuthSession, CanonicalNote, ForkRevision, User, UserNoteFork
from backend.app.workspace import digest

RUN = uuid4().hex[:8]
SOURCE = "garden_canonical_migration_" + RUN + "_test"
RESTORE = "garden_canonical_restore_" + RUN + "_test"


def command(args, **kwargs):
    result = subprocess.run(args, capture_output=True, timeout=60, **kwargs)
    assert result.returncode == 0, f"{args[0]} exit {result.returncode}"
    return result.stdout


async def main():
    parsed = urlsplit(os.environ["TEST_DATABASE_URL"])
    assert parsed.path.endswith("_test")
    user = unquote(parsed.username)
    docker = ["docker", "exec", "math_garden_db"]
    for name in (SOURCE, RESTORE):
        command(docker + ["createdb", "-U", user, name])

    def url(name, driver="postgresql"):
        return urlunsplit((driver, parsed.netloc, "/" + name, parsed.query, ""))

    def migrate(revision):
        command(
            [sys.executable, "-m", "alembic", "-c", "backend/alembic.ini", "upgrade", revision],
            env={**os.environ, "DATABASE_URL": url(SOURCE, "postgresql+asyncpg")},
        )
        print("alembic upgrade " + revision + ": exit 0")

    migrate("0006")
    engine = create_async_engine(url(SOURCE, "postgresql+asyncpg"))
    async with AsyncSession(engine, expire_on_commit=False) as db:
        owner = User(
            id=uuid4(), email="migration@example.com", password_hash="synthetic", role="student"
        )
        raw = "---\r\ntitle: fixture\r\n---\n$$x^2$$\n> [!NOTE]\n> raw"
        note = CanonicalNote(
            id=uuid4(),
            slug="fixture",
            title="Fixture",
            book_slug="book",
            chapter_slug="chapter",
            relative_path="book/fixture.md",
            current_content=raw,
            current_hash=digest(raw),
        )
        db.add_all([owner, note])
        await db.flush()
        fork = UserNoteFork(
            user_id=owner.id,
            note_id=note.id,
            base_content=raw,
            base_hash=digest(raw),
            custom_content=raw + "private",
            current_hash=digest(raw + "private"),
        )
        item = LibraryItem(
            user_id=owner.id,
            kind="note",
            title="Existing personal note",
            content=raw,
            current_hash=digest(raw),
            visibility="public",
            published_content=raw,
            published_hash=digest(raw),
            published_title="Published",
        )
        db.add_all(
            [
                fork,
                item,
                AuthSession(
                    user_id=owner.id,
                    token_hash="a" * 64,
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                ),
            ]
        )
        await db.flush()
        db.add_all(
            [
                ForkRevision(
                    user_id=owner.id,
                    fork_id=fork.id,
                    content=fork.custom_content,
                    content_hash=fork.current_hash,
                ),
                LibraryRevision(
                    user_id=owner.id, item_id=item.id, content=raw, content_hash=digest(raw)
                ),
                LibraryAttachment(
                    user_id=owner.id,
                    item_id=item.id,
                    filename="proof.bin",
                    data=b"raw\x00\xff",
                    published=True,
                ),
            ]
        )
        await db.commit()
    await engine.dispose()

    async def snapshot(connection, tables):
        return {
            table: sorted(
                json.dumps(dict(row), default=str, sort_keys=True)
                for row in await connection.fetch('SELECT * FROM "' + table + '"')
            )
            for table in tables
        }

    connection = await asyncpg.connect(url(SOURCE))
    tables = await connection.fetch(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename!='alembic_version'"
    )
    tables = [row["tablename"] for row in tables]
    before = await snapshot(connection, tables)
    await connection.close()
    migrate("head")
    migrate("head")
    connection = await asyncpg.connect(url(SOURCE))
    assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0007"
    assert await snapshot(connection, tables) == before
    assert await connection.fetchval("SELECT count(*) FROM library_canonical") == 0
    await connection.close()
    backup = command(docker + ["pg_dump", "-U", user, "-Fc", SOURCE])
    command(
        [
            "docker",
            "exec",
            "-i",
            "math_garden_db",
            "pg_restore",
            "-U",
            user,
            "--exit-on-error",
            "--no-owner",
            "-d",
            RESTORE,
        ],
        input=backup,
    )
    connection = await asyncpg.connect(url(RESTORE))
    assert await snapshot(connection, tables) == before
    assert await connection.fetchval("SELECT version_num FROM alembic_version") == "0007"
    await connection.close()
    print(
        json.dumps(
            {
                "source": SOURCE,
                "restore_database": RESTORE,
                "preserved_tables": len(tables),
                "populated_tables": sum(bool(v) for v in before.values()),
                "upgrade": "0006->0007",
                "rerun": "identical",
                "restore": "identical",
                "exit": 0,
            }
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
