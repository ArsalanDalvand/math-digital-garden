import importlib
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest


def test_ast_chunks_keep_proof_math_and_exact_bytes():
    rag = importlib.import_module("backend.app.rag")
    raw = (
        "---\ntags: [math]\n---\n# قضیه\n\n> [!PROOF]\n> گام اول\n"
        "> $$\\frac{a}{b}$$\n> گام دوم\n\n$$\nx + y\n\\text{ریاضی}\n$$\n"
        "\n```geogebra\ncommands: []\n```\n"
    )
    chunks = rag.chunk_markdown(raw, limit=25)
    assert "".join(c["content"] for c in chunks) == raw
    assert any("گام اول" in c["content"] and "گام دوم" in c["content"] for c in chunks)
    assert any(
        "$$\nx + y\n" in c["content"] and "\\text{ریاضی}\n$$" in c["content"] for c in chunks
    )
    assert any(
        "```geogebra" in c["content"] and "commands: []\n```" in c["content"] for c in chunks
    )


def test_citation_gate_rejects_fabricated_and_uncited_answer():
    rag = importlib.import_module("backend.app.rag")
    sources = [{"id": "S1", "title": "قضیه کانتور", "url": "/notes/cantor", "content": "اثبات"}]
    assert rag.validate_answer({"answer": "طبق جزوه [S1].", "citations": ["S1"]}, sources)
    assert not rag.validate_answer({"answer": "بدون منبع", "citations": ["S1"]}, sources)
    assert not rag.validate_answer({"answer": "ادعا [S99]", "citations": ["S99"]}, sources)
    assert not rag.validate_answer({"answer": "ادعا [S1] و [S99]", "citations": ["S1"]}, sources)


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def test_git_export_exact_idempotent_conflict_and_path_safety(tmp_path):
    sync = importlib.import_module("backend.app.content_sync")
    repo = tmp_path / "vault"
    repo.mkdir()
    git(repo, "init", "-q")
    raw = Path("tests/fixtures/cantor.md").read_bytes().decode() + "\r\n"
    proposed = raw + "توضیح\r\n"
    pid = str(uuid4())
    commit = sync.export_note(repo, "ریاضی/کانتور.md", raw, proposed, pid)
    assert len(commit) == 40
    assert (repo / "ریاضی/کانتور.md").read_bytes() == proposed.encode()
    assert sync.export_note(repo, "ریاضی/کانتور.md", raw, proposed, pid) == commit
    assert git(repo, "status", "--porcelain") == ""
    with pytest.raises(ValueError):
        sync.export_note(repo, "../escape.md", raw, proposed, str(uuid4()))
    with pytest.raises(ValueError):
        sync.export_note(repo, ".git/config", raw, proposed, str(uuid4()))
    (repo / "outside").symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(ValueError):
        sync.export_note(repo, "outside/secret.md", raw, proposed, str(uuid4()))
    (repo / "outside").unlink()
    with pytest.raises(ValueError):
        sync.export_note(repo, "ریاضی/کانتور.md", "unrelated", "overwrite", str(uuid4()))
    assert (repo / "ریاضی/کانتور.md").read_bytes() == proposed.encode()


@pytest.mark.parametrize(
    "raw",
    [
        "# قضیه\n$\\frac{a}{b}$\n> [!PROOF]\n",
        "---\r\ntags: [math]\n---\r\n$\\frac{a}{b}$\n> [!PROOF]\r\n",
    ],
)
def test_git_checkout_preserves_markdown_even_with_autocrlf(tmp_path, raw):
    sync = importlib.import_module("backend.app.content_sync")
    repo = tmp_path / "vault"
    repo.mkdir()
    git(repo, "init", "-q")
    sync.export_note(repo, "درس/اثبات.md", "", raw, str(uuid4()))
    checkout = tmp_path / "checkout"
    subprocess.run(
        ["git", "clone", "-q", "--config", "core.autocrlf=true", str(repo), str(checkout)],
        check=True,
    )
    assert (checkout / "درس/اثبات.md").read_bytes() == raw.encode()


def test_failed_export_restores_file_and_index_for_safe_retry(tmp_path, monkeypatch):
    sync = importlib.import_module("backend.app.content_sync")
    repo = tmp_path / "vault"
    repo.mkdir()
    git(repo, "init", "-q")
    path = repo / "note.md"
    path.write_bytes(b"original\n")
    sync.git(repo, "add", "--", "note.md")
    sync.git(repo, "commit", "-m", "initial")
    original = sync.git

    def failed(repo, *args):
        if args[0] == "commit":
            raise ValueError("commit failed")
        return original(repo, *args)

    monkeypatch.setattr(sync, "git", failed)
    with pytest.raises(ValueError):
        sync.export_note(repo, "note.md", "original\n", "edited\n", str(uuid4()))
    assert path.read_bytes() == b"original\n"
    assert git(repo, "status", "--porcelain") == ""
