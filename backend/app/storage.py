"""Safe disk storage helpers for binary library attachments."""

from __future__ import annotations

from hashlib import sha256
from pathlib import Path, PurePosixPath
from uuid import uuid4

from backend.app.content_sync import atomic_bytes


def _resolve_storage_path(base_dir: str | Path, storage_key: str) -> Path:
    if (
        not storage_key
        or "\x00" in storage_key
        or "\\" in storage_key
        or storage_key.startswith("/")
    ):
        raise ValueError("Invalid storage key")
    posix = PurePosixPath(storage_key)
    parts = posix.parts
    if not parts or any(part in {"", ".", ".."} or part.startswith(".") for part in parts):
        raise ValueError("Invalid storage key path")

    root = Path(base_dir).resolve(strict=False)
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlink component not allowed in storage path")

    resolved = current.resolve(strict=False)
    if resolved == root or not resolved.is_relative_to(root):
        raise ValueError("Storage path escapes root directory")
    return current


def save_attachment_bytes(base_dir: str | Path, data: bytes) -> tuple[str, str, int]:
    """Write attachment bytes atomically into a sharded sub-path and return (key, sha256, size)."""
    token = uuid4().hex
    storage_key = f"{token[:2]}/{token[2:4]}/{token}"
    target = _resolve_storage_path(base_dir, storage_key)
    target.parent.mkdir(parents=True, exist_ok=True)
    atomic_bytes(target, data)
    return storage_key, sha256(data).hexdigest(), len(data)


def read_attachment_bytes(base_dir: str | Path, storage_key: str) -> bytes:
    """Safely read disk-backed attachment bytes, rejecting traversal or symlinks."""
    target = _resolve_storage_path(base_dir, storage_key)
    if not target.is_file():
        raise FileNotFoundError(storage_key)
    return target.read_bytes()


def delete_attachment_file(base_dir: str | Path, storage_key: str) -> None:
    """Remove a disk-backed attachment cleanly (idempotent if already deleted)."""
    target = _resolve_storage_path(base_dir, storage_key)
    if target.exists() or target.is_symlink():
        if target.is_symlink():
            raise ValueError("Symlink component not allowed in storage path")
        target.unlink()
