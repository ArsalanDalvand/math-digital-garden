"""Full canonical menu uses the existing personal fork; real isolated PostgreSQL."""

import pytest

from tests.test_workspace import DATABASE_URL, RAW, register

pytestmark = [pytest.mark.integration, pytest.mark.skipif(not DATABASE_URL, reason="dedicated DB")]


async def test_canonical_comments_without_fork_or_publication(journey):
    from sqlalchemy import func, select

    from backend.app.library_models import LibraryCanonical
    from backend.app.models import User, UserNoteFork

    a, b, db, note = journey
    path = "/api/library/canonical/" + note.slug + "/comments"
    assert (await a.get(path)).status_code == 401
    assert (await a.post(path, json={"content": "anonymous"})).status_code == 401
    await register(a)
    await register(b)
    assert (
        await a.post(path, json={"content": "bad"}, headers={"Origin": "https://evil.invalid"})
    ).status_code == 403
    result = await a.post(path, json={"content": "Shared question"})
    assert result.status_code == 201, result.text
    thread = result.json()
    assert any(
        row["id"] == thread["id"] and row["content"] == "Shared question"
        for row in (await b.get(path)).json()
    )
    assert (
        await db.scalar(
            select(func.count())
            .select_from(LibraryCanonical)
            .where(LibraryCanonical.note_id == note.id)
        )
        == 0
    )
    assert (
        await db.scalar(
            select(func.count()).select_from(UserNoteFork).where(UserNoteFork.note_id == note.id)
        )
        == 0
    )
    url = path + "/" + thread["id"]
    assert (await b.patch(url, json={"content": "stolen"})).status_code == 404
    assert (await b.delete(url)).status_code == 404
    assert (await a.put(url + "/resolve", json={"resolved": True})).status_code == 403
    reply = await b.post(path, json={"content": "Reply", "parent_id": thread["id"]})
    assert reply.status_code == 201
    assert (
        await a.post(path, json={"content": "nested", "parent_id": reply.json()["id"]})
    ).status_code == 422
    assert (await a.get(path + "?limit=101")).status_code == 422
    assert len((await a.get(path + "?limit=1&offset=1")).json()) == 1
    assert (await a.get("/api/library/canonical/missing/comments")).status_code == 404
    private = (await a.post("/api/library/items", json={"kind": "note", "title": "Private"})).json()
    personal = "/api/library/items/" + private["id"]
    await a.put(personal + "/publication", json={"visibility": "public"})
    assert (
        await a.post(
            personal + "/comments", json={"content": "wrong target", "parent_id": thread["id"]}
        )
    ).status_code == 422
    own = (await a.post(personal + "/comments", json={"content": "separate"})).json()
    assert (
        await a.post(path, json={"content": "wrong target", "parent_id": own["id"]})
    ).status_code == 422
    assert any(
        row["id"] == thread["id"] and row["content"] == "Shared question"
        for row in (await b.get(path)).json()
    )
    author_id = (await b.get("/api/auth/me")).json()["id"]
    from uuid import UUID

    author = await db.get(User, UUID(author_id))
    author.role = "author"
    await db.flush()
    assert (await b.put(url + "/resolve", json={"resolved": True})).status_code == 200
    assert (await a.patch(url, json={"content": "Updated question"})).status_code == 200
    assert (await a.delete(url)).status_code == 204
    rows = {row["id"]: row for row in (await b.get(path)).json()}
    assert (
        rows[thread["id"]]["content"] == "[deleted]"
        and rows[reply.json()["id"]]["content"] == "Reply"
    )
    assert note.current_content == RAW


async def test_canonical_actions_preserve_fork_and_publication(journey):
    a, b, db, note = journey
    await register(a)
    await register(b)
    endpoint = "/api/library/canonical/" + note.slug
    assert (await a.get(endpoint)).status_code == 404
    fork_path = "/api/notes/" + note.slug + "/fork"
    raw = RAW + "\r\nprivate student A"
    fork = (
        await a.post(fork_path, json={"content": raw, "expected_hash": note.current_hash})
    ).json()
    result = await a.post(endpoint, json={})
    assert result.status_code == 200, result.text
    item = result.json()
    assert item["content"] == raw
    assert (await a.post(endpoint, json={})).json()["id"] == item["id"]
    assert (await a.get("/api/library/items")).json() == []
    path = "/api/library/items/" + item["id"]
    assert (await b.get(path)).status_code == 404
    assert (await b.get(endpoint)).status_code == 404
    assert (
        await b.post("/api/library/canonical/metadata", json={"slugs": [note.slug]})
    ).json() == []
    assert (await a.put(path + "/publication", json={"visibility": "public"})).status_code == 200
    public = "/api/library/public/" + item["id"]
    assert (await b.get(public)).json()["content"] == raw
    next_raw = raw + "\nnext draft"
    saved = await a.post(
        fork_path, json={"content": next_raw, "expected_hash": fork["current_hash"]}
    )
    assert saved.status_code == 200, saved.text
    assert (await a.get(path)).json()["content"] == next_raw
    assert (await b.get(public)).json()["content"] == raw
    revisions = (await a.get(path + "/history")).json()
    old = next(r for r in revisions if r["content"] == raw)
    restored = await a.post(
        path + "/history/" + old["id"] + "/restore",
        json={"expected_hash": saved.json()["current_hash"]},
    )
    assert restored.status_code == 200, restored.text
    assert (await a.get("/api/workspace/notes/" + note.slug)).json()["fork"][
        "custom_content"
    ] == raw
    assert (await b.get("/api/workspace/notes/" + note.slug)).json()["fork"] is None
    assert note.current_content == RAW


async def test_canonical_placement_and_security(journey):
    a, b, db, note = journey
    endpoint = "/api/library/canonical/" + note.slug
    assert (await a.post(endpoint, json={})).status_code == 401
    await register(a)
    await register(b)
    assert (
        await a.post(endpoint, json={}, headers={"Origin": "https://evil.invalid"})
    ).status_code == 403
    result = await a.post(endpoint, json={})
    assert result.status_code == 200, result.text
    item = result.json()
    path = "/api/library/items/" + item["id"]
    meta = "/api/library/canonical/metadata"
    assert (await a.post(meta, json={"slugs": [note.slug] * 101})).status_code == 422
    assert (await a.patch(path, json={"title": "my title"})).status_code == 200
    overlay = (await a.post(meta, json={"slugs": [note.slug]})).json()[0]
    assert overlay["title"] == "my title" and overlay["hidden"] is False
    assert "content" not in overlay and "share_token" not in overlay
    assert (await a.patch(path, json={"parent_id": None})).status_code == 200
    assert (await a.post(meta, json={"slugs": [note.slug]})).json()[0]["hidden"] is True
    assert (await a.get("/api/library/items")).json()[0]["canonical_slug"] == note.slug
    assert (await a.post(path + "/trash")).status_code == 200
    assert (await a.post(endpoint, json={})).status_code == 404
    assert (await a.post(path + "/restore")).status_code == 200
    other = (await b.post(endpoint, json={})).json()
    assert other["id"] != item["id"]
    assert other["title"] == note.title


async def test_empty_fork_reset_and_shared_actions(journey):
    import base64

    a, b, db, note = journey
    await register(a)
    await register(b)
    fork_path = "/api/notes/" + note.slug + "/fork"
    await a.post(fork_path, json={"content": "", "expected_hash": note.current_hash})
    item = (await a.post("/api/library/canonical/" + note.slug, json={})).json()
    path = "/api/library/items/" + item["id"]
    assert item["content"] == ""
    assert (await a.get(path + "/attachments")).json() == []
    attachment = (
        await a.post(
            path + "/attachments",
            json={
                "filename": "proof.txt",
                "content_base64": base64.b64encode(b"proof bytes\x00").decode(),
            },
        )
    ).json()
    assert (await b.get("/api/library/attachments/" + attachment["id"])).status_code == 404
    assert (await a.put(path + "/favorite", json={"favorite": True})).status_code == 200
    assert (await a.put(path + "/watch", json={"watching": True})).status_code == 200
    assert (await b.put(path + "/publication", json={"visibility": "public"})).status_code == 404
    assert (await b.patch(path, json={"title": "stolen"})).status_code == 404
    assert (await b.post(path + "/trash")).status_code == 404
    assert (await b.get(path + "/history")).status_code == 404
    shared = (await a.put(path + "/publication", json={"visibility": "unlisted"})).json()
    token = shared["share_token"]
    assert (
        await b.post(path + "/comments?token=" + token, json={"content": "question"})
    ).status_code == 201
    download = (
        "/api/library/public/" + item["id"] + "/attachments/" + attachment["id"] + "?token=" + token
    )
    response = await b.get(download)
    assert response.status_code == 200 and response.content == b"proof bytes\x00"
    assert response.headers["content-type"] == "application/octet-stream"
    reset = await a.post(fork_path + "/reset", json={"expected_hash": item["current_hash"]})
    assert reset.status_code == 200
    assert (await a.get(path)).json()["content"] == RAW
    assert (await b.get("/api/library/shared/" + token)).json()["content"] == ""
    await a.put(path + "/publication", json={"visibility": "private"})
    assert (await b.get("/api/library/shared/" + token)).status_code == 404
    assert (await b.get(download)).status_code == 404


async def test_author_personal_actions_leave_canonical_unchanged(journey):
    from uuid import UUID

    from backend.app.models import User

    a, b, db, note = journey
    account, _ = await register(a)
    author = await db.get(User, UUID(account["id"]))
    author.role = "author"
    await db.flush()
    item = (await a.post("/api/library/canonical/" + note.slug, json={})).json()
    path = "/api/library/items/" + item["id"]
    assert (
        await a.patch(
            path, json={"content": "author personal", "expected_hash": item["current_hash"]}
        )
    ).status_code == 200
    assert (await a.put(path + "/publication", json={"visibility": "public"})).status_code == 200
    assert (await b.get("/api/library/public/" + item["id"])).json()["content"] == "author personal"
    assert (await b.get(path)).status_code == 401
    assert note.current_content == RAW
