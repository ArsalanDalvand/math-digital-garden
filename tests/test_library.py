"""Real database, two-owner acceptance; dedicated test DB only."""

import base64
import os
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from backend.app.database import get_session
from backend.app.library import router
from backend.app.models import User
from backend.app.workspace import current_user

DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = [pytest.mark.integration, pytest.mark.skipif(not DATABASE_URL, reason="dedicated DB")]


@pytest.fixture
async def clients():
    assert DATABASE_URL.split("?")[0].endswith("_test")
    engine = create_async_engine(DATABASE_URL, poolclass=NullPool)
    async with engine.connect() as conn:
        transaction = await conn.begin()
        async with AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as db:
            users = [
                User(
                    id=uuid4(),
                    email=uuid4().hex + "@example.org",
                    role=role,
                    password_hash="unused",
                )
                for role in ("student", "student", "admin")
            ]
            db.add_all(users)
            await db.flush()
            app = FastAPI()
            app.include_router(router)

            async def session():
                yield db

            async def user(request: Request):
                return users[int(request.headers.get("x-test-user", "0"))]

            app.dependency_overrides[get_session] = session
            app.dependency_overrides[current_user] = user
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
                headers={"X-Requested-With": "MathGarden"},
            ) as client:
                yield client
        await transaction.rollback()
    await engine.dispose()


async def create(client, **fields):
    response = await client.post(
        "/api/library/items", json={"kind": "note", "title": "note", **fields}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_owner_tree_history_and_conflicts(clients):
    c = clients
    folder = await create(c, kind="folder", title="private folder")
    note = await create(c, parent_id=folder["id"], content="$$x\\in X$$\r\n[[private]]")
    path = "/api/library/items/" + note["id"]
    assert (await c.get(path, headers={"x-test-user": "1"})).status_code == 404
    assert (await c.get("/api/library/items", headers={"x-test-user": "1"})).json() == []
    assert (
        await c.patch(path, json={"content": "bad", "expected_hash": "0" * 64})
    ).status_code == 409
    saved = await c.patch(path, json={"content": "draft", "expected_hash": note["current_hash"]})
    assert saved.status_code == 200, saved.text
    history = (await c.get(path + "/history")).json()
    assert len(history) == 2
    original = next(r for r in history if r["content"] == note["content"])
    restored = await c.post(
        path + "/history/" + original["id"] + "/restore",
        json={"expected_hash": saved.json()["current_hash"]},
    )
    assert restored.json()["content"] == note["content"]
    child = await create(c, kind="folder", parent_id=folder["id"])
    folder_path = "/api/library/items/" + folder["id"]
    assert (await c.patch(folder_path, json={"parent_id": child["id"]})).status_code == 409
    assert (await c.post(folder_path + "/trash")).status_code == 409
    assert (await c.post(folder_path + "/trash?subtree=true")).status_code == 200
    assert (await c.get(path)).status_code == 404
    assert (await c.post(path + "/restore")).status_code == 404
    assert (await c.post(folder_path + "/restore")).status_code == 200
    assert (await c.get(path)).json()["content"] == note["content"]
    assert (await c.patch(path, json={"title": "../bad"})).status_code == 422
    assert (await c.get("/api/library/items?limit=101")).status_code == 422


async def test_publication_attachments_comments_watch_verification(clients):
    c = clients
    note = await create(c, content="shared original")
    path = "/api/library/items/" + note["id"]
    upload = await c.post(
        path + "/attachments",
        json={"filename": "proof.txt", "content_base64": base64.b64encode(b"safe bytes").decode()},
    )
    attachment = upload.json()
    shared = (await c.put(path + "/publication", json={"visibility": "unlisted"})).json()
    token = shared["share_token"]
    shared_url = "/api/library/shared/" + token
    assert (await c.get(shared_url)).json()["content"] == "shared original"
    assert "parent_id" not in (await c.get(shared_url)).json()
    assert (await c.get(path + "/comments", headers={"x-test-user": "1"})).status_code == 404
    qs = "?token=" + token
    other = {"x-test-user": "1"}
    thread = await c.post(path + "/comments" + qs, json={"content": "question"}, headers=other)
    assert thread.status_code == 201, thread.text
    comment = thread.json()
    reply = await c.post(
        path + "/comments" + qs, json={"content": "answer", "parent_id": comment["id"]}
    )
    assert reply.status_code == 201
    assert (
        await c.put(
            path + "/comments/" + comment["id"] + "/resolve" + qs,
            json={"resolved": True},
            headers=other,
        )
    ).status_code == 403
    assert (
        await c.put(path + "/comments/" + comment["id"] + "/resolve", json={"resolved": True})
    ).status_code == 200
    assert (
        await c.patch(path + "/comments/" + comment["id"], json={"content": "steal"})
    ).status_code == 404
    assert (
        await c.put(path + "/watch" + qs, json={"watching": True}, headers=other)
    ).status_code == 200
    assert (
        await c.patch(
            path, json={"content": "PRIVATE NEXT DRAFT", "expected_hash": note["current_hash"]}
        )
    ).status_code == 200
    assert (await c.get(shared_url)).json()["content"] == "shared original"
    assert (await c.get("/api/library/watching", headers=other)).json()[0]["updated"] is False
    private_attachment = (
        await c.post(
            path + "/attachments",
            json={
                "filename": "private.txt",
                "content_base64": base64.b64encode(b"draft secret").decode(),
            },
        )
    ).json()
    download = "/api/library/public/" + note["id"] + "/attachments/"
    assert (await c.get(download + attachment["id"] + qs)).content == b"safe bytes"
    assert (await c.get(download + private_attachment["id"] + qs)).status_code == 404
    assert (
        await c.get("/api/library/attachments/" + attachment["id"], headers=other)
    ).status_code == 404
    assert (await c.put(path + "/verification", json={"verified": True})).status_code == 403
    await c.put(path + "/publication", json={"visibility": "public"})
    assert (await c.get(shared_url)).status_code == 404
    assert (await c.get("/api/library/watching", headers=other)).json()[0]["updated"] is True
    verified = await c.put(
        path + "/verification", json={"verified": True}, headers={"x-test-user": "2"}
    )
    assert verified.status_code == 200, verified.text
    public = await c.get("/api/library/public/" + note["id"])
    assert public.json()["verified"] is True
    assert public.json()["verified_by"]
    await c.put(path + "/publication", json={"visibility": "private"})
    assert (await c.get("/api/library/public/" + note["id"])).status_code == 404
    assert (await c.get("/api/library/watching", headers=other)).json() == []
    assert (await c.get(download + attachment["id"])).status_code == 404
    assert (await c.delete("/api/library/attachments/" + attachment["id"])).status_code == 204


async def test_favorites_identity_and_revocation(clients):
    c = clients
    note = await create(c, content="share me")
    path = "/api/library/items/" + note["id"]
    other = {"x-test-user": "1"}
    assert (
        await c.put(path + "/favorite", json={"favorite": True}, headers=other)
    ).status_code == 404
    assert (await c.put(path + "/favorite", json={"favorite": True})).status_code == 200
    assert (await c.get("/api/library/favorites", headers=other)).json() == []
    token = (await c.put(path + "/publication", json={"visibility": "unlisted"})).json()[
        "share_token"
    ]
    assert (
        await c.put(path + "/favorite?token=" + token, json={"favorite": True}, headers=other)
    ).status_code == 200
    assert (await c.get("/api/library/favorites", headers=other)).json()[0][
        "href"
    ] == "/shared/" + token
    await c.put(path + "/favorite", json={"favorite": False})
    assert (await c.get("/api/library/favorites")).json() == []
    assert len((await c.get("/api/library/favorites", headers=other)).json()) == 1
    await c.put(path + "/publication", json={"visibility": "private"})
    assert (await c.get("/api/library/favorites", headers=other)).json() == []
    assert (await c.get(path + "/favorite?token=" + token, headers=other)).status_code == 404


async def test_revoked_tokens_trash_and_attachment_whitelist(clients):
    c = clients
    folder = await create(c, kind="folder", title="SECRET PARENT")
    note = await create(c, parent_id=folder["id"], title="visible snapshot", content="old")
    path = "/api/library/items/" + note["id"]
    token = (await c.put(path + "/publication", json={"visibility": "unlisted"})).json()[
        "share_token"
    ]
    other = {"x-test-user": "1"}
    for action in ("comments", "watch", "favorite"):
        response = await c.get(path + "/" + action, params={"token": "ناامن"}, headers=other)
        assert response.status_code == 404
    for action, body in (("watch", {"watching": True}), ("favorite", {"favorite": True})):
        assert (
            await c.put(path + "/" + action, params={"token": token}, json=body, headers=other)
        ).status_code == 200
    await c.patch(
        path,
        json={
            "title": "SECRET DRAFT TITLE",
            "content": "SECRET DRAFT BODY",
            "expected_hash": note["current_hash"],
        },
    )
    shared = await c.get("/api/library/shared/" + token)
    assert shared.headers["cache-control"] == "no-store"
    assert "SECRET" not in shared.text
    new_token = (await c.put(path + "/publication", json={"visibility": "unlisted"})).json()[
        "share_token"
    ]
    assert new_token != token
    assert (await c.get("/api/library/shared/" + token)).status_code == 404
    for action in ("watching", "favorites"):
        assert (await c.get("/api/library/" + action, headers=other)).json() == []
    for action in ("watch", "favorite", "comments"):
        assert (
            await c.get(path + "/" + action, params={"token": token}, headers=other)
        ).status_code == 404
    await c.put(path + "/publication", json={"visibility": "public"})
    await c.post("/api/library/items/" + folder["id"] + "/trash?subtree=true")
    assert (await c.get("/api/library/public/" + note["id"])).status_code == 404
    assert (await c.get("/api/library/public")).json() == []
    for action in ("watch", "favorite", "comments", "attachments", "history"):
        assert (await c.get(path + "/" + action)).status_code == 404
    for name in ("../proof.txt", "bad\\path", "bad\r\nheader", "bad\x00name"):
        assert (
            await c.post(path + "/attachments", json={"filename": name, "content_base64": "YQ=="})
        ).status_code == 422


async def test_comment_author_and_title_publication_updates(clients):
    c = clients
    note = await create(c, title="original")
    path = "/api/library/items/" + note["id"]
    await c.put(path + "/publication", json={"visibility": "public"})
    other = {"x-test-user": "1"}
    thread = (
        await c.post(path + "/comments", json={"content": "other author"}, headers=other)
    ).json()
    url = path + "/comments/" + thread["id"]
    assert (await c.patch(url, json={"content": "owner cannot change others"})).status_code == 404
    assert (await c.delete(url)).status_code == 404
    assert (
        await c.patch(url, json={"content": "updated own comment"}, headers=other)
    ).status_code == 200
    assert (await c.delete(url, headers=other)).status_code == 204
    assert (await c.get(path + "/comments")).json()[0]["content"] == "[deleted]"
    await c.put(path + "/watch", json={"watching": True}, headers=other)
    await c.patch(path, json={"title": "new title draft"})
    assert (await c.get(path + "/watch", headers=other)).json()["updated"] is False
    await c.put(path + "/publication", json={"visibility": "public"})
    assert (await c.get(path + "/watch", headers=other)).json()["updated"] is True
    await c.put(path + "/watch", json={"watching": True}, headers=other)
    assert (await c.get(path + "/watch", headers=other)).json()["updated"] is False


async def test_public_attachment_pagination_filters_before_limit(clients):
    c = clients
    note = await create(c)
    path = "/api/library/items/" + note["id"]
    ids = []
    for name in ("first.txt", "second.txt", "third.txt"):
        response = await c.post(
            path + "/attachments", json={"filename": name, "content_base64": "YQ=="}
        )
        assert response.status_code == 201
        ids.append(response.json()["id"])
    token = (await c.put(path + "/publication", json={"visibility": "unlisted"})).json()[
        "share_token"
    ]
    await c.post(path + "/attachments", json={"filename": "SECRET DRAFT", "content_base64": "YQ=="})
    url = "/api/library/public/" + note["id"] + "/attachments"
    seen = []
    for offset in range(4):
        response = await c.get(url, params={"token": token, "offset": offset, "limit": 1})
        assert response.status_code == 200
        page = response.json()
        assert len(page) <= 1
        assert "SECRET" not in response.text
        seen.extend(row["id"] for row in page)
    assert seen == sorted(ids)
    for params in ({"limit": 0}, {"limit": 101}, {"offset": -1}):
        assert (await c.get(url, params={"token": token, **params})).status_code == 422
    assert (
        await c.get(url, params={"token": "revoked", "offset": 3, "limit": 1})
    ).status_code == 404
