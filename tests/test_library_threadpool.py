"""Verify blocking Git/Zip import operations run in FastAPI threadpool."""

import base64
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from backend.app import library


async def test_git_and_zip_imports_offload_blocking_calls(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    item_id = uuid4()
    git_source = SimpleNamespace(
        item_id=item_id,
        user_id=user.id,
        repo_url="https://example.org/notes.git",
        branch="main",
        last_synced_hash="",
        last_synced_at=None,
        sync_status="idle",
        error_message=None,
    )
    root_folder = SimpleNamespace(
        id=item_id,
        user_id=user.id,
        parent_id=None,
        kind="folder",
        title="notes",
        visibility="private",
        published_hash=None,
    )

    class FakeDB:
        def add(self, obj):
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()

        async def flush(self):
            return None

        async def commit(self):
            return None

        async def refresh(self, obj):
            if getattr(obj, "created_at", None) is None:
                obj.created_at = datetime.now(UTC)
                obj.updated_at = datetime.now(UTC)

        async def scalar(self, query):
            return git_source

        async def scalars(self, query):
            class _Rows:
                def all(self):
                    return []

            return _Rows()

    def direct_validate(*_args, **_kwargs):
        raise AssertionError("validate_git_url called directly on event loop")

    def direct_clone(*_args, **_kwargs):
        raise AssertionError("clone_git_repo called directly on event loop")

    def direct_extract(*_args, **_kwargs):
        raise AssertionError("extract_zip_archive called directly on event loop")

    async def fake_ingest(*_args, **_kwargs):
        return {"added": 1, "updated": 0, "deleted": 0, "total": 1}

    async def fake_owned(*_args, **_kwargs):
        return root_folder

    recorded = []

    async def record_threadpool(fn, *args, **kwargs):
        recorded.append(fn)
        if fn is direct_validate:
            return None
        if fn is direct_clone:
            return "deadbeef"
        if fn is direct_extract:
            return 1
        raise AssertionError(f"Unexpected threadpool function: {fn}")

    monkeypatch.setattr(library, "run_in_threadpool", record_threadpool, raising=False)
    monkeypatch.setattr(library, "validate_git_url", direct_validate)
    monkeypatch.setattr(library, "clone_git_repo", direct_clone)
    monkeypatch.setattr(library, "extract_zip_archive", direct_extract)
    monkeypatch.setattr(library, "ingest_directory_to_library", fake_ingest)
    monkeypatch.setattr(library, "owned", fake_owned)

    db = FakeDB()
    await library.import_git(
        library.GitImportRequest(repo_url="https://example.org/notes.git", branch="main"),
        db,
        user,
        None,
    )
    await library.import_zip(
        library.ZipImportRequest(
            filename="notes.zip",
            content_base64=base64.b64encode(b"zipdata").decode("ascii"),
        ),
        db,
        user,
        None,
    )
    await library.git_sync(item_id, db, user, None)

    assert recorded == [
        direct_validate,
        direct_clone,
        direct_extract,
        direct_validate,
        direct_clone,
    ]
