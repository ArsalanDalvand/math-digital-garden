"""Change only a generated browser-test identity in the named isolated database."""

import asyncio
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import asyncpg

email, role = sys.argv[1:]
assert re.fullmatch(r"Browser[0-9a-f]{10}@example\.com", email)
assert role in {"student", "author", "admin"}
url = os.environ.get("TEST_DATABASE_URL")
if not url:
    tmp_env = Path(os.environ.get("TMPDIR", "/tmp")) / "garden-docmost-test.env"
    if tmp_env.exists():
        for line in tmp_env.read_text().splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "TEST_DATABASE_URL":
                url = value.strip().strip("\"'")
assert url and urlsplit(url).path == "/garden_docmost_20261016_test"


async def main():
    connection = await asyncpg.connect(url.replace("postgresql+asyncpg://", "postgresql://", 1))
    try:
        assert (
            await connection.execute("UPDATE users SET role=$1 WHERE email=$2", role, email.lower())
            == "UPDATE 1"
        )
    finally:
        await connection.close()


asyncio.run(main())
print("Synthetic role updated")
