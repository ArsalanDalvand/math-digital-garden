"""Owner-scoped documents and explicit, single-page publication snapshots."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from backend.app.library.attachments import Attachment
from backend.app.library.attachments import router as attachments_router
from backend.app.library.canonical import CanonicalMetadata
from backend.app.library.canonical import router as canonical_router
from backend.app.library.comments import Comment, CommentTarget, Resolve, comment_target
from backend.app.library.comments import router as comments_router
from backend.app.library.common import (
    accessible,
    ancestors,
    collect_folder_tree_and_notes,
    dto,
    no_store,
    owned,
    parent,
    save_content,
    subscription_link,
    subscriptions,
)
from backend.app.library.imports import (
    GitImportRequest,
    ZipImportRequest,
    get_git_source,
    git_sync,
    import_git,
    import_zip,
)
from backend.app.library.imports import router as imports_router
from backend.app.library.items import (
    CreateItem,
    EditItem,
    Expected,
    Favorite,
    Verification,
    Watch,
    watch_hash,
)
from backend.app.library.items import router as items_router
from backend.app.library.sharing import Publication, public_item
from backend.app.library.sharing import router as sharing_router
from backend.app.library_import import (
    clone_git_repo,
    extract_zip_archive,
    ingest_directory_to_library,
    validate_git_url,
)

router = APIRouter(prefix="/api/library", dependencies=[Depends(no_store)])
router.include_router(canonical_router)
router.include_router(items_router)
router.include_router(sharing_router)
router.include_router(imports_router)
router.include_router(attachments_router)
router.include_router(comments_router)

__all__ = [
    "Attachment",
    "CanonicalMetadata",
    "Comment",
    "CommentTarget",
    "CreateItem",
    "EditItem",
    "Expected",
    "Favorite",
    "GitImportRequest",
    "Publication",
    "Resolve",
    "Verification",
    "Watch",
    "ZipImportRequest",
    "accessible",
    "ancestors",
    "clone_git_repo",
    "collect_folder_tree_and_notes",
    "comment_target",
    "dto",
    "extract_zip_archive",
    "get_git_source",
    "git_sync",
    "import_git",
    "import_zip",
    "ingest_directory_to_library",
    "no_store",
    "owned",
    "parent",
    "public_item",
    "router",
    "run_in_threadpool",
    "save_content",
    "subscription_link",
    "subscriptions",
    "validate_git_url",
    "watch_hash",
]
