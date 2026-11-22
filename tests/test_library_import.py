"""Unit tests for library import security, SSRF validation, and zip safety."""

import io
import os
import socket
import tempfile
import zipfile

import pytest
from fastapi import HTTPException

from backend.app.library_import import extract_zip_archive, validate_git_url


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
