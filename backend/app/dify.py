"""Dify is the sole answer engine; the site owns identity and source context."""

import json
from collections.abc import AsyncIterator
from typing import Any, Literal
from uuid import UUID

import anyio
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy import select

from backend.app.config import settings
from backend.app.models import AIConversation
from backend.app.workspace import DB, Contract, Me, digest, note_by_slug, owned_fork, write_guard

router = APIRouter(prefix="/api/ai")
transport: httpx.AsyncBaseTransport | None = None


class ChatInput(Contract):
    question: str = Field(min_length=1, max_length=4000)
    slug: str = Field(min_length=1, max_length=255, pattern=r"^[\w-]+$")
    scope: Literal["canonical", "personal"]
    expected_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    selection: str = Field(min_length=1, max_length=8000)
    conversation_id: UUID | None = None


def event(name: str, data: object) -> str:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat", dependencies=[Depends(write_guard)])
async def chat(data: ChatInput, user: Me, db: DB) -> StreamingResponse:
    note = await note_by_slug(db, data.slug)
    raw, version = note.current_content, note.current_hash
    if data.scope == "personal":
        fork = await owned_fork(db, note.id, user.id)
        if fork is None:
            raise HTTPException(404, "Personal note not found")
        raw, version = fork.custom_content, fork.current_hash
    if data.expected_hash != version or digest(raw) != version:
        raise HTTPException(409, "Note changed; reload before asking")
    start = raw.find(data.selection)
    if start < 0 or raw.find(data.selection, start + 1) >= 0:
        raise HTTPException(422, "Selection must match one unique stored Markdown passage")
    if len(raw) > 120_000:
        raise HTTPException(413, "Note exceeds AI context limit")
    conversation = None
    if data.conversation_id:
        conversation = await db.scalar(
            select(AIConversation).where(
                AIConversation.id == data.conversation_id, AIConversation.user_id == user.id
            )
        )
        if conversation is None or not conversation.upstream_id:
            raise HTTPException(404, "Conversation not found")
    if not settings.dify_api_key:
        raise HTTPException(503, "Dify is not configured")
    context = {
        "note_id": str(note.id),
        "slug": note.slug,
        "scope": data.scope,
        "hash": version,
        "start": start,
        "end": start + len(data.selection),
        "selection": data.selection,
        "content": raw,
    }
    payload: dict[str, Any] = {
        "inputs": {},
        "query": json.dumps({"question": data.question, "context": context}, ensure_ascii=False),
        "user": str(user.id),
        "response_mode": "streaming",
    }
    if conversation:
        payload["conversation_id"] = conversation.upstream_id
    client = httpx.AsyncClient(
        transport=transport,
        timeout=httpx.Timeout(60, connect=10),
        headers={"Authorization": f"Bearer {settings.dify_api_key}"},
    )
    try:
        response = await client.send(
            client.build_request(
                "POST", settings.dify_base_url.rstrip("/") + "/chat-messages", json=payload
            ),
            stream=True,
        )
        response.raise_for_status()
    except (httpx.HTTPError, ValueError):
        await client.aclose()
        raise HTTPException(503, "Dify temporarily unavailable") from None
    if conversation is None:
        conversation = AIConversation(user_id=user.id)
        db.add(conversation)
        await db.commit()
    site_id = str(conversation.id)

    async def events() -> AsyncIterator[str]:
        task_id = None
        completed = False
        total = 0
        try:
            yield event("conversation", {"id": site_id})
            yield event(
                "context",
                {k: context[k] for k in ("note_id", "slug", "scope", "hash", "start", "end")},
            )
            async for line in response.aiter_lines():
                total += len(line)
                if total > 2_000_000 or len(line) > 100_000:
                    raise ValueError("Stream limit")
                if not line.startswith("data:"):
                    continue
                item = json.loads(line[5:].strip())
                if not isinstance(item, dict):
                    raise ValueError("Invalid event")
                if item.get("task_id"):
                    task_id = str(UUID(item["task_id"]))
                if item.get("conversation_id"):
                    upstream_id = str(UUID(item["conversation_id"]))
                    if conversation.upstream_id and conversation.upstream_id != upstream_id:
                        raise ValueError("Conversation mismatch")
                    if not conversation.upstream_id:
                        conversation.upstream_id = upstream_id
                        await db.commit()
                kind = item.get("event")
                if kind == "message":
                    text = item.get("answer")
                    if not isinstance(text, str) or not conversation.upstream_id:
                        raise ValueError("Invalid message")
                    yield event("text", text)
                elif kind == "message_end":
                    if not conversation.upstream_id:
                        raise ValueError("Missing conversation")
                    completed = True
                    yield event("done", {})
                    break
                elif kind in ("error", "message_replace"):
                    raise ValueError("Provider failed")
            if not completed:
                raise ValueError("Truncated stream")
        except (httpx.HTTPError, ValueError, TypeError, KeyError):
            yield event("error", {"message": "Dify stream interrupted; retry your request"})
        finally:
            # Starlette disconnect cancellation must not cancel bounded upstream cleanup.
            with anyio.CancelScope(shield=True):
                if not completed and task_id:
                    try:
                        await client.post(
                            settings.dify_base_url.rstrip("/") + f"/chat-messages/{task_id}/stop",
                            json={"user": str(user.id)},
                            timeout=3,
                        )
                    except httpx.HTTPError:
                        pass
                await response.aclose()
                await client.aclose()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
