"""Tests for sharded disk attachment storage and legacy BYTEA fallback."""

from __future__ import annotations

import base64
from hashlib import sha256
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from backend.app.config import settings


def test_attachment_storage_red_gate_and_safety(tmp_path):
    from backend.app.storage import (
        delete_attachment_file,
        read_attachment_bytes,
        save_attachment_bytes,
    )

    payload = b"%PDF-1.7\nhello mathematical garden!\x00\xff"
    key, digest_hex, size_bytes = save_attachment_bytes(tmp_path, payload)

    parts = key.split("/")
    assert len(parts) == 3
    assert len(parts[0]) == 2 and len(parts[1]) == 2
    assert digest_hex == sha256(payload).hexdigest()
    assert size_bytes == len(payload)
    assert (tmp_path / key).is_file()
    assert read_attachment_bytes(tmp_path, key) == payload

    # Unsafe keys and symlink escape must be rejected
    for bad_key in ("../escape", "aa/../../etc/passwd", "/etc/passwd", "aa/bb\x00cc", ""):
        with pytest.raises(ValueError):
            read_attachment_bytes(tmp_path, bad_key)
        with pytest.raises(ValueError):
            delete_attachment_file(tmp_path, bad_key)

    outside = tmp_path.parent / "outside-secret.txt"
    outside.write_bytes(b"secret")
    symlink_dir = tmp_path / "aa" / "bb"
    symlink_dir.mkdir(parents=True, exist_ok=True)
    symlink_path = symlink_dir / "linked"
    symlink_path.symlink_to(outside)
    with pytest.raises(ValueError):
        read_attachment_bytes(tmp_path, "aa/bb/linked")

    # Delete removes file cleanly and is idempotent
    delete_attachment_file(tmp_path, key)
    assert not (tmp_path / key).exists()
    delete_attachment_file(tmp_path, key)


async def test_attachment_routes_support_disk_and_legacy_rows(tmp_path, monkeypatch):
    from backend.app.library import attachments as att_mod
    from backend.app.storage import save_attachment_bytes

    user = SimpleNamespace(id=uuid4(), role="student")
    note_id = uuid4()
    note_item = SimpleNamespace(id=note_id, user_id=user.id, kind="note", canonical_slug=None)

    stored_attachments = []

    class FakeDB:
        async def scalar(self, _query):
            return stored_attachments[0] if stored_attachments else None

        async def scalars(self, _query):
            class _R:
                def all(self):
                    return list(stored_attachments)

            return _R()

        def add(self, obj):
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()
            stored_attachments.append(obj)

        async def delete(self, obj):
            stored_attachments.remove(obj)

        async def commit(self):
            return None

    async def fake_owned(_db, _uid, _iid, *, active=True, lock=False):
        return note_item

    monkeypatch.setattr(att_mod, "owned", fake_owned)
    monkeypatch.setattr(settings, "attachments_dir", str(tmp_path))

    db = FakeDB()
    raw = b"binary-png-content-123"
    created = await att_mod.upload(
        note_id,
        att_mod.Attachment(
            filename="diagram.png",
            content_base64=base64.b64encode(raw).decode("ascii"),
        ),
        db,
        user,
        None,
    )
    assert created["filename"] == "diagram.png"
    assert created["size"] == len(raw)

    att_row = stored_attachments[0]
    assert att_row.data is None
    assert att_row.storage_key is not None
    assert att_row.size_bytes == len(raw)
    assert att_row.sha256 == sha256(raw).hexdigest()
    assert (tmp_path / att_row.storage_key).read_bytes() == raw

    listed = await att_mod.attachments(note_id, db, user, offset=0, limit=100)
    assert listed == [{"id": att_row.id, "filename": "diagram.png", "size": len(raw)}]

    dl = await att_mod.download(att_row.id, db, user)
    assert dl.body == raw

    disk_path = tmp_path / att_row.storage_key
    await att_mod.delete_attachment(att_row.id, db, user, None)
    assert not disk_path.exists()
    assert stored_attachments == []

    # Legacy BYTEA row still downloads cleanly without storage_key
    legacy = SimpleNamespace(
        id=uuid4(),
        item_id=note_id,
        user_id=user.id,
        filename="legacy.pdf",
        data=b"%PDF-legacy",
        storage_key=None,
        size_bytes=0,
        sha256=None,
    )
    stored_attachments.append(legacy)
    legacy_listed = await att_mod.attachments(note_id, db, user, offset=0, limit=100)
    assert legacy_listed[0]["size"] == len(b"%PDF-legacy")
    legacy_dl = await att_mod.download(legacy.id, db, user)
    assert legacy_dl.body == b"%PDF-legacy"

    # Missing disk file returns clean 404
    missing_key, _, _ = save_attachment_bytes(tmp_path, b"temp")
    (tmp_path / missing_key).unlink()
    stored_attachments[0] = SimpleNamespace(
        id=uuid4(),
        item_id=note_id,
        user_id=user.id,
        filename="gone.png",
        data=None,
        storage_key=missing_key,
        size_bytes=4,
        sha256=None,
    )
    with pytest.raises(HTTPException) as exc:
        await att_mod.download(stored_attachments[0].id, db, user)
    assert exc.value.status_code == 404
