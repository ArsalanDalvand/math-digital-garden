"""Run explicitly with private DATABASE_URL; creates only two named synthetic databases.

Checks 0003->head, upgrade rerun, and pg_dump/pg_restore preservation. Never drops a database.
"""

import asyncio
import json
import os
import subprocess
import sys
from hashlib import sha256
from urllib.parse import unquote, urlsplit, urlunsplit
from uuid import uuid4

import asyncpg

SOURCE = "garden_docmost_migration_20261016_test"
RESTORE = "garden_docmost_restore_20261016_test"
CONTAINER = "math_garden_db"
TABLES = (
    "users",
    "auth_sessions",
    "canonical_notes",
    "user_note_forks",
    "fork_revisions",
    "change_proposals",
    "bookmarks",
)


def command(args, *, env=None, data=None):
    result = subprocess.run(args, input=data, capture_output=True, env=env, timeout=90)
    assert result.returncode == 0, f"{args[0]} failed with exit {result.returncode}"
    return result.stdout


async def main():
    resume = "--resume" in sys.argv
    parsed = urlsplit(os.environ["DATABASE_URL"])
    assert parsed.path.endswith("_test"), "Dedicated test credentials required"
    user = unquote(parsed.username or "")
    assert user
    docker = ["docker", "exec", CONTAINER]
    for name in (SOURCE, RESTORE):
        exists = command(
            docker
            + [
                "psql",
                "-U",
                user,
                "-d",
                "postgres",
                "-Atc",
                f"SELECT 1 FROM pg_database WHERE datname='{name}'",
            ]
        )
        if exists.strip():
            assert resume, f"{name} already exists; use --resume for these synthetic fixtures"
        else:
            command(docker + ["createdb", "-U", user, name])
    print("created two dedicated migration/restore databases")

    def url(database, driver="postgresql"):
        return urlunsplit((driver, parsed.netloc, "/" + database, parsed.query, ""))

    def migrate(target):
        env = {**os.environ, "DATABASE_URL": url(SOURCE, "postgresql+asyncpg")}
        command(
            [sys.executable, "-m", "alembic", "-c", "backend/alembic.ini", "upgrade", target],
            env=env,
        )
        print(f"alembic upgrade {target}: exit 0")

    if not resume:
        migrate("0003")
    conn = await asyncpg.connect(url(SOURCE))
    uid, nid, fid, rid, pid = [uuid4() for _ in range(5)]
    raw = "$$x\\in X$$\r\n[[مرجع]]\n> [!THEOREM]\npreservation fixture"
    digest = sha256(raw.encode()).hexdigest()
    if not resume:
        await conn.execute(
            "INSERT INTO users(id,email,full_name,role,password_hash) VALUES($1,$2,$3,'st"
            "udent','synthetic-unused')",
            uid,
            uuid4().hex + "@example.org",
            "synthetic fixture",
        )
        await conn.execute(
            "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+"
            "interval '1 day')",
            "a" * 64,
            uid,
        )
        await conn.execute(
            "INSERT INTO canonical_notes(id,slug,title,book_slug,chapter_slug,relative_pa"
            "th,current_content,current_hash) VALUES($1,'synthetic-preservation','fixture"
            "','book','chapter','book/fixture.md',$2,$3)",
            nid,
            raw,
            digest,
        )
        await conn.execute(
            "INSERT INTO user_note_forks(id,user_id,note_id,base_hash,base_content,custom"
            "_content,current_hash) VALUES($1,$2,$3,$4,$5,$5,$4)",
            fid,
            uid,
            nid,
            digest,
            raw,
        )
        await conn.execute(
            "INSERT INTO fork_revisions(id,user_id,fork_id,content,content_hash) VALUES($"
            "1,$2,$3,$4,$5)",
            rid,
            uid,
            fid,
            raw,
            digest,
        )
        await conn.execute("INSERT INTO bookmarks(user_id,note_id) VALUES($1,$2)", uid, nid)
        await conn.execute(
            "INSERT INTO change_proposals(id,user_id,note_id,base_hash,base_content,propo"
            "sed_content,diff_patch,student_comment,status,sync_status) VALUES($1,$2,$3,$"
            "4,$5,$5,'synthetic diff','synthetic comment','pending','pending')",
            pid,
            uid,
            nid,
            digest,
            raw,
        )
    columns = {
        table: list(dict((await conn.fetch(f'SELECT * FROM "{table}"'))[0])) for table in TABLES
    }

    async def snapshot(connection):
        result = {}
        for table, names in columns.items():
            select_columns = ",".join('"' + name + '"' for name in names)
            result[table] = sorted(
                json.dumps(dict(row), default=str, sort_keys=True)
                for row in await connection.fetch(f'SELECT {select_columns} FROM "{table}"')
            )
        return result

    before = await snapshot(conn)
    await conn.close()
    migrate("head")
    conn = await asyncpg.connect(url(SOURCE))
    assert await snapshot(conn) == before
    assert await conn.fetchval("SELECT version_num FROM alembic_version") == "0006"
    for name in (
        "library_items",
        "library_revisions",
        "library_attachments",
        "library_comments",
        "library_watches",
        "library_favorites",
    ):
        assert await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", name)
    await conn.close()
    print("0003->0006 preserved all 7 existing table fixture rows byte-for-byte")
    migrate("head")
    conn = await asyncpg.connect(url(SOURCE))
    assert await snapshot(conn) == before
    await conn.close()
    print("upgrade head rerun preserved all fixture rows")
    dump = command(docker + ["pg_dump", "-U", user, "-Fc", SOURCE])
    command(
        [
            "docker",
            "exec",
            "-i",
            CONTAINER,
            "pg_restore",
            "-U",
            user,
            "--exit-on-error",
            "--no-owner",
            "-d",
            RESTORE,
        ],
        data=dump,
    )
    restored = await asyncpg.connect(url(RESTORE))
    assert await snapshot(restored) == before
    assert await restored.fetchval("SELECT version_num FROM alembic_version") == "0006"
    await restored.close()
    print(
        f"pg_dump/pg_restore: exit 0; {len(dump)} synthetic backup bytes; "
        "all fixture rows identical"
    )


if __name__ == "__main__":
    asyncio.run(main())
