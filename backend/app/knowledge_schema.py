"""Shared UMKO v1.1 knowledge schema loader and Markdown metadata/edge extractor."""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Callable
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schema" / "knowledge-schema.json"

_FRONTMATTER_RE = re.compile(r"\A---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)")
_CODE_AND_MATH_SPLIT_RE = re.compile(
    r"(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|\$\$[\s\S]*?\$\$|(?<!\\)\$[^\n$]+?(?<!\\)\$)"
)
_OBS_COMMENT_RE = re.compile(r"%%[\s\S]*?%%")
_WIKILINK_RE = re.compile(r"(!?)\[\[([^\]\n]+)\]\]")
_MEDIA_EXT_RE = re.compile(
    r"\.(pdf|mp3|wav|ogg|m4a|mp4|webm|ogv|canvas|png|jpe?g|gif|webp|svg)$", re.I
)


@lru_cache(maxsize=1)
def load_knowledge_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


KNOWLEDGE_SCHEMA: dict[str, Any] = load_knowledge_schema()
UMKO_KINDS: dict[str, dict[str, Any]] = KNOWLEDGE_SCHEMA["kinds"]
UMKO_RELATIONS: dict[str, dict[str, Any]] = KNOWLEDGE_SCHEMA["relations"]
UMKO_RELATION_PLANES: dict[str, dict[str, Any]] = KNOWLEDGE_SCHEMA["relationPlanes"]


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def normalize_lookup_key(value: str) -> str:
    return unicodedata.normalize("NFC", value.strip()).lower()


def extract_frontmatter(markdown: str) -> tuple[dict[str, Any], str]:
    """Parse leading YAML frontmatter safely without mutating the source Markdown."""
    if not markdown:
        return {}, ""
    match = _FRONTMATTER_RE.match(markdown)
    if not match:
        return {}, markdown
    raw_yaml = match.group(1)
    try:
        parsed = yaml.safe_load(raw_yaml)
    except yaml.YAMLError:
        return {}, markdown
    if not isinstance(parsed, dict):
        return {}, markdown
    return _json_safe(parsed), markdown[match.end() :]


def normalize_relation_target(raw_target: str) -> str:
    clean = str(raw_target).strip()
    if clean.startswith("[[") and clean.endswith("]]"):
        clean = clean[2:-2]
    clean = clean.split("|", 1)[0]
    clean = clean.split("#", 1)[0]
    clean = clean.rstrip("\\/ ").strip()
    if clean.endswith(".md"):
        clean = clean[:-3]
    return clean


def infer_kind(frontmatter: dict[str, Any], tags: list[str], title: str) -> str:
    """Infer UMKO kind using the same priority rules as the frontend graph engine."""
    explicit = frontmatter.get("kind")
    if isinstance(explicit, str) and explicit in UMKO_KINDS:
        return explicit

    for raw in tags:
        clean = raw[1:] if raw.startswith("#") else raw
        if clean.startswith("kind:"):
            candidate = clean[5:]
            if candidate in UMKO_KINDS:
                return candidate

    tag_set = {raw[1:] if raw.startswith("#") else raw for raw in tags if isinstance(raw, str)}
    if "MOC" in tag_set or "نقشه_راه" in tag_set or re.match(r"^(00-MOC|MOC-)", title):
        return "collection"
    if {"جئوجبرا", "تجسم_هندسی", "شبیه\u200cساز"} & tag_set:
        return "visual_lab"
    if {"دام", "کج\u200cفهمی"} & tag_set:
        return "pitfall"
    if "مثال_نقض" in tag_set:
        return "counterexample"
    if {"قضیه", "لم", "نتیجه", "گزاره"} & tag_set:
        return "assertion"
    if {"تعریف", "مفهوم", "پیش\u200cنیاز"} & tag_set:
        return "concept"
    if {"اثبات", "برهان"} & tag_set:
        return "proof"
    if "مثال" in tag_set:
        return "example"
    if {"نکته_امتحانی", "تکنیک", "شگرد"} & tag_set:
        return "technique"
    if {"تمرین", "مسئله"} & tag_set:
        return "solution" if title.startswith(("حل ", "راه\u200cحل")) else "problem"
    if {"حل_تشریحی", "راه\u200cحل"} & tag_set:
        return "solution"

    if re.match(r"^(قضیه|لم|نتیجه|گزاره)", title):
        return "assertion"
    if re.match(r"^(تعریف|مفهوم)", title):
        return "concept"
    if re.match(r"^(تمرین|مسئله)", title):
        return "problem"
    if re.match(r"^(حل |راه\u200cحل)", title):
        return "solution"
    if title.startswith("مثال"):
        return "example"
    if re.match(r"^(اثبات|برهان)", title):
        return "proof"
    return ""


def _strip_comments_outside_code(body: str) -> str:
    parts = re.split(r"(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)", body)
    return "".join(
        part if idx % 2 == 1 else _OBS_COMMENT_RE.sub("", part) for idx, part in enumerate(parts)
    )


def extract_wikilink_targets(body: str) -> list[str]:
    """Extract clean note targets from body wikilinks/transclusions outside code & math."""
    cleaned_body = _strip_comments_outside_code(body)
    parts = _CODE_AND_MATH_SPLIT_RE.split(cleaned_body)
    targets: list[str] = []
    for idx in range(0, len(parts), 2):
        chunk = parts[idx]
        if not chunk:
            continue
        for match in _WIKILINK_RE.finditer(chunk):
            is_embed = match.group(1) == "!"
            clean_target = normalize_relation_target(match.group(2))
            if not clean_target:
                continue
            if is_embed and _MEDIA_EXT_RE.search(clean_target):
                continue
            targets.append(clean_target)
    return targets


def extract_note_edges(
    markdown: str,
    frontmatter: dict[str, Any],
    resolve_slug: Callable[[str], str | None],
    *,
    current_slug: str | None = None,
) -> list[tuple[str, str, str]]:
    """Return deduplicated (target_slug, relation_type, edge_source) tuples."""
    seen: set[tuple[str, str, str]] = set()
    edges: list[tuple[str, str, str]] = []

    for rel_key, raw_targets in frontmatter.items():
        if not isinstance(rel_key, str) or not rel_key.startswith("rel_"):
            continue
        if not isinstance(raw_targets, list):
            continue
        for raw_target in raw_targets:
            if raw_target is None:
                continue
            cleaned = normalize_relation_target(str(raw_target))
            if not cleaned:
                continue
            resolved = resolve_slug(cleaned)
            if not resolved or resolved == current_slug:
                continue
            triple = (resolved, rel_key, "frontmatter")
            if triple not in seen:
                seen.add(triple)
                edges.append(triple)

    _, body = extract_frontmatter(markdown)
    for target in extract_wikilink_targets(body):
        resolved = resolve_slug(target)
        if not resolved or resolved == current_slug:
            continue
        triple = (resolved, "wikilink", "wikilink")
        if triple not in seen:
            seen.add(triple)
            edges.append(triple)

    return edges
