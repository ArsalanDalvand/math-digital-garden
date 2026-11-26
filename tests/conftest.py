"""Global test isolation defaults so production .env settings never leak into test runs."""

import pytest

from backend.app.config import settings


@pytest.fixture(autouse=True)
def _isolate_runtime_settings(monkeypatch):
    monkeypatch.setattr(settings, "cookie_secure", False)
    monkeypatch.setattr(settings, "vault_assets_dir", "")
    monkeypatch.setattr(settings, "attachments_dir", "")
