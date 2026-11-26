"""Unit tests for library import security, SSRF validation, and zip safety."""

import io
import os
import socket
import subprocess
import tempfile
import zipfile

import pytest
from fastapi import HTTPException

from backend.app.library_import import (
    clone_git_repo,
    extract_zip_archive,
    validate_git_branch,
    validate_git_url,
)


def test_validate_git_url_rejects_unsafe_schemes():
    with pytest.raises(HTTPException) as exc:
        validate_git_url("file:///etc/passwd")
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        validate_git_url("ssh://git@github.com:repo.git")
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        validate_git_url("ftp://example.com/repo.git")
    assert exc.value.status_code == 400


def test_validate_git_url_rejects_private_ips():
    with pytest.raises(HTTPException) as exc:
        validate_git_url("http://127.0.0.1/repo.git")
    assert exc.value.status_code == 400
    assert "شبکه داخلی" in exc.value.detail

    with pytest.raises(HTTPException) as exc:
        validate_git_url("http://192.168.1.100/repo.git")
    assert exc.value.status_code == 400
    assert "شبکه داخلی" in exc.value.detail

    with pytest.raises(HTTPException) as exc:
        validate_git_url("http://10.0.0.5/repo.git")
    assert exc.value.status_code == 400
    assert "شبکه داخلی" in exc.value.detail

    with pytest.raises(HTTPException) as exc:
        validate_git_url("http://169.254.169.254/latest/meta-data")
    assert exc.value.status_code == 400


def test_validate_git_url_accepts_valid_public_urls(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, **kw: [(socket.AF_INET, 0, 0, "", ("140.82.121.4", 0))])
    # Public domain names should validate safely
    validate_git_url("https://github.com/ArsalanDalvand/axler-linear-algebra-done-right.git")
    validate_git_url("https://gitlab.com/user/repo")


def test_extract_zip_archive_safe():
    with tempfile.TemporaryDirectory() as tmp_dir:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("chapter-1/intro.md", "# فصل اول\nمقدمه جبر خطی")
            zf.writestr("chapter-1/exercises.md", "# تمرینات\nمسائل فصل اول")
            zf.writestr("readme.txt", "یادداشت‌های درسی")

        count = extract_zip_archive(buf.getvalue(), tmp_dir)
        assert count == 3
        intro_file = os.path.join(tmp_dir, "chapter-1", "intro.md")
        assert os.path.exists(intro_file)
        with open(intro_file, encoding="utf-8") as f:
            assert "فصل اول" in f.read()


def test_extract_zip_archive_rejects_zip_slip():
    with tempfile.TemporaryDirectory() as tmp_dir:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("../../etc_passwd.txt", "hacked")

        with pytest.raises(HTTPException) as exc:
            extract_zip_archive(buf.getvalue(), tmp_dir)
        assert exc.value.status_code == 400
        assert "نامعتبر" in exc.value.detail


@pytest.mark.parametrize(
    "branch",
    [
        "",
        "   ",
        "--upload-pack=evil",
        "-u",
        "-b",
        "feature/foo..bar",
        "branch.lock",
        "main@{0}",
        "/leading",
        "trailing/",
        "bad branch",
        "bad~1",
        "bad\x00branch",
        "a" * 256,
    ],
)
def test_validate_git_branch_rejects_unsafe_names(branch):
    with pytest.raises(HTTPException) as exc:
        validate_git_branch(branch)
    assert exc.value.status_code == 400


@pytest.mark.parametrize("branch", ["main", "feature/phase-1", "v1.0.0", "docs_sync"])
def test_validate_git_branch_accepts_safe_names(branch):
    assert validate_git_branch(branch) == branch


def test_clone_git_repo_rejects_dash_branch_and_hardens_git_argv(monkeypatch, tmp_path):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if "rev-parse" in cmd:
            return subprocess.CompletedProcess(cmd, 0, stdout="deadbeef\n", stderr="")
        if "-b" in cmd:
            return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="missing branch")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    with pytest.raises(HTTPException) as exc:
        clone_git_repo(
            "https://example.org/repo.git", "--upload-pack=touch /tmp/pwn", str(tmp_path)
        )
    assert exc.value.status_code == 400
    assert calls == []

    sha = clone_git_repo("https://example.org/repo.git", "main", str(tmp_path / "repo"))
    assert sha == "deadbeef"
    assert len(calls) == 3

    for clone_cmd in calls[:2]:
        assert "core.hooksPath=/dev/null" in clone_cmd
        assert "core.symlinks=false" in clone_cmd
        assert "--" in clone_cmd
        sep_idx = clone_cmd.index("--")
        assert clone_cmd[sep_idx + 1 :] == ["https://example.org/repo.git", str(tmp_path / "repo")]
    assert "core.hooksPath=/dev/null" in calls[2]
