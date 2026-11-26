import importlib
from argparse import Namespace
from hashlib import sha256
from types import SimpleNamespace
from uuid import uuid4

import pytest


def test_vault_scanner_keeps_exact_bytes_and_excludes_hidden_symlinks(tmp_path):
    manage = importlib.import_module("backend.app.manage")
    root = tmp_path / "vault"
    root.mkdir()
    raw = "---\r\ntags: [math]\r\n---\n> [!PROOF]\n> $\\frac{a}{b}$\r\n"
    (root / "اثبات.md").write_bytes(raw.encode())
    (root / ".secret.md").write_text("private")
    (root / "link.md").symlink_to(root / "اثبات.md")
    (root / ".obsidian").mkdir()
    (root / ".obsidian" / "secret.md").write_text("private")
    records = manage.scan_vault(root, "math1", "ریاضی۱")
    assert len(records) == 1
    assert records[0]["current_content"].encode() == raw.encode()
    assert records[0]["relative_path"] == "vault/اثبات.md"
    assert records[0]["slug"].startswith("math1-")


def test_copy_assets_update_mode_preserves_safety_and_updates_when_enabled(tmp_path, monkeypatch):
    manage = importlib.import_module("backend.app.manage")
    monkeypatch.setattr(manage, "__file__", str(tmp_path / "backend/app/manage.py"))
    (tmp_path / "frontend/src/lib").mkdir(parents=True)
    root = tmp_path / "vault"
    root.mkdir()
    img = root / "diagram.png"
    img.write_bytes(b"v1-bytes")

    assert manage.copy_assets(root) == 1
    dest = tmp_path / "frontend/public/vault/vault/diagram.png"
    assert dest.read_bytes() == b"v1-bytes"

    img.write_bytes(b"v2-bytes")
    with pytest.raises(ValueError, match="Existing asset differs"):
        manage.copy_assets(root, update=False)
    assert dest.read_bytes() == b"v1-bytes"

    assert manage.copy_assets(root, update=True) == 1
    assert dest.read_bytes() == b"v2-bytes"
    manifest = tmp_path / "frontend/src/lib/vault-assets.json"
    assert "vault/vault/diagram.png" in manifest.read_text(encoding="utf-8")


async def test_import_vault_update_upserts_in_place_and_invalidates_vectors(
    tmp_path, monkeypatch, capsys
):
    manage = importlib.import_module("backend.app.manage")
    monkeypatch.setattr(manage, "__file__", str(tmp_path / "backend/app/manage.py"))
    (tmp_path / "frontend/src/lib").mkdir(parents=True)
    root = tmp_path / "vault"
    root.mkdir()
    note_file = root / "قضیه.md"
    old_content = "# قضیه قدیم\n"
    new_content = "# قضیه جدید\n$x^2$\n"
    note_file.write_text(new_content, encoding="utf-8")

    fixed_id = uuid4()
    existing = SimpleNamespace(
        id=fixed_id,
        slug="math1-preserved-slug",
        title="قضیه قدیم",
        book_slug="math1",
        chapter_slug="فهرست",
        relative_path="vault/قضیه.md",
        current_content=old_content,
        current_hash=sha256(old_content.encode()).hexdigest(),
        updated_at=None,
    )
    invalidated = []

    async def fake_invalidate(db, note_id, user_id):
        invalidated.append((note_id, user_id))

    class FakeDB:
        def __init__(self):
            self.committed = 0

        async def scalar(self, query):
            return existing

        async def commit(self):
            self.committed += 1

    fake_db = FakeDB()

    async def fake_session():
        yield fake_db

    monkeypatch.setattr(manage, "get_session", fake_session)
    monkeypatch.setattr(manage, "invalidate_vectors", fake_invalidate, raising=False)

    # Without --update: report conflict and preserve existing row
    await manage.run(
        Namespace(
            command="import-vault", path=str(root), prefix="math1", book="math1", update=False
        )
    )
    out1 = capsys.readouterr().out
    assert '"conflicts": 1' in out1
    assert existing.current_content == old_content
    assert invalidated == []

    # With --update: update in place without altering id or slug
    await manage.run(
        Namespace(command="import-vault", path=str(root), prefix="math1", book="math1", update=True)
    )
    out2 = capsys.readouterr().out
    assert '"updated": 1' in out2
    assert existing.id == fixed_id
    assert existing.slug == "math1-preserved-slug"
    assert existing.current_content == new_content
    assert existing.current_hash == sha256(new_content.encode()).hexdigest()
    assert invalidated == [(fixed_id, None)]
    assert fake_db.committed == 2
