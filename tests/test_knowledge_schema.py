"""Tests for shared UMKO v1.1 knowledge schema and Markdown metadata/edge extraction."""

import json
from pathlib import Path

from backend.app.knowledge_schema import (
    KNOWLEDGE_SCHEMA,
    UMKO_KINDS,
    UMKO_RELATION_PLANES,
    UMKO_RELATIONS,
    extract_frontmatter,
    extract_note_edges,
    extract_wikilink_targets,
    infer_kind,
)


def test_schema_json_loads_with_expected_kinds_relations_and_shapes():
    schema_path = Path(__file__).resolve().parents[1] / "schema" / "knowledge-schema.json"
    raw = json.loads(schema_path.read_text(encoding="utf-8"))
    assert raw["version"] == "1.1"
    assert KNOWLEDGE_SCHEMA["version"] == "1.1"
    assert len(UMKO_KINDS) == 21
    assert len(UMKO_RELATIONS) == 30
    assert len(UMKO_RELATION_PLANES) == 6
    assert UMKO_KINDS["concept"]["shape"] == "circle"
    assert UMKO_KINDS["assertion"]["shape"] == "hexagon"
    assert UMKO_KINDS["proof"]["shape"] == "square"
    assert UMKO_KINDS["collection"]["shape"] == "octagon"
    assert "dark" in UMKO_KINDS["assertion"]
    assert "sizeBoost" in UMKO_KINDS["assertion"]
    assert len(KNOWLEDGE_SCHEMA["legendKinds"]) == 7
    assert len(KNOWLEDGE_SCHEMA["planeFilters"]) == 5


def test_extract_frontmatter_preserves_markdown_and_normalizes_json_types():
    md = (
        "---\r\n"
        "uid: axler-def-span\r\n"
        "kind: concept\r\n"
        "created: 2026-01-15\r\n"
        "tags:\r\n"
        "  - تعریف\r\n"
        "  - جبر_خطی\r\n"
        "rel_requires:\r\n"
        "  - '[[01-مجموعه‌ها|مجموعه]]'\r\n"
        "---\r\n"
        "# گستره (Span)\r\n"
        "متن اصلی با $x^2$ و [[پایه]].\r\n"
    )
    fm, body = extract_frontmatter(md)
    assert fm["uid"] == "axler-def-span"
    assert fm["kind"] == "concept"
    assert fm["created"] == "2026-01-15"
    assert fm["tags"] == ["تعریف", "جبر_خطی"]
    assert body.startswith("# گستره (Span)")
    json.dumps(fm)  # must be strictly JSON-serializable for Postgres JSONB


def test_extract_frontmatter_handles_missing_and_invalid_yaml_gracefully():
    assert extract_frontmatter("# عنوان ساده\nمتن")[0] == {}
    bad_yaml = "---\nkind: [unclosed\n---\nمتن"
    fm, body = extract_frontmatter(bad_yaml)
    assert fm == {}
    assert body == bad_yaml


def test_infer_kind_prioritizes_frontmatter_then_kind_tag_then_persian_heuristics():
    assert infer_kind({"kind": "assertion"}, ["مفهوم"], "تعریف بردار") == "assertion"
    assert infer_kind({}, ["#kind:pitfall", "قضیه"], "قضیه بعد") == "pitfall"
    assert infer_kind({}, ["#MOC"], "فهرست فصل") == "collection"
    assert infer_kind({}, ["اثبات"], "یادداشت") == "proof"
    assert infer_kind({}, [], "تعریف فضای برداری") == "concept"
    assert infer_kind({}, [], "ملاحظه تاریخی") == ""


def test_extract_wikilink_targets_skips_code_math_and_media_embeds():
    body = (
        "%% [[کامنت_مخفی]] %%\n"
        "```python\n"
        "link = '[[درون_کد]]'\n"
        "```\n"
        "این فرمول $a + [[درون_فرمول]]$ و کد `[[کد_خطی]]` نادیده گرفته می‌شود.\n"
        "رجوع به [[پایه و بعد|پایه]] و [[فضای برداری#تعریف]] و "
        "![[شکل.png|200]] و ![[یادداشت_توکار.md]].\n"
    )
    targets = extract_wikilink_targets(body)
    assert targets == ["پایه و بعد", "فضای برداری", "یادداشت_توکار"]


def test_extract_note_edges_combines_frontmatter_relations_and_wikilinks():
    md = (
        "---\n"
        "rel_requires:\n"
        "  - '[[مجموعه‌ها|مجموعه]]'\n"
        "rel_proves:\n"
        "  - خود_یادداشت\n"
        "  - ناشناخته\n"
        "---\n"
        "ارجاع به [[مجموعه‌ها]] و [[قضیه بعد]].\n"
    )
    fm, _ = extract_frontmatter(md)
    lookup = {
        "مجموعه‌ها": "note-sets",
        "قضیه بعد": "note-dim",
        "خود_یادداشت": "note-self",
    }
    edges = extract_note_edges(
        md,
        fm,
        resolve_slug=lambda name: lookup.get(name),
        current_slug="note-self",
    )
    assert ("note-sets", "rel_requires", "frontmatter") in edges
    assert ("note-sets", "wikilink", "wikilink") in edges
    assert ("note-dim", "wikilink", "wikilink") in edges
    assert all(target != "note-self" for target, _, _ in edges)
    assert len(edges) == 3
