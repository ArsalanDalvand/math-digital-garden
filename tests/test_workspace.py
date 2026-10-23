"""Real PostgreSQL acceptance journeys; no production data is modified."""

import os
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from backend.app.database import get_session
from backend.app.main import app
from backend.app.models import CanonicalNote, User

DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = [pytest.mark.integration, pytest.mark.skipif(not DATABASE_URL, reason="dedicated DB")]
RAW = Path("tests/fixtures/cantor.md").read_bytes().decode() + "\r\nپایان\r\n"
HEADERS = {"X-Requested-With": "MathGarden", "Origin": "http://test"}


@pytest.fixture
async def journey():
    from backend.app.workspace import limiter

    limiter.reset()
    assert DATABASE_URL.split("?")[0].endswith("_test")
    engine = create_async_engine(DATABASE_URL, poolclass=NullPool)
    async with engine.connect() as conn:
        tx = await conn.begin()
        async with AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as db:
            note = CanonicalNote(
                id=uuid4(),
                slug="journey-" + uuid4().hex,
                title="کانتور",
                book_slug="math",
                chapter_slug="sets",
                relative_path="math/cantor.md",
                current_content=RAW,
                current_hash=sha256(RAW.encode()).hexdigest(),
            )
            db.add(note)
            await db.flush()

            async def dependency():
                yield db

            app.dependency_overrides[get_session] = dependency
            async with (
                AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test", headers=HEADERS
                ) as a,
                AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test", headers=HEADERS
                ) as b,
            ):
                yield a, b, db, note
            app.dependency_overrides.clear()
        await tx.rollback()
    await engine.dispose()


async def register(client):
    email = uuid4().hex + "@example.org"
    response = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "secure-example-password", "full_name": "دانشجو"},
    )
    assert response.status_code == 201, response.text
    assert "password" not in response.text
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    return response.json(), email


async def test_auth_session_csrf_role_and_logout(journey):
    a, b, db, note = journey
    assert (await a.get("/api/auth/me")).status_code == 401
    user, email = await register(a)
    assert user["role"] == "student"
    assert (await a.get("/api/auth/me")).json()["id"] == user["id"]
    assert (
        await b.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
    ).status_code == 401
    assert (
        await b.post(
            "/api/auth/login", json={"email": email, "password": "secure-example-password"}
        )
    ).status_code == 200
    assert (
        await a.post("/api/auth/logout", headers={"Origin": "https://evil.invalid"})
    ).status_code == 403
    assert (await a.post("/api/auth/logout")).status_code == 204
    assert (await a.get("/api/auth/me")).status_code == 401
    assert (await b.get("/api/auth/me")).status_code == 200
    assert (await b.get("/api/review")).status_code == 403


async def test_fork_raw_conflict_privacy_history_reset_bookmark(journey):
    a, b, db, note = journey
    await register(a)
    await register(b)
    path = "/api/notes/" + note.slug + "/fork"
    edited = RAW + "\n> [!PROOF]\n> $$\\frac{a}{b}$$\n"
    response = await a.post(path, json={"content": edited, "expected_hash": note.current_hash})
    assert response.status_code == 200, response.text
    fork = response.json()
    assert fork["custom_content"] == edited
    private = await a.get("/api/workspace/notes/" + note.slug)
    assert private.headers["cache-control"] == "no-store"
    assert private.json()["fork"]["custom_content"] == edited
    assert (await b.get("/api/workspace/notes/" + note.slug)).json()["fork"] is None
    assert (await b.get("/api/workspace")).json()["forks"] == []
    assert (
        await a.post(path, json={"content": "lost", "expected_hash": note.current_hash})
    ).status_code == 409
    assert (await b.get("/api/workspace/forks/" + fork["id"] + "/history")).status_code == 404
    history = (await a.get("/api/workspace/forks/" + fork["id"] + "/history")).json()
    assert history[0]["content"] == edited
    assert (await a.put("/api/workspace/bookmarks/" + note.slug)).status_code == 204
    assert len((await a.get("/api/workspace")).json()["bookmarks"]) == 1
    assert (await b.get("/api/workspace")).json()["bookmarks"] == []
    reset = await a.post(path + "/reset", json={"expected_hash": fork["current_hash"]})
    assert reset.status_code == 200
    assert reset.json()["custom_content"] == RAW
    assert note.current_content == RAW


async def test_proposal_freeze_idor_review_and_conflict(journey):
    a, b, db, note = journey
    student, _ = await register(a)
    author, _ = await register(b)
    owner = await db.scalar(select(User).where(User.email == author["email"]))
    owner.role = "author"
    await db.commit()
    path = "/api/notes/" + note.slug + "/fork"
    edited = RAW + "\nاصلاح اول\n"
    fork = (await a.post(path, json={"content": edited, "expected_hash": note.current_hash})).json()
    response = await a.post("/api/proposals", json={"slug": note.slug, "comment": "اصلاح برهان"})
    assert response.status_code == 201, response.text
    proposal = response.json()
    await a.post(path, json={"content": edited + "ادامه", "expected_hash": fork["current_hash"]})
    frozen = (await a.get("/api/proposals/" + proposal["id"])).json()
    assert frozen["proposed_content"] == edited
    assert frozen["base_content"] == RAW
    assert (await b.get("/api/proposals/" + proposal["id"])).status_code == 404
    review = await b.get("/api/review/" + proposal["id"])
    assert review.status_code == 200
    response = await b.post(
        "/api/review/" + proposal["id"], json={"decision": "approve", "comment": "تایید"}
    )
    assert response.status_code == 200, response.text
    await db.refresh(note)
    assert note.current_content == edited
    assert note.current_hash == sha256(edited.encode()).hexdigest()
    assert response.json()["sync_status"] == "pending"
    assert (
        await b.post("/api/review/" + proposal["id"], json={"decision": "approve"})
    ).status_code == 409
    # Original fork retains its original base; a second proposal must conflict.
    second = (await a.post("/api/proposals", json={"slug": note.slug, "comment": "بعدی"})).json()
    assert (
        await b.post("/api/review/" + second["id"], json={"decision": "approve"})
    ).status_code == 409
    assert (await a.get("/api/review/" + second["id"])).status_code == 403


async def test_session_expiry_and_registration_privilege_injection(journey):
    a, b, db, note = journey
    response = await a.post(
        "/api/auth/register",
        json={"email": "x@example.org", "password": "secure-example-password", "role": "admin"},
    )
    assert response.status_code == 422
    await register(a)
    # Import after registration so absent implementation yields route RED, not import RED.
    from uuid import UUID

    from backend.app.models import AuthSession

    me = (await a.get("/api/auth/me")).json()
    session = await db.scalar(select(AuthSession).where(AuthSession.user_id == UUID(me["id"])))
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    assert (await a.get("/api/auth/me")).status_code == 401


async def test_rag_real_vectors_owner_filter_citations_and_invalidation(journey, monkeypatch):
    a, b, db, note = journey
    await register(a)
    author, _ = await register(b)
    owner = await db.scalar(select(User).where(User.email == author["email"]))
    owner.role = "author"
    await db.commit()
    from backend.app import rag
    from backend.app.config import settings
    from backend.app.models import NoteEmbedding

    vector = [0.0, 1.0] + [0.0] * 1534

    async def fake_embed(texts):
        return [vector for _ in texts]

    observed = []

    async def fake_provider(path, payload):
        observed.append(payload)
        return {
            "choices": [
                {"message": {"content": '{"answer":"توضیح برهان [S1].", "citations":["S1"]}'}}
            ]
        }

    monkeypatch.setattr(rag, "embed", fake_embed)
    monkeypatch.setattr(rag, "provider", fake_provider)
    for client, content in [(a, RAW + "PRIVATE_A"), (b, RAW + "PRIVATE_B")]:
        assert (
            await client.post(
                "/api/notes/" + note.slug + "/fork",
                json={"content": content, "expected_hash": note.current_hash},
            )
        ).status_code == 200
        assert (
            await client.post("/api/ai/index/personal", json={"slug": note.slug})
        ).status_code == 200
    assert (await b.post("/api/ai/index/canonical", json={"slug": note.slug})).status_code == 200
    assert (await a.post("/api/ai/index/canonical", json={"slug": note.slug})).status_code == 403
    user_id = UUID((await a.get("/api/auth/me")).json()["id"])
    sources = await rag.retrieve(db, user_id, vector)
    assert "PRIVATE_A" in str(sources) and "PRIVATE_B" not in str(sources)
    user = await db.scalar(
        select(User).where(User.email == (await a.get("/api/auth/me")).json()["email"])
    )
    fork = (await a.get("/api/workspace/notes/" + note.slug)).json()["fork"]
    await a.post(
        "/api/notes/" + note.slug + "/fork",
        json={"content": RAW + "new", "expected_hash": fork["current_hash"]},
    )
    assert not (
        await db.scalars(select(NoteEmbedding).where(NoteEmbedding.user_id == user.id))
    ).all()


async def test_approved_export_retry_and_nonapprove_review(journey, tmp_path, monkeypatch):
    import subprocess

    from backend.app.config import settings

    a, b, db, note = journey
    await register(a)
    author, _ = await register(b)
    owner = await db.scalar(select(User).where(User.email == author["email"]))
    owner.role = "author"
    await db.commit()
    repo = tmp_path / "content"
    repo.mkdir()
    subprocess.run(["git", "-C", str(repo), "init", "-q"], check=True)
    monkeypatch.setattr(settings, "content_git_repo", str(repo))
    edited = RAW + "اصلاح\r\n"
    await a.post(
        "/api/notes/" + note.slug + "/fork",
        json={"content": edited, "expected_hash": note.current_hash},
    )
    first = (await a.post("/api/proposals", json={"slug": note.slug, "comment": "پیشنهاد"})).json()
    assert (
        await b.post(
            "/api/review/" + first["id"],
            json={"decision": "changes_requested", "comment": "بازبینی کن"},
        )
    ).status_code == 200
    await db.refresh(note)
    assert note.current_content == RAW
    p = (await a.post("/api/proposals", json={"slug": note.slug, "comment": "پیشنهاد دوم"})).json()
    approved = await b.post("/api/review/" + p["id"], json={"decision": "approve"})
    assert approved.status_code == 200
    assert approved.json()["sync_status"] == "synced"
    assert (repo / note.relative_path).read_bytes() == edited.encode()
    retry = await b.post("/api/review/" + p["id"] + "/sync")
    assert retry.status_code == 200
    assert retry.json()["sync_commit"] == approved.json()["sync_commit"]
    assert (await a.post("/api/review/" + p["id"] + "/sync")).status_code == 403


async def test_explicit_rebase_keeps_edits_and_detects_new_canonical_version(journey):
    a, b, db, note = journey
    await register(a)
    edited = RAW + "یادداشت شخصی\n"
    fork = (
        await a.post(
            "/api/notes/" + note.slug + "/fork",
            json={"content": edited, "expected_hash": note.current_hash},
        )
    ).json()
    note.current_content = RAW + "اصلاح رسمی\n"
    note.current_hash = sha256(note.current_content.encode()).hexdigest()
    await db.commit()
    path = "/api/notes/" + note.slug + "/fork/rebase"
    assert (
        await a.post(
            path,
            json={
                "content": edited,
                "expected_hash": fork["current_hash"],
                "canonical_hash": "0" * 64,
            },
        )
    ).status_code == 409
    desired = note.current_content + "یادداشت شخصی\n"
    response = await a.post(
        path,
        json={
            "content": desired,
            "expected_hash": fork["current_hash"],
            "canonical_hash": note.current_hash,
        },
    )
    assert response.status_code == 200
    assert response.json()["custom_content"] == desired
    assert response.json()["base_hash"] == note.current_hash
    assert note.current_content != desired


async def test_local_import_admin_role_index_and_conflict_are_executable(
    journey, tmp_path, monkeypatch, capsys
):
    from argparse import Namespace

    from backend.app import manage, rag
    from backend.app.models import NoteEmbedding

    a, b, db, note = journey
    user, _ = await register(a)

    async def session():
        yield db

    monkeypatch.setattr(manage, "get_session", session)
    monkeypatch.setattr(manage, "__file__", str(tmp_path / "backend/app/manage.py"))
    (tmp_path / "frontend/src/lib").mkdir(parents=True)
    root = tmp_path / ("import-" + uuid4().hex)
    root.mkdir()
    source = root / "قضیه.md"
    source.write_bytes(RAW.encode())
    (root / "image.png").write_bytes(b"fixture-image-bytes")
    args = Namespace(
        command="import-vault", path=str(root), prefix="cli-" + uuid4().hex[:8], book="ریاضی"
    )
    await manage.run(args)
    assert '"added": 1' in capsys.readouterr().out
    stored = await db.scalar(
        select(CanonicalNote).where(CanonicalNote.relative_path == root.name + "/قضیه.md")
    )
    assert stored.current_content.encode() == source.read_bytes()
    assert (
        tmp_path / "frontend/public/vault" / root.name / "image.png"
    ).read_bytes() == b"fixture-image-bytes"
    await manage.run(args)
    assert '"unchanged": 1' in capsys.readouterr().out
    source.write_bytes((RAW + "changed").encode())
    await manage.run(args)
    assert '"conflicts": 1' in capsys.readouterr().out
    await db.refresh(stored)
    assert stored.current_content == RAW
    await manage.run(Namespace(command="set-role", email=user["email"], role="author"))
    assert (await a.get("/api/auth/me")).json()["role"] == "author"

    async def fake_embed(texts):
        return [[1.0] + [0.0] * 1535 for _ in texts]

    monkeypatch.setattr(rag, "embed", fake_embed)
    await manage.run(Namespace(command="index", slug=stored.slug))
    assert (await db.scalars(select(NoteEmbedding).where(NoteEmbedding.note_id == stored.id))).all()


async def test_index_race_refuses_snapshot_changed_while_embedding(journey, monkeypatch):
    from fastapi import HTTPException
    from sqlalchemy import update

    from backend.app import rag

    a, b, db, note = journey
    original = note.current_content

    async def embed_with_change(texts):
        changed = original + "new official version"
        await db.execute(
            update(CanonicalNote)
            .where(CanonicalNote.id == note.id)
            .values(current_content=changed, current_hash=sha256(changed.encode()).hexdigest())
            .execution_options(synchronize_session=False)
        )
        return [[1.0] + [0.0] * 1535 for _ in texts]

    monkeypatch.setattr(rag, "embed", embed_with_change)
    with pytest.raises(HTTPException) as error:
        await rag.index_content(db, note.id, original, None)
    assert error.value.status_code == 409


async def test_configured_provider_refreshes_private_vectors_after_save_and_fails_soft(
    journey, monkeypatch
):
    from secrets import token_urlsafe

    from backend.app import rag
    from backend.app.config import settings
    from backend.app.models import NoteEmbedding

    a, b, db, note = journey
    user, _ = await register(a)
    monkeypatch.setattr(settings, "ai_api_key", token_urlsafe(16))

    async def session():
        yield db

    monkeypatch.setattr(rag, "get_session", session, raising=False)
    observed = []

    async def fake_embed(texts):
        observed.extend(texts)
        return [[0.0, 1.0] + [0.0] * 1534 for _ in texts]

    monkeypatch.setattr(rag, "embed", fake_embed)
    response = await a.post(
        "/api/notes/" + note.slug + "/fork",
        json={"content": RAW + "آزمون private refresh", "expected_hash": note.current_hash},
    )
    assert response.status_code == 200
    from uuid import UUID

    rows = (
        await db.scalars(select(NoteEmbedding).where(NoteEmbedding.user_id == UUID(user["id"])))
    ).all()
    assert rows and any("private refresh" in row.chunk_content for row in rows)
    from fastapi import HTTPException

    async def failed(texts):
        raise HTTPException(503, "provider offline")

    monkeypatch.setattr(rag, "embed", failed)
    failed_provider_save = await a.post(
        "/api/notes/" + note.slug + "/fork",
        json={"content": RAW + "still saved", "expected_hash": response.json()["current_hash"]},
    )
    assert failed_provider_save.status_code == 200
    assert failed_provider_save.json()["custom_content"] == RAW + "still saved"

