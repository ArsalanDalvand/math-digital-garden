"""Dify / AI chat engine with grounded multi-note retrieval across the knowledge base."""

import json
import re
from collections.abc import AsyncIterator
from typing import Any, Literal
from uuid import UUID

import anyio
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy import or_, select

from backend.app.config import settings
from backend.app.models import AIConversation, CanonicalNote
from backend.app.workspace import DB, Contract, Me, digest, note_by_slug, owned_fork, write_guard, limiter

router = APIRouter(prefix="/api/ai")
transport: httpx.AsyncBaseTransport | None = None

STOPWORDS = {
    "این", "برای", "چیه", "است", "هست", "کدام", "چگونه", "چرا", "های",
    "هایش", "یک", "بخش", "لطفا", "توضیح", "بده", "کنید", "دارد", "شود", "یعنی"
}


async def find_related_notes(db: DB, current_slug: str, text: str, limit: int = 3) -> list[dict[str, str]]:
    words = [w for w in re.findall(r"[\w\u0600-\u06FF]+", text) if len(w) >= 3 and w not in STOPWORDS]
    if not words:
        return []

    candidates = (await db.scalars(
        select(CanonicalNote)
        .where(CanonicalNote.slug != current_slug)
        .where(or_(*[CanonicalNote.title.ilike(f"%{w}%") for w in words]))
        .limit(20)
    )).all()

    if len(candidates) < limit:
        content_candidates = (await db.scalars(
            select(CanonicalNote)
            .where(CanonicalNote.slug != current_slug)
            .where(or_(*[CanonicalNote.current_content.ilike(f"%{w}%") for w in words]))
            .limit(10)
        )).all()
        candidates = list({c.slug: c for c in list(candidates) + list(content_candidates)}.values())

    scored = []
    for c in candidates:
        score = sum(3 for w in words if w.lower() in c.title.lower()) + sum(1 for w in words if w.lower() in c.current_content.lower())
        scored.append((score, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:limit]
    return [
        {
            "slug": c.slug,
            "title": c.title,
            "chapter": c.chapter_slug,
            "content": c.current_content[:3000]
        }
        for score, c in top if score > 0
    ]


class ChatInput(Contract):
    question: str = Field(min_length=1, max_length=4000)
    slug: str = Field(min_length=1, max_length=255, pattern=r"^[\w-]+$")
    scope: Literal["canonical", "personal"]
    expected_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    selection: str = Field(default="", max_length=8000)
    conversation_id: UUID | None = None


def event(name: str, data: object) -> str:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat", dependencies=[Depends(write_guard)])
@limiter.limit("25/minute")
async def chat(request: Request, data: ChatInput, user: Me, db: DB) -> StreamingResponse:
    note = await note_by_slug(db, data.slug)
    raw, version = note.current_content, note.current_hash
    if data.scope == "personal":
        fork = await owned_fork(db, note.id, user.id)
        if fork is None:
            raise HTTPException(404, "Personal note not found")
        raw, version = fork.custom_content, fork.current_hash
    if data.expected_hash != version or digest(raw) != version:
        raise HTTPException(409, "Note changed; reload before asking")
    start = 0
    if data.selection:
        start = raw.find(data.selection)
        if start < 0:
            start = raw.find(data.selection.strip())
            if start < 0 and settings.dify_api_key:
                raise HTTPException(422, "Selection must match stored Markdown passage")
            start = max(0, start)
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

    if not settings.dify_api_key:
        if not settings.ai_api_key:
            raise HTTPException(503, "Dify is not configured")

        if conversation is None:
            conversation = AIConversation(user_id=user.id, upstream_id=str(UUID(int=0)))
            db.add(conversation)
            await db.commit()
        site_id = str(conversation.id)

        selection_text = data.selection if data.selection else "کل یادداشت جاری"
        related_text = ""
        try:
            related = await find_related_notes(db, note.slug, data.question + " " + data.selection)
            if related:
                snippets = []
                for r in related:
                    snippets.append(f"### عنوان یادداشت مرتبط: {r['title']} (فصل: {r['chapter']})\n{r['content']}")
                related_text = "\n\n---\n## یادداشت‌های مرتبط از کل پایگاه دانش:\n" + "\n\n".join(snippets)
        except Exception:
            pass

        system_prompt = (
            "شما یک دستیار و استاد دقیق، علمی و مسلط به ریاضیات و کتاب «جبر خطی آکسلر» (Linear Algebra Done Right) در سامانهٔ «باغ ریاضی» هستید.\n"
            "پاسخ شما باید کاملاً مستند به متن پایگاه دانش، دقیق، مفهومی، روان و به زبان فارسی باشد.\n"
            "برای تمام نمادها و روابط ریاضی حتماً از نشانه‌گذاری استاندارد LaTeX ($...$ درون‌خطی و $$...$$ بلوکی) استفاده کنید.\n"
            "پاسخ خود را بر مبنای یادداشت جاری و در صورت نیاز با استناد به یادداشت‌های مرتبط پایگاه دانش ارائه دهید.\n\n"
            f"یادداشت جاری:\nعنوان: {note.title}\n{raw}\n\n"
            f"بخش فوکوس/انتخاب کاربر:\n{selection_text}"
            f"{related_text}"
        )
        ai_payload: dict[str, Any] = {
            "model": settings.ai_chat_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": data.question},
            ],
            "stream": True,
        }
        openai_client = httpx.AsyncClient(
            transport=transport,
            timeout=httpx.Timeout(90, connect=10),
            headers={"Authorization": f"Bearer {settings.ai_api_key}"},
        )
        try:
            openai_resp = await openai_client.send(
                openai_client.build_request(
                    "POST", settings.ai_base_url.rstrip("/") + "/chat/completions", json=ai_payload
                ),
                stream=True,
            )
            openai_resp.raise_for_status()
        except (httpx.HTTPError, ValueError):
            await openai_client.aclose()
            raise HTTPException(503, "AI provider temporarily unavailable") from None

        async def openai_events() -> AsyncIterator[str]:
            completed = False
            total = 0
            try:
                yield event("conversation", {"id": site_id})
                yield event(
                    "context",
                    {k: context[k] for k in ("note_id", "slug", "scope", "hash", "start", "end")},
                )
                async for line in openai_resp.aiter_lines():
                    total += len(line)
                    if total > 2_000_000 or len(line) > 100_000:
                        raise ValueError("Stream limit")
                    if not line.startswith("data:"):
                        continue
                    line_data = line[5:].strip()
                    if line_data == "[DONE]":
                        completed = True
                        yield event("done", {})
                        break
                    try:
                        chunk = json.loads(line_data)
                    except Exception:
                        continue
                    choices = chunk.get("choices") or []
                    if choices:
                        delta = choices[0].get("delta") or {}
                        text_delta = delta.get("content")
                        if text_delta:
                            yield event("text", text_delta)
                if not completed:
                    yield event("done", {})
            except Exception:
                yield event("error", {"message": "AI stream interrupted; retry your request"})
            finally:
                await openai_resp.aclose()
                await openai_client.aclose()

        return StreamingResponse(
            openai_events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )
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
