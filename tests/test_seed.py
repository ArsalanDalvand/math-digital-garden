from hashlib import sha256
from pathlib import Path

from backend.app.seed import sample_note_statement


def test_sample_import_preserves_content_and_never_overwrites_existing_note():
    raw = Path("tests/fixtures/cantor.md").read_bytes().decode("utf-8")
    statement = sample_note_statement()
    params = statement.compile().params
    assert params["current_content"] == raw
    assert params["current_hash"] == sha256(raw.encode("utf-8")).hexdigest()
    assert params["slug"] == "cantor"
    assert "ON CONFLICT (slug) DO NOTHING" in str(statement)


def test_related_samples_are_non_destructive_and_keep_raw_bytes():
    from backend.app.seed import related_note_statements

    statements = related_note_statements()
    assert len(statements) == 2
    for statement in statements:
        params = statement.compile().params
        raw = Path("tests/fixtures/" + params["slug"] + ".md").read_bytes()
        assert params["current_content"] == raw.decode("utf-8")
        assert params["current_hash"] == sha256(raw).hexdigest()
        assert "ON CONFLICT (slug) DO NOTHING" in str(statement)
