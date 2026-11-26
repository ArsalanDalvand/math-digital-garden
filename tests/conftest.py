"""Global test isolation so .env settings and cached DB pools never leak across tests."""

import pytest

from backend.app.config import settings
from backend.app.database import get_engine, get_session_factory


@pytest.fixture(autouse=True)
def _isolate_runtime_settings(monkeypatch):
    get_session_factory.cache_clear()
    get_engine.cache_clear()
    monkeypatch.setattr(settings, "cookie_secure", False)
    monkeypatch.setattr(settings, "vault_assets_dir", "")
    monkeypatch.setattr(settings, "attachments_dir", "")
    monkeypatch.setattr(settings, "ai_api_key", "")
    monkeypatch.setattr(settings, "dify_api_key", "")
    yield
    get_session_factory.cache_clear()
    get_engine.cache_clear()
