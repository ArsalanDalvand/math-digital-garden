"""Lossless export into a dedicated, clean Git content repository."""

import fcntl
import os
import subprocess
from pathlib import Path, PurePosixPath
from tempfile import NamedTemporaryFile


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        [
            "git",
            "-c",
            "core.autocrlf=false",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "user.name=Math Garden",
            "-c",
            "user.email=math-garden@localhost",
            "-C",
            str(repo),
            *args,
        ],
        capture_output=True,
        timeout=30,
        check=False,
    )
    if result.returncode:
        raise ValueError("Content Git operation failed")
    return result.stdout.decode("utf-8").strip()


def atomic_bytes(path: Path, data: bytes) -> None:
    with NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        name = temporary.name
        try:
            temporary.write(data)
            temporary.flush()
            os.fsync(temporary.fileno())
            os.replace(name, path)
        finally:
            Path(name).unlink(missing_ok=True)


def export_note(repo: Path, relative_path: str, base: str, proposed: str, proposal_id: str) -> str:
    repo = repo.resolve(strict=True)
    project = Path(__file__).resolve().parents[2]
    if repo == project or not (repo / ".git").is_dir() or (repo / ".git").is_symlink():
        raise ValueError("Use a dedicated Git content repository")
    path = PurePosixPath(relative_path)
    if (
        path.is_absolute()
        or not path.parts
        or any(part in {".", "..", ".git"} for part in path.parts)
        or "\\" in relative_path
        or not relative_path.endswith(".md")
    ):
        raise ValueError("Unsafe content path")
    target = repo.joinpath(*path.parts)
    for parent in [target, *target.parents]:
        if parent == repo:
            break
        if parent.is_symlink():
            raise ValueError("Symlink paths are not allowed")
    if not target.resolve().is_relative_to(repo):
        raise ValueError("Content path escapes repository")
    marker = f"MathGarden-Proposal: {proposal_id}"
    with (repo / ".git" / "garden-export.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        # Retry after a DB failure must detect the original commit, even after later exports.
        if git(repo, "rev-parse", "--is-inside-work-tree") != "true":
            raise ValueError("Not a Git repository")
        has_head = (
            subprocess.run(
                ["git", "-C", str(repo), "rev-parse", "--verify", "HEAD"], capture_output=True
            ).returncode
            == 0
        )
        if has_head:
            existing = git(
                repo, "log", "--all", "--fixed-strings", f"--grep={marker}", "--format=%H", "-1"
            )
            if existing:
                blob = subprocess.run(
                    ["git", "-C", str(repo), "show", f"{existing}:{relative_path}"],
                    capture_output=True,
                    check=True,
                )
                if blob.stdout != proposed.encode("utf-8"):
                    raise ValueError("Existing proposal commit does not match snapshot")
                return existing
        if git(repo, "status", "--porcelain"):
            raise ValueError("Content repository must be clean")
        if target.exists() and target.read_bytes() not in (base.encode(), proposed.encode()):
            raise ValueError("Content export conflicts with local file")
        target.parent.mkdir(parents=True, exist_ok=True)
        attributes = repo / ".gitattributes"
        if attributes.is_symlink():
            raise ValueError("Symlink attributes are not allowed")
        index = repo / ".git" / "index"
        if index.is_symlink():
            raise ValueError("Symlink index is not allowed")
        previous = {
            file: file.read_bytes() if file.exists() else None
            for file in (target, attributes, index)
        }
        rule = b"*.md -text -filter -ident -working-tree-encoding"
        attrs = previous[attributes] or b""
        if rule not in attrs.splitlines():
            attrs = attrs.rstrip(b"\r\n") + b"\n" + rule + b"\n"
        try:
            atomic_bytes(attributes, attrs)
            effective = git(
                repo,
                "check-attr",
                "text",
                "filter",
                "ident",
                "working-tree-encoding",
                "--",
                relative_path,
            )
            if any(line.rsplit(": ", 1)[-1] != "unset" for line in effective.splitlines()):
                raise ValueError("Nested Git attributes transform Markdown")
            atomic_bytes(target, proposed.encode("utf-8"))
            for file_path in (relative_path, ".gitattributes"):
                blob_hash = git(repo, "hash-object", "-w", "--no-filters", "--", file_path)
                git(repo, "update-index", "--add", "--cacheinfo", f"100644,{blob_hash},{file_path}")
            git(
                repo, "commit", "--allow-empty", "-m", f"Merge approved change proposal\n\n{marker}"
            )
        except (ValueError, OSError, subprocess.SubprocessError):
            # A timeout can occur after commit; leave the successful snapshot for idempotent retry.
            committed = ""
            try:
                committed = git(
                    repo, "log", "--fixed-strings", f"--grep={marker}", "--format=%H", "-1"
                )
            except ValueError:
                pass
            if not committed:
                for file, data in previous.items():
                    if data is None:
                        file.unlink(missing_ok=True)
                    else:
                        atomic_bytes(file, data)
            raise
        return git(repo, "rev-parse", "HEAD")
