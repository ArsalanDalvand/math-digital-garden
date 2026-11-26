"""Unit and Postgres-backed integration tests for flexible indexing and discovery APIs."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from hashlib import sha256
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from backend.app.database import get_session
from backend.app.main import app
from backend.app.models import CanonicalNote, NoteEdge

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")


def test_discovery_and_indexing_helpers_red_gate():
    from backend.app.discovery import (
        build_books_catalogue,
        build_sitemap_from_rows,
        extract_search_snippet,
    )
    from backend.app.note_indexing import build_note_lookup

    id_a, id_b = uuid4(), uuid4()
    rows = [
        SimpleNamespace(
            id=id_a,
            slug="axler-001",
            title="فضای برداری",
            book_slug="axler",
            chapter_slug="02-فصل اول",
            relative_path="axler/02-فصل اول/فضای برداری.md",
            current_hash="aaa111",
            frontmatter={
                "uid": "vec-space",
                "kind": "concept",
                "subtype": "structure",
                "level": "L3_undergrad_core",
                "tracks": ["pure_university"],
                "tags": ["جبر_خطی"],
                "aliases": ["Vector Space"],
                "slogan_fa": "ساختار پایه جمع بردارها و ضرب اسکالر",
            },
        ),
        SimpleNamespace(
            id=id_b,
            slug="axler-002",
            title="قضیه بعد",
            book_slug="axler",
            chapter_slug="02-فصل اول",
            relative_path="axler/02-فصل اول/قضیه بعد.md",
            current_hash="bbb222",
            frontmatter={
                "uid": "dim-thm",
                "kind": "assertion",
                "tags": ["قضیه"],
                "aliases": [],
            },
        ),
    ]

    lookup = build_note_lookup(rows)
    assert lookup("Vector Space") == "axler-001"
    assert lookup("vec-space") == "axler-001"
    assert lookup("axler-002") == "axler-002"
    assert lookup("02-فصل اول/فضای برداری") == "axler-001"

    edges = [
        SimpleNamespace(
            source_note_id=id_b,
            target_note_id=id_a,
            relation_type="rel_requires",
            edge_source="frontmatter",
        ),
        SimpleNamespace(
            source_note_id=id_b,
            target_note_id=id_a,
            relation_type="wikilink",
            edge_source="wikilink",
        ),
    ]

    sitemap = build_sitemap_from_rows(rows, edges)
    assert "notes/axler-001" in sitemap
    assert "notes/axler-002" in sitemap
    assert sitemap["notes/axler-002"]["links"] == ["notes/axler-001"]
    assert sitemap["notes/axler-001"]["backlinks"] == ["notes/axler-002"]
    assert sitemap["notes/axler-002"]["rels"]["notes/axler-001"] == ["rel_requires"]
    assert "#kind:concept" in sitemap["notes/axler-001"]["tags"]
    assert "#level:L3_undergrad_core" in sitemap["notes/axler-001"]["tags"]

    book_stats = build_books_catalogue(
        [
            SimpleNamespace(
                slug="axler-2debc85d452ad205",
                title="00-MOC نقشه راه جامع",
                book_slug="axler",
                chapter_slug="00-نقشه‌های راه",
            ),
            SimpleNamespace(
                slug="custom-intro",
                title="مقدمه آنالیز حقیقی",
                book_slug="real-analysis",
                chapter_slug="01-مقدمه",
            ),
        ]
    )
    assert book_stats["total_notes"] == 2
    slugs = [b["book_slug"] for b in book_stats["books"]]
    assert "axler" in slugs
    assert "real-analysis" in slugs
    axler_entry = next(b for b in book_stats["books"] if b["book_slug"] == "axler")
    assert axler_entry["note_count"] == 1
    assert axler_entry["entry_slug"] == "axler-2debc85d452ad205"

    snippet = extract_search_snippet(
        "---\ntags:\n  - جبر\n---\n# عنوان\nتعریف **فضای برداری** روی میدان اسکالرها تعریف می‌شود.",
        "فضای برداری",
    )
    assert "tags:" not in snippet
    assert "فضای برداری" in snippet


async def test_discovery_endpoints_validate_and_protect_db_errors():
    class BrokenSession:
        async def execute(self, *args, **kwargs):
            raise OperationalError("secret", {}, Exception("db down"))

    async def broken_dep():
        yield BrokenSession()

    app.dependency_overrides[get_session] = broken_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for endpoint in ("/api/graph", "/api/books", "/api/search?q=test"):
                res = await client.get(endpoint)
                assert res.status_code == 503
                assert res.json() == {"detail": "Database unavailable"}

            assert (await client.get("/api/search", params={"limit": 0})).status_code == 422
            assert (await client.get("/api/search", params={"q": "x" * 201})).status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
@pytest.mark.skipif(not TEST_DATABASE_URL, reason="dedicated DB")
async def test_postgres_search_graph_and_books_end_to_end():
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    from backend.app.note_indexing import reindex_all_notes

    assert TEST_DATABASE_URL.split("?")[0].endswith("_test")
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.connect() as conn:
        tx = await conn.begin()
        async with AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as db:
            uid1, uid2 = uuid4(), uuid4()
            md1 = (
                "---\n"
                "uid: test-set\n"
                "kind: concept\n"
                "level: L2_calc_basic\n"
                "slogan_fa: پایه تمام ساختارهای جبری\n"
                "tags:\n"
                "  - جبر_تست\n"
                "---\n"
                "# نظریه مجموعه‌ها\n"
                "هر مجموعه شامل اعضا است.\n"
            )
            md2 = (
                "---\n"
                "uid: test-thm\n"
                "kind: assertion\n"
                "tags:\n"
                "  - قضیه\n"
                "rel_requires:\n"
                "  - '[[test-set]]'\n"
                "---\n"
                "# قضیه کانتور تستی\n"
                "رجوع به [[نظریه مجموعه‌ها]].\n"
            )
            n1 = CanonicalNote(
                id=uid1,
                slug="pg-test-sets",
                title="نظریه مجموعه‌ها",
                book_slug="testbook",
                chapter_slug="01-فصل",
                relative_path="testbook/01-فصل/نظریه مجموعه‌ها.md",
                current_content=md1,
                current_hash=sha256(md1.encode()).hexdigest(),
                updated_at=datetime.now(UTC),
            )
            n2 = CanonicalNote(
                id=uid2,
                slug="pg-test-cantor",
                title="قضیه کانتور تستی",
                book_slug="testbook",
                chapter_slug="01-فصل",
                relative_path="testbook/01-فصل/قضیه کانتور تستی.md",
                current_content=md2,
                current_hash=sha256(md2.encode()).hexdigest(),
                updated_at=datetime.now(UTC),
            )
            db.add_all([n1, n2])
            await db.flush()

            stats = await reindex_all_notes(db)
            assert stats["notes"] >= 2
            assert stats["edges"] >= 2

            async def dep():
                yield db

            app.dependency_overrides[get_session] = dep
            try:
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    g_res = await client.get("/api/graph")
                    assert g_res.status_code == 200
                    etag = g_res.headers.get("etag")
                    assert etag
                    graph_data = g_res.json()
                    assert "notes/pg-test-sets" in graph_data
                    assert "notes/pg-test-cantor" in graph_data
                    assert (
                        graph_data["notes/pg-test-cantor"]["rels"]["notes/pg-test-sets"]
                        == ["rel_requires"]
                    )
                    assert (
                        await client.get("/api/graph", headers={"If-None-Match": etag})
                    ).status_code == 304

                    b_res = await client.get("/api/books")
                    assert b_res.status_code == 200
                    assert any(
                        b["book_slug"] == "testbook" and b["note_count"] == 2
                        for b in b_res.json()["books"]
                    )

                    s_res = await client.get(
                        "/api/search",
                        params={"q": "کانتور تستی", "book": "testbook", "kind": "assertion"},
                    )
                    assert s_res.status_code == 200
                    payload = s_res.json()
                    assert payload["total"] >= 1
                    assert payload["items"][0]["slug"] == "pg-test-cantor"
                    assert payload["items"][0]["kind"] == "assertion"
            finally:
                app.dependency_overrides.clear()
                assert isinstance(NoteEdge.__tablename__, str)
        await tx.rollback()
    await engine.dispose()
