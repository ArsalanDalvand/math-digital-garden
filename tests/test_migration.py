import os
import subprocess
import sys


def test_initial_migration_sql():
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "backend/alembic.ini", "upgrade", "head", "--sql"],
        env={**os.environ, "DATABASE_URL": "postgresql+asyncpg://localhost/math_garden_test"},
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    assert "CREATE EXTENSION IF NOT EXISTS vector" in result.stdout
    assert "CREATE TABLE users" in result.stdout
    assert "CREATE TABLE canonical_notes" in result.stdout
    assert "UNIQUE (email)" in result.stdout
    assert "UNIQUE (slug)" in result.stdout
    assert "valid_user_role" in result.stdout
    assert "TIMESTAMP WITH TIME ZONE" in result.stdout
    assert "current_content TEXT NOT NULL" in result.stdout
