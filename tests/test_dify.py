"""Slice B: real site/DB authorization, explicitly mocked Dify transport."""

import json
from uuid import uuid4

import httpx
import pytest

from backend.app.config import settings
from tests.test_workspace import DATABASE_URL, RAW, register

pytest_plugins = ["tests.test_workspace"]
pytestmark = [pytest.mark.integration, pytest.mark.skipif(not DATABASE_URL, reason="dedicated DB")]


def body(note, **changes):
    return dict(
        question="توضیح بده",
        slug=note.slug,
        scope="canonical",
        expected_hash=note.current_hash,
        selection="پایان",
        **changes,
    )


async def test_dify_identity_context_version_selection_and_owner(journey, monkeypatch):
    from backend.app import dify

    a, b, db, note = journey
    assert (await a.post("/api/ai/chat", json=body(note))).status_code == 401
    await register(a)
    await register(b)
    observed = []

    async def transport(request):
        payload = json.loads(request.content)
        observed.append(payload)
        upstream = payload.get("conversation_id") or str(uuid4())
        return httpx.Response(
            200,
            text="".join(
                "data: " + json.dumps(e) + "\n\n"
                for e in [
                    {
                        "event": "message",
                        "conversation_id": upstream,
                        "task_id": str(uuid4()),
                        "answer": "توضیح $x$",
                    },
                    {
                        "event": "message_end",
                        "conversation_id": upstream,
                        "metadata": {"secret": "PRIVATE_B"},
                    },
                ]
            ),
        )

    monkeypatch.setattr(dify, "transport", httpx.MockTransport(transport))
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "dify_api_key", "fixture-only")
    monkeypatch.setattr(settings, "dify_base_url", "https://dify.invalid/v1")
    for changes, status in [
        ({"expected_hash": "0" * 64}, 409),
        ({"selection": "invented"}, 422),
        ({"scope": "personal"}, 404),
    ]:
        payload = body(note)
        payload.update(changes)
        assert (await a.post("/api/ai/chat", json=payload)).status_code == status
    assert not observed
    result = await a.post("/api/ai/chat", json=body(note))
    assert result.status_code == 200 and "event: done" in result.text
    assert "PRIVATE_B" not in result.text and observed[0]["response_mode"] == "streaming"
    assert json.loads(observed[0]["query"])["context"]["content"] == RAW
    assert observed[0]["user"] == (await a.get("/api/auth/me")).json()["id"]
    frame = result.text.split("event: conversation\ndata: ")[1].split("\n")[0]
    conversation = json.loads(frame)["id"]
    payload = body(note)
    payload["conversation_id"] = conversation
    assert (await b.post("/api/ai/chat", json=payload)).status_code == 404
    assert len(observed) == 1
    personal = RAW + "\nPRIVATE_A"
    fork = (
        await a.post(
            "/api/notes/" + note.slug + "/fork",
            json={"content": personal, "expected_hash": note.current_hash},
        )
    ).json()
    payload.update(scope="personal", expected_hash=fork["current_hash"], selection="PRIVATE_A")
    assert (await a.post("/api/ai/chat", json=payload)).status_code == 200
    assert json.loads(observed[-1]["query"])["context"]["content"] == personal
    assert observed[-1]["conversation_id"]
    assert (await b.get("/api/ai/workflows/" + conversation)).status_code == 404
    assert (await b.get("/api/ai/files/" + conversation)).status_code == 404


async def test_dify_failure_does_not_break_notes(journey, monkeypatch):
    from backend.app import dify

    a, b, db, note = journey
    await register(a)
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "dify_api_key", "")
    assert (await a.post("/api/ai/chat", json=body(note))).status_code == 503
    monkeypatch.setattr(settings, "dify_api_key", "fixture-only")

    async def failure(request):
        raise httpx.ConnectError("secret provider diagnostic")

    monkeypatch.setattr(dify, "transport", httpx.MockTransport(failure))
    result = await a.post("/api/ai/chat", json=body(note))
    assert result.status_code == 503 and "secret" not in result.text
    assert (await a.get("/api/workspace/notes/" + note.slug)).status_code == 200
    assert (
        await a.post(
            "/api/notes/" + note.slug + "/fork",
            json={"content": RAW + " edit", "expected_hash": note.current_hash},
        )
    ).status_code == 200


async def test_dify_interrupted_stream_and_cancel_stop_owned_task(journey, monkeypatch):
    from sqlalchemy import select

    from backend.app import dify
    from backend.app.models import User

    a, b, db, note = journey
    identity, _ = await register(a)
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "dify_api_key", "fixture-only")
    upstream, task = str(uuid4()), str(uuid4())
    stops = []

    async def transport(request):
        if request.url.path.endswith("/stop"):
            stops.append((request.url.path, json.loads(request.content)))
            return httpx.Response(200, json={"result": "success"})
        return httpx.Response(
            200,
            text="data: "
            + json.dumps(
                {
                    "event": "message",
                    "conversation_id": upstream,
                    "task_id": task,
                    "answer": "partial",
                }
            )
            + "\n\n",
        )

    monkeypatch.setattr(dify, "transport", httpx.MockTransport(transport))
    response = await a.post("/api/ai/chat", json=body(note))
    assert "event: error" in response.text and "event: done" not in response.text
    assert stops == [(f"/v1/chat-messages/{task}/stop", {"user": identity["id"]})]
    user = await db.scalar(select(User).where(User.id == identity["id"]))
    response = await dify.chat(dify.ChatInput(**body(note)), user, db)
    iterator = response.body_iterator
    assert "event: conversation" in await anext(iterator)
    assert "event: context" in await anext(iterator)
    assert "event: text" in await anext(iterator)
    await iterator.aclose()
    assert len(stops) == 2 and stops[-1][1]["user"] == identity["id"]


async def test_dify_rejects_spoofed_identity_ambiguous_selection_and_upstream_error(
    journey, monkeypatch
):
    from backend.app import dify

    a, b, db, note = journey
    await register(a)
    await register(b)
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "dify_api_key", "fixture-only")
    observed = []

    async def transport(request):
        observed.append(request)
        return httpx.Response(401, text="SECRET diagnostic")

    monkeypatch.setattr(dify, "transport", httpx.MockTransport(transport))
    payload = body(note)
    payload["user"] = str(uuid4())
    assert (await a.post("/api/ai/chat", json=payload)).status_code == 422
    payload = body(note)
    payload["selection"] = "\n"
    assert (await a.post("/api/ai/chat", json=payload)).status_code == 422
    for client, content in [(a, RAW + "PRIVATE_A"), (b, RAW + "PRIVATE_B")]:
        assert (
            await client.post(
                "/api/notes/" + note.slug + "/fork",
                json={"content": content, "expected_hash": note.current_hash},
            )
        ).status_code == 200
    own = (await b.get("/api/workspace/notes/" + note.slug)).json()["fork"]
    payload = body(note)
    payload.update(scope="personal", selection="PRIVATE_A", expected_hash=own["current_hash"])
    assert (await b.post("/api/ai/chat", json=payload)).status_code == 422
    assert not observed
    response = await a.post("/api/ai/chat", json=body(note))
    assert response.status_code == 503 and "SECRET" not in response.text


async def test_disconnect_cleanup_survives_cancelled_request_scope(journey, monkeypatch):
    import anyio
    from sqlalchemy import select

    from backend.app import dify
    from backend.app.models import User

    a, b, db, note = journey
    identity, _ = await register(a)
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "dify_api_key", "fixture-only")
    task, upstream = str(uuid4()), str(uuid4())
    stopped = []

    async def transport(request):
        if request.url.path.endswith("/stop"):
            await anyio.sleep(0.01)
            stopped.append(json.loads(request.content)["user"])
            return httpx.Response(200, json={"result": "success"})
        return httpx.Response(
            200,
            text="data: "
            + json.dumps(
                {
                    "event": "message",
                    "task_id": task,
                    "conversation_id": upstream,
                    "answer": "partial",
                }
            )
            + "\n\n",
        )

    monkeypatch.setattr(dify, "transport", httpx.MockTransport(transport))
    user = await db.scalar(select(User).where(User.id == identity["id"]))
    response = await dify.chat(dify.ChatInput(**body(note)), user, db)
    iterator = response.body_iterator
    for _ in range(3):
        await anext(iterator)
    with anyio.CancelScope() as scope:
        scope.cancel()
        await iterator.aclose()
    assert stopped == [identity["id"]]
