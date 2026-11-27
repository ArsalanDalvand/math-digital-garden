"""Phase D backend TDD tests: comment author names, proposal titles, and workspace rebase status."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.app.database import get_session
from backend.app.library import router as library_router
from backend.app.library_models import (
    LibraryAttachment,
    LibraryCanonical,
    LibraryComment,
    LibraryFavorite,
    LibraryItem,
    LibraryRevision,
    LibraryWatch,
)
from backend.app.models import (
    AuthSession,
    Bookmark,
    CanonicalNote,
    ChangeProposal,
    ForkRevision,
    User,
    UserNoteFork,
)
from backend.app.workspace import digest, passwords
from backend.app.workspace.auth import router as auth_router
from backend.app.workspace.forks import router as forks_router
from backend.app.workspace.proposals import router as proposals_router
from backend.app.workspace.security import limiter

HEADERS = {"X-Requested-With": "MathGarden", "Origin": "http://test"}


@asynccontextmanager
async def phase_d_db(tmp_path: Path):
    engine = create_engine("sqlite:///" + str(tmp_path / "phase_d.sqlite"))
    for tbl in (
        User.__table__,
        AuthSession.__table__,
        UserNoteFork.__table__,
        ForkRevision.__table__,
        Bookmark.__table__,
        ChangeProposal.__table__,
        LibraryItem.__table__,
        LibraryRevision.__table__,
        LibraryCanonical.__table__,
        LibraryAttachment.__table__,
        LibraryComment.__table__,
        LibraryWatch.__table__,
        LibraryFavorite.__table__,
    ):
        tbl.create(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS canonical_notes "
            "(id CHAR(32) PRIMARY KEY, slug VARCHAR(255) UNIQUE NOT NULL, "
            "title VARCHAR(500) NOT NULL, book_slug VARCHAR(100) NOT NULL, "
            "chapter_slug VARCHAR(100) NOT NULL, relative_path VARCHAR(500) NOT NULL, "
            "current_content TEXT NOT NULL, current_hash VARCHAR(64) NOT NULL, "
            "updated_at DATETIME, frontmatter JSON DEFAULT '{}' NOT NULL, "
            "search_vector TEXT, rendered_html TEXT, render_meta JSON DEFAULT '{}' NOT NULL, "
            "render_version INTEGER DEFAULT 0 NOT NULL)"
        )
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS note_embeddings "
            "(id CHAR(32) PRIMARY KEY, note_id CHAR(32), user_id CHAR(32), is_canonical BOOLEAN)"
        )
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS note_edges "
            "(id CHAR(32) PRIMARY KEY, source_note_id CHAR(32), target_note_id CHAR(32), "
            "relation_type TEXT, edge_source TEXT, created_at DATETIME)"
        )

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

        async def flush(self):
            self.session.flush()

        async def commit(self):
            self.session.commit()

        async def delete(self, instance):
            self.session.delete(instance)

        async def refresh(self, instance):
            self.session.refresh(instance)

    db = Session(engine, expire_on_commit=False)
    shim = AsyncDatabaseShim(db)

    app = FastAPI()
    app.include_router(auth_router, prefix="/api/auth")
    app.include_router(forks_router, prefix="/api")
    app.include_router(proposals_router, prefix="/api")
    app.include_router(library_router)
    limiter.reset()

    async def override_db():
        yield shim

    app.dependency_overrides[get_session] = override_db
    try:
        yield db, app
    finally:
        app.dependency_overrides.clear()
        db.close()
        engine.dispose()


def seed_user(
    db: Session,
    email: str,
    full_name: str | None,
    role: str = "student",
) -> tuple[User, str]:
    token = "tok-" + uuid4().hex
    user = User(
        id=uuid4(),
        email=email,
        full_name=full_name,
        role=role,
        password_hash=passwords.hash("secure-password-1234"),
    )
    db.add(user)
    db.flush()
    db.add(
        AuthSession(
            token_hash=digest(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
    )
    db.commit()
    return user, token


def seed_note(db: Session, slug: str, title: str, content: str) -> CanonicalNote:
    note = CanonicalNote(
        id=uuid4(),
        slug=slug,
        title=title,
        book_slug="linear-algebra",
        chapter_slug="ch1",
        relative_path=f"notes/{slug}.md",
        current_content=content,
        current_hash=digest(content),
    )
    db.add(note)
    db.commit()
    return note


@pytest.mark.asyncio
async def test_comments_return_author_name_and_role_without_leaking_email(tmp_path):
    async with phase_d_db(tmp_path) as (db, app):
        student, student_tok = seed_user(db, "sara-secret@example.com", "سارا محمدی", "student")
        author, author_tok = seed_user(db, "author-secret@example.com", "   ", "author")
        unnamed_student, unnamed_tok = seed_user(db, "anon@example.com", "", "student")
        note = seed_note(db, "rings-intro", "معرفی حلقه‌ها", "# حلقه\n\nمتن اصلی")

        def auth_headers(tok: str) -> dict[str, str]:
            return {**HEADERS, "Cookie": f"garden_session={tok}"}

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            r1 = await client.post(
                f"/api/library/canonical/{note.slug}/comments",
                headers=auth_headers(student_tok),
                json={"content": "سوال دربارهٔ $R$"},
            )
            assert r1.status_code == 201
            p1 = r1.json()
            assert p1["author_name"] == "سارا محمدی"
            assert p1["author_role"] == "student"
            assert "sara-secret@example.com" not in r1.text

            r2 = await client.post(
                f"/api/library/canonical/{note.slug}/comments",
                headers=auth_headers(author_tok),
                json={"content": "پاسخ مؤلف", "parent_id": p1["id"]},
            )
            assert r2.status_code == 201
            assert r2.json()["author_name"] == "مؤلف"
            assert r2.json()["author_role"] == "author"

            r3 = await client.post(
                f"/api/library/canonical/{note.slug}/comments",
                headers=auth_headers(unnamed_tok),
                json={"content": "نکتهٔ تکمیلی"},
            )
            assert r3.status_code == 201
            assert r3.json()["author_name"] == "عضو باغ"
            assert r3.json()["author_role"] == "student"

            listed = await client.get(
                f"/api/library/canonical/{note.slug}/comments",
                headers=auth_headers(student_tok),
            )
            assert listed.status_code == 200
            rows = listed.json()
            assert len(rows) == 3
            by_content = {row["content"]: (row["author_name"], row["author_role"]) for row in rows}
            assert by_content == {
                "سوال دربارهٔ $R$": ("سارا محمدی", "student"),
                "پاسخ مؤلف": ("مؤلف", "author"),
                "نکتهٔ تکمیلی": ("عضو باغ", "student"),
            }
            for secret in (
                "sara-secret@example.com",
                "author-secret@example.com",
                "anon@example.com",
            ):
                assert secret not in listed.text
            for key in ("id", "content", "user_id", "created_at", "parent_id", "resolved"):
                assert key in rows[0]

            # Personal library item comments include author_name and author_role as well.
            item = LibraryItem(
                user_id=student.id,
                kind="note",
                title="یادداشت شخصی",
                content="متن شخصی",
                current_hash=digest("متن شخصی"),
                visibility="public",
                published_title="یادداشت شخصی",
                published_content="متن شخصی",
                published_hash=digest("متن شخصی"),
            )
            db.add(item)
            db.commit()

            li_post = await client.post(
                f"/api/library/items/{item.id}/comments",
                headers=auth_headers(student_tok),
                json={"content": "دیدگاه شخصی"},
            )
            assert li_post.status_code == 201
            assert li_post.json()["author_name"] == "سارا محمدی"
            li_list = await client.get(
                f"/api/library/items/{item.id}/comments",
                headers=auth_headers(student_tok),
            )
            assert li_list.status_code == 200
            assert li_list.json()[0]["author_name"] == "سارا محمدی"
            assert li_list.json()[0]["author_role"] == "student"


@pytest.mark.asyncio
async def test_proposals_review_and_workspace_expose_title_author_name_and_rebase_flag(tmp_path):
    async with phase_d_db(tmp_path) as (db, app):
        student, student_tok = seed_user(db, "ali-private@example.com", "علی رضایی", "student")
        author, author_tok = seed_user(db, "prof@example.com", "دکتر ناصری", "author")
        base_text = "# لم کانتور\n\nنسخهٔ اول."
        note = seed_note(db, "cantor-lemma", "لم کانتور در مجموعه‌ها", base_text)

        def auth_headers(tok: str) -> dict[str, str]:
            return {**HEADERS, "Cookie": f"garden_session={tok}"}

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            save_res = await client.post(
                f"/api/notes/{note.slug}/fork",
                headers=auth_headers(student_tok),
                json={
                    "content": "# لم کانتور\n\nنسخهٔ ویرایش‌شده توسط دانشجو.",
                    "expected_hash": note.current_hash,
                },
            )
            assert save_res.status_code == 200
            fork_hash = save_res.json()["current_hash"]

            ws_initial = await client.get("/api/workspace", headers=auth_headers(student_tok))
            assert ws_initial.status_code == 200
            ws_fork = ws_initial.json()["forks"][0]
            assert ws_fork["canonical_hash"] == note.current_hash
            assert ws_fork["needs_rebase"] is False

            # Propose change and verify additive title + author_name (without email leak).
            prop_res = await client.post(
                "/api/proposals",
                headers=auth_headers(student_tok),
                json={"slug": note.slug, "comment": "شفاف‌سازی اثبات"},
            )
            assert prop_res.status_code == 201
            prop = prop_res.json()
            assert prop["slug"] == note.slug
            assert prop["title"] == "لم کانتور در مجموعه‌ها"
            assert prop["author_name"] == "علی رضایی"
            assert "ali-private@example.com" not in prop_res.text

            own_list = await client.get("/api/proposals", headers=auth_headers(student_tok))
            assert own_list.status_code == 200
            assert own_list.json()[0]["title"] == "لم کانتور در مجموعه‌ها"
            assert own_list.json()[0]["author_name"] == "علی رضایی"

            rev_list = await client.get("/api/review", headers=auth_headers(author_tok))
            assert rev_list.status_code == 200
            assert rev_list.json()[0]["title"] == "لم کانتور در مجموعه‌ها"
            assert rev_list.json()[0]["author_name"] == "علی رضایی"
            assert "ali-private@example.com" not in rev_list.text

            rev_detail = await client.get(
                f"/api/review/{prop['id']}", headers=auth_headers(author_tok)
            )
            assert rev_detail.status_code == 200
            assert rev_detail.json()["title"] == "لم کانتور در مجموعه‌ها"
            assert rev_detail.json()["author_name"] == "علی رضایی"

            # Advance canonical note content independently -> student fork needs_rebase = True.
            new_canonical = "# لم کانتور\n\nنسخهٔ رسمی جدید."
            note.current_content = new_canonical
            note.current_hash = digest(new_canonical)
            db.commit()

            ws_stale = await client.get("/api/workspace", headers=auth_headers(student_tok))
            assert ws_stale.status_code == 200
            stale_fork = ws_stale.json()["forks"][0]
            assert stale_fork["canonical_hash"] == note.current_hash
            assert stale_fork["needs_rebase"] is True

            # Explicit rebase clears needs_rebase while preserving merged text.
            merged = "# لم کانتور\n\nنسخهٔ رسمی جدید + افزودهٔ دانشجو."
            rebase_res = await client.post(
                f"/api/notes/{note.slug}/fork/rebase",
                headers=auth_headers(student_tok),
                json={
                    "content": merged,
                    "expected_hash": fork_hash,
                    "canonical_hash": note.current_hash,
                },
            )
            assert rebase_res.status_code == 200

            ws_rebased = await client.get("/api/workspace", headers=auth_headers(student_tok))
            assert ws_rebased.status_code == 200
            assert ws_rebased.json()["forks"][0]["needs_rebase"] is False
            assert ws_rebased.json()["forks"][0]["custom_content"] == merged
