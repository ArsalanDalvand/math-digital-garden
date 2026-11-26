"""Git and ZIP repository import and sync routes for personal library."""

from __future__ import annotations

import base64
import binascii
import os
import tempfile
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import Field
from sqlalchemy import select

from backend.app.library.common import dto
from backend.app.library_models import LibraryGitSource, LibraryItem
from backend.app.workspace import DB, Contract, Me, Writes, digest

router = APIRouter()


def _pkg():
    import backend.app.library as library_pkg

    return library_pkg


class GitImportRequest(Contract):
    repo_url: str = Field(min_length=5, max_length=1024)
    branch: str = Field(default="main", max_length=255)
    title: str | None = Field(default=None, max_length=255)
    parent_id: UUID | None = None


class ZipImportRequest(Contract):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(max_length=70_000_000)
    title: str | None = Field(default=None, max_length=255)
    parent_id: UUID | None = None


@router.post("/import/git", status_code=201)
async def import_git(body: GitImportRequest, db: DB, user: Me, _: Writes):
    lib = _pkg()
    await lib.run_in_threadpool(lib.validate_git_url, body.repo_url)

    title = body.title
    if not title:
        raw_name = body.repo_url.rstrip("/").split("/")[-1]
        if raw_name.endswith(".git"):
            raw_name = raw_name[:-4]
        title = raw_name or "مستندات گیت"

    if body.parent_id:
        parent_item = await lib.owned(db, user.id, body.parent_id)
        if parent_item.kind != "folder":
            raise HTTPException(422, "Parent must be a folder")

    root_folder = LibraryItem(
        user_id=user.id,
        parent_id=body.parent_id,
        kind="folder",
        title=title,
        content="",
        current_hash=digest(""),
    )
    db.add(root_folder)
    await db.flush()

    with tempfile.TemporaryDirectory() as tmp_dir:
        clone_dir = os.path.join(tmp_dir, "repo")
        commit_sha = await lib.run_in_threadpool(
            lib.clone_git_repo, body.repo_url, body.branch, clone_dir
        )
        stats = await lib.ingest_directory_to_library(
            db, user.id, clone_dir, root_folder, is_sync=False
        )

    git_source = LibraryGitSource(
        item_id=root_folder.id,
        user_id=user.id,
        repo_url=body.repo_url,
        branch=body.branch,
        last_synced_hash=commit_sha,
        last_synced_at=datetime.now(UTC),
        sync_status="synced",
    )
    db.add(git_source)
    await db.commit()
    await db.refresh(root_folder)

    res = dto(root_folder)
    res["stats"] = stats
    res["has_git"] = True
    res["git_repo_url"] = git_source.repo_url
    return res


@router.post("/import/zip", status_code=201)
async def import_zip(body: ZipImportRequest, db: DB, user: Me, _: Writes):
    lib = _pkg()
    try:
        zip_bytes = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "داده‌های فایل زیپ نامعتبر است.") from None

    title = body.title
    if not title:
        title = os.path.splitext(body.filename)[0].strip() or "مستندات زیپ"

    if body.parent_id:
        parent_item = await lib.owned(db, user.id, body.parent_id)
        if parent_item.kind != "folder":
            raise HTTPException(422, "Parent must be a folder")

    root_folder = LibraryItem(
        user_id=user.id,
        parent_id=body.parent_id,
        kind="folder",
        title=title,
        content="",
        current_hash=digest(""),
    )
    db.add(root_folder)
    await db.flush()

    with tempfile.TemporaryDirectory() as tmp_dir:
        await lib.run_in_threadpool(lib.extract_zip_archive, zip_bytes, tmp_dir)
        stats = await lib.ingest_directory_to_library(
            db, user.id, tmp_dir, root_folder, is_sync=False
        )

    await db.commit()
    await db.refresh(root_folder)

    res = dto(root_folder)
    res["stats"] = stats
    return res


@router.post("/items/{item_id}/git-sync")
async def git_sync(item_id: UUID, db: DB, user: Me, _: Writes):
    lib = _pkg()
    root_folder = await lib.owned(db, user.id, item_id, lock=True)
    if root_folder.kind != "folder":
        raise HTTPException(422, "تنها پوشه‌های متصل به گیت امکان بروزرسانی دارند.")

    git_source = await db.scalar(
        select(LibraryGitSource).where(
            LibraryGitSource.item_id == item_id, LibraryGitSource.user_id == user.id
        )
    )
    if git_source is None:
        raise HTTPException(404, "منبع گیت برای این پوشه یافت نشد.")

    await lib.run_in_threadpool(lib.validate_git_url, git_source.repo_url)

    git_source.sync_status = "syncing"
    await db.commit()

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            clone_dir = os.path.join(tmp_dir, "repo")
            commit_sha = await lib.run_in_threadpool(
                lib.clone_git_repo, git_source.repo_url, git_source.branch, clone_dir
            )
            stats = await lib.ingest_directory_to_library(
                db, user.id, clone_dir, root_folder, is_sync=True
            )

        git_source.last_synced_hash = commit_sha
        git_source.last_synced_at = datetime.now(UTC)
        git_source.sync_status = "synced"
        git_source.error_message = None

        if root_folder.published_hash or root_folder.visibility != "private":
            all_items = (
                await db.scalars(
                    select(LibraryItem).where(
                        LibraryItem.user_id == user.id, LibraryItem.trashed_at.is_(None)
                    )
                )
            ).all()
            frontier = [root_folder.id]
            while frontier:
                next_frontier = []
                for it in all_items:
                    if it.parent_id in frontier:
                        it.visibility = root_folder.visibility
                        if it.kind == "note":
                            it.published_title = it.title
                            it.published_content = it.content
                            it.published_hash = it.current_hash
                        else:
                            it.published_title = it.title
                            it.published_hash = "folder"
                        next_frontier.append(it.id)
                frontier = next_frontier

        msg = (
            f"بروزرسانی با موفقیت انجام شد "
            f"({stats['added']} جدید، {stats['updated']} ویرایش، {stats['deleted']} حذف)."
        )
        await db.commit()
        return {
            "status": "success",
            "commit_sha": commit_sha,
            "stats": stats,
            "message": msg,
        }
    except Exception as exc:
        git_source.sync_status = "error"
        git_source.error_message = str(exc)
        await db.commit()
        raise HTTPException(500, f"خطا در بروزرسانی مخزن: {exc}") from exc


@router.get("/items/{item_id}/git-source")
async def get_git_source(item_id: UUID, db: DB, user: Me):
    git_source = await db.scalar(
        select(LibraryGitSource).where(
            LibraryGitSource.item_id == item_id, LibraryGitSource.user_id == user.id
        )
    )
    if git_source is None:
        return {"has_git": False}
    return {
        "has_git": True,
        "repo_url": git_source.repo_url,
        "branch": git_source.branch,
        "last_synced_hash": git_source.last_synced_hash,
        "last_synced_at": (
            git_source.last_synced_at.isoformat() if git_source.last_synced_at else None
        ),
        "sync_status": git_source.sync_status,
        "error_message": git_source.error_message,
    }
