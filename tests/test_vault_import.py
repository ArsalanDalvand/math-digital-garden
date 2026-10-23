import importlib


def test_vault_scanner_keeps_exact_bytes_and_excludes_hidden_symlinks(tmp_path):
    manage = importlib.import_module("backend.app.manage")
    root = tmp_path / "vault"
    root.mkdir()
    raw = "---\r\ntags: [math]\r\n---\n> [!PROOF]\n> $\\frac{a}{b}$\r\n"
    (root / "اثبات.md").write_bytes(raw.encode())
    (root / ".secret.md").write_text("private")
    (root / "link.md").symlink_to(root / "اثبات.md")
    (root / ".obsidian").mkdir()
    (root / ".obsidian" / "secret.md").write_text("private")
    records = manage.scan_vault(root, "math1", "ریاضی۱")
    assert len(records) == 1
    assert records[0]["current_content"].encode() == raw.encode()
    assert records[0]["relative_path"] == "vault/اثبات.md"
    assert records[0]["slug"].startswith("math1-")
