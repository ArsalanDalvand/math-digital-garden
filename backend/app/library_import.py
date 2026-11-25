"""Safe Git clone, Zip ingestion, and directory synchronizer for user libraries."""

from __future__ import annotations

import io
import ipaddress
import logging
import os
import shutil
import socket
import subprocess
import zipfile
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.library_models import LibraryItem
from backend.app.workspace import digest

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".md",
    ".markdown",
    ".txt",
    ".canvas",
    ".pdf",
    ".ggb",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".gif",
    ".webp",
}
MAX_ZIP_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_UNCOMPRESSED_SIZE = 120 * 1024 * 1024  # 120 MB
MAX_FILE_COUNT = 1500
CLONE_TIMEOUT = 60  # seconds


def _is_forbidden_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return bool(
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_unspecified
        or (hasattr(ip, "is_multicast") and ip.is_multicast)
    )


def _has_git_proxy(url: str) -> bool:
    for var in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        if os.environ.get(var):
            return True
    parsed = urlsplit(url)
    origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
    keys = [f"http.{origin}.proxy"] if origin else []
    keys.append("http.proxy")
    home = os.environ.get("HOME") or os.path.expanduser("~")
    env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "HOME": home}
    for key in keys:
        try:
            res = subprocess.run(
                ["git", "config", "--get", key],
                env=env,
                capture_output=True,
                text=True,
                timeout=3,
            )
            if res.returncode == 0 and res.stdout.strip():
                return True
        except Exception:
            pass
    return False


def validate_git_url(url: str) -> None:
    """SSRF-safe git url validation: allow HTTP/HTTPS only, prevent access to private IP ranges."""
    parsed = urlsplit(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            400, "تنها نشانی‌های مخزن مبتنی بر پروتکل HTTP یا HTTPS پشتیبانی می‌شوند."
        )
    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        raise HTTPException(400, "نشانی مخزن واردشده نامعتبر است.")

    if hostname in ("localhost", "localhost.localdomain") or hostname.endswith((".local", ".internal", ".localhost")):
        raise HTTPException(
            400,
            f"دسترسی به آدرس‌های شبکه داخلی ({hostname}) به دلایل امنیتی مجاز نیست.",
        )

    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        literal_ip = None

    if literal_ip is not None:
        if _is_forbidden_ip(literal_ip):
            raise HTTPException(
                400,
                f"دسترسی به آدرس‌های شبکه داخلی ({hostname}) به دلایل امنیتی مجاز نیست.",
            )
        return

    try:
        addr_info = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        for _, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            if _is_forbidden_ip(ip):
                raise HTTPException(
                    400,
                    f"دسترسی به آدرس‌های شبکه داخلی ({ip_str}) به دلایل امنیتی مجاز نیست.",
                )
    except socket.gaierror:
        if not _has_git_proxy(url.strip()):
            raise HTTPException(400, "دامنهٔ آدرس مخزن قابل دسترسی یا تحلیل DNS نیست.") from None


def clone_git_repo(repo_url: str, branch: str = "main", target_dir: str = "") -> str:
    """Clone a git repository with depth 1 and return the latest commit SHA."""
    env = {
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_SSH_COMMAND": "ssh -o BatchMode=yes",
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": os.environ.get("HOME") or os.path.expanduser("~"),
    }
    for key in ("HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy", "ALL_PROXY", "all_proxy"):
        if os.environ.get(key):
            env[key] = os.environ[key]
    # First attempt: clone the specified branch
    clone_cmd = [
        "git",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "-b",
        branch,
        repo_url,
        target_dir,
    ]
    res = subprocess.run(clone_cmd, env=env, capture_output=True, text=True, timeout=CLONE_TIMEOUT)
    if res.returncode != 0:
        # Fallback: clone without branch specification (use remote HEAD default branch)
        fallback_cmd = [
            "git",
            "clone",
            "--depth",
            "1",
            "--single-branch",
            repo_url,
            target_dir,
        ]
        res_fb = subprocess.run(
            fallback_cmd, env=env, capture_output=True, text=True, timeout=CLONE_TIMEOUT
        )
        if res_fb.returncode != 0:
            err = res_fb.stderr.strip() or res.stderr.strip() or "خطا در دریافت مخزن"
            logger.warning("Git clone failed for %s: %s", repo_url, err)
            raise HTTPException(
                400, f"کلون مخزن با خطا مواجه شد: {err[-200:]}"
            )

    # Get commit SHA
    sha_cmd = ["git", "-C", target_dir, "rev-parse", "HEAD"]
    res_sha = subprocess.run(sha_cmd, env=env, capture_output=True, text=True, timeout=10)
    commit_sha = res_sha.stdout.strip()
    return commit_sha or "HEAD"


def extract_zip_archive(zip_bytes: bytes, dest_dir: str) -> int:
    """Safely extract zip archive preventing Zip Slip, zip bombs, and symlinks."""
    if len(zip_bytes) > MAX_ZIP_SIZE:
        raise HTTPException(400, "حجم فایل زیپ بیش از حد مجاز (۵۰ مگابایت) است.")

    real_dest = os.path.realpath(dest_dir)
    total_uncompressed = 0
    file_count = 0

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            infolist = zf.infolist()
            if len(infolist) > MAX_FILE_COUNT:
                msg = f"تعداد فایل‌های درون زیپ بیش از حد مجاز ({MAX_FILE_COUNT}) است."
                raise HTTPException(400, msg)

            for info in infolist:
                # Disallow symlinks
                if (info.external_attr >> 16) & 0o120000 == 0o120000:
                    continue

                total_uncompressed += info.file_size
                if total_uncompressed > MAX_UNCOMPRESSED_SIZE:
                    raise HTTPException(400, "حجم نامتعارف محتوای زیپ (بیش از ۱۲۰ مگابایت).")

                # Disallow zip-slip
                target_path = os.path.realpath(os.path.join(real_dest, info.filename))
                if (
                    not target_path.startswith(real_dest + os.sep)
                    and target_path != real_dest
                ):
                    raise HTTPException(400, "فایل فشرده حاوی مسیرهای نامعتبر است.")

                # Ignore git / system directories
                parts = info.filename.replace("\\", "/").split("/")
                if any(p.startswith(".") and p not in (".", "..") for p in parts):
                    continue

                if info.is_dir():
                    os.makedirs(target_path, exist_ok=True)
                else:
                    ext = os.path.splitext(info.filename)[1].lower()
                    if ext in ALLOWED_EXTENSIONS or ext == "":
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        with zf.open(info) as src, open(target_path, "wb") as dst:
                            shutil.copyfileobj(src, dst)
                        file_count += 1
    except zipfile.BadZipFile:
        raise HTTPException(400, "فایل آپلودشده یک فایل زیپ معتبر نیست.") from None

    return file_count


async def ingest_directory_to_library(
    db: AsyncSession,
    user_id: UUID,
    root_dir: str,
    root_folder_item: LibraryItem,
    is_sync: bool = False,
) -> dict[str, int]:
    """
    Recursively ingest files from a local directory into user's LibraryItem hierarchy.
    """
    stats = {"added": 0, "updated": 0, "deleted": 0, "total": 0}
    seen_item_ids: set[UUID] = set()

    # Pre-fetch existing items in this tree to minimize queries
    all_existing_query = select(LibraryItem).where(
        LibraryItem.user_id == user_id,
        LibraryItem.trashed_at.is_(None),
    )
    existing_items = (await db.scalars(all_existing_query)).all()
    # Map (parent_id, title) -> LibraryItem
    items_by_parent_title: dict[tuple[UUID | None, str], LibraryItem] = {
        (item.parent_id, item.title): item for item in existing_items
    }

    async def walk_and_ingest(current_dir: str, current_parent_id: UUID) -> None:
        try:
            entries = sorted(os.listdir(current_dir))
        except OSError:
            return

        # Directories first to build structure
        subdirs: list[str] = []
        files: list[str] = []
        for name in entries:
            if name.startswith("."):
                continue
            full_path = os.path.join(current_dir, name)
            if os.path.isdir(full_path):
                subdirs.append(name)
            elif os.path.isfile(full_path):
                files.append(name)

        # Process subdirectories
        for subdir_name in subdirs:
            key = (current_parent_id, subdir_name)
            folder_item = items_by_parent_title.get(key)
            if folder_item is None:
                folder_item = LibraryItem(
                    user_id=user_id,
                    parent_id=current_parent_id,
                    kind="folder",
                    title=subdir_name,
                    content="",
                    current_hash=digest(""),
                )
                db.add(folder_item)
                await db.flush()
                items_by_parent_title[key] = folder_item
                stats["added"] += 1
            seen_item_ids.add(folder_item.id)
            stats["total"] += 1
            await walk_and_ingest(os.path.join(current_dir, subdir_name), folder_item.id)

        # Process markdown, canvas, and text files
        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            if ext not in (".md", ".markdown", ".txt", ".canvas"):
                continue
            title = os.path.splitext(filename)[0].strip() or filename
            full_path = os.path.join(current_dir, filename)
            try:
                with open(full_path, encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except OSError:
                continue

            content_hash = digest(content)
            key = (current_parent_id, title)
            note_item = items_by_parent_title.get(key)

            if note_item is None:
                note_item = LibraryItem(
                    user_id=user_id,
                    parent_id=current_parent_id,
                    kind="note",
                    title=title,
                    content=content,
                    current_hash=content_hash,
                )
                db.add(note_item)
                await db.flush()
                items_by_parent_title[key] = note_item
                stats["added"] += 1
            else:
                if note_item.current_hash != content_hash:
                    note_item.content = content
                    note_item.current_hash = content_hash
                    note_item.updated_at = datetime.now(UTC)
                    stats["updated"] += 1
            seen_item_ids.add(note_item.id)
            stats["total"] += 1

    # Ingest from root_dir
    seen_item_ids.add(root_folder_item.id)
    await walk_and_ingest(root_dir, root_folder_item.id)

    # If syncing, find items under this root folder that were removed in the repo
    if is_sync:
        # Collect all descendants of root_folder_item
        descendants: list[LibraryItem] = []
        frontier = [root_folder_item.id]
        while frontier:
            next_frontier: list[UUID] = []
            for item in existing_items:
                if item.parent_id in frontier and item.id not in seen_item_ids:
                    descendants.append(item)
                    next_frontier.append(item.id)
            frontier = next_frontier

        for stale in descendants:
            stale.trashed_at = datetime.now(UTC)
            stats["deleted"] += 1

    await db.commit()
    return stats
