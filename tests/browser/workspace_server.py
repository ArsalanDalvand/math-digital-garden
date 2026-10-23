"""Dedicated E2E stack. Fake provider is never imported by the application."""

import asyncio
import json
import os
import subprocess
import tempfile

import uvicorn
import httpx
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app import rag, dify
from backend.app.config import settings
from backend.app.database import get_engine
from backend.app.seed import related_note_statements, sample_note_statement

assert os.environ["DATABASE_URL"].endswith("_test"), "Dedicated test DB required"
settings.frontend_origin = os.environ.get("TEST_FRONTEND_ORIGIN", settings.frontend_origin)
settings.dify_api_key = "test-only-not-a-real-key"
settings.dify_base_url = "https://dify.invalid/v1"
settings.content_git_repo = tempfile.mkdtemp(prefix="garden-e2e-content-")

subprocess.run(["git", "-C", settings.content_git_repo, "init", "-q"], check=True)


async def embedding(texts):
    return [[1.0] + [0.0] * 1535 for _ in texts]


async def fake_dify(request):
    payload = json.loads(request.content)
    conversation = payload.get("conversation_id") or str(uuid4())
    task = str(uuid4())
    if request.url.path.endswith("/stop"):
        return httpx.Response(200, json={"result": "success"})
    frames = [
        {"event": "message", "conversation_id": conversation, "task_id": task,
         "answer": "این توضیح آزمون فارسی است $x^2$."},
        {"event": "message_end", "conversation_id": conversation},
    ]
    return httpx.Response(200, text="".join("data: " + json.dumps(f) + "\n\n" for f in frames))


rag.embed = embedding
dify.transport = httpx.MockTransport(fake_dify)


async def setup():
    async with AsyncSession(get_engine(), expire_on_commit=False) as db:
        for statement in [sample_note_statement(), *related_note_statements()]:
            await db.execute(statement)
        await db.commit()
    await get_engine().dispose()
    get_engine.cache_clear()


asyncio.run(setup())
uvicorn.run("backend.app.main:app", host="127.0.0.1", port=int(os.environ.get("TEST_API_PORT", "8002")))
