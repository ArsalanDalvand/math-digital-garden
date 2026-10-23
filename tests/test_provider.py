import json
from secrets import token_urlsafe

import httpx
import pytest
from fastapi import HTTPException

from backend.app import rag
from backend.app.config import settings


@pytest.fixture
def mock_provider(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", token_urlsafe(16))
    original = httpx.AsyncClient

    def setup(handler):
        monkeypatch.setattr(
            rag.httpx,
            "AsyncClient",
            lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
        )

    return setup


async def test_provider_http_and_embedding_validation(mock_provider):
    observed = []

    def success(request):
        observed.append(json.loads(request.content))
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [1.0] + [0.0] * 1535}]})

    mock_provider(success)
    vectors = await rag.embed(["فرمول"])
    assert len(vectors[0]) == 1536
    assert observed[0]["dimensions"] == 1536
    mock_provider(
        lambda request: httpx.Response(200, json={"data": [{"index": 0, "embedding": [1.0]}]})
    )
    with pytest.raises(HTTPException) as error:
        await rag.embed(["فرمول"])
    assert error.value.status_code == 503
    mock_provider(lambda request: httpx.Response(429, json={"message": "sensitive upstream error"}))
    with pytest.raises(HTTPException) as error:
        await rag.provider("/embeddings", {})
    assert error.value.status_code == 503
    assert "sensitive" not in error.value.detail


async def test_unconfigured_and_malformed_provider(mock_provider, monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "")
    with pytest.raises(HTTPException) as error:
        await rag.provider("/embeddings", {})
    assert error.value.status_code == 503
    monkeypatch.setattr(settings, "ai_api_key", token_urlsafe(16))
    mock_provider(lambda request: httpx.Response(200, json=[]))
    with pytest.raises(HTTPException):
        await rag.provider("/embeddings", {})
    mock_provider(lambda request: httpx.Response(200, json={"data": []}))
    with pytest.raises(HTTPException):
        await rag.embed(["فرمول"])
