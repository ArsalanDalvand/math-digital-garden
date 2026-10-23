"""Artifact contract only; this is NOT a real Dify import/export test."""

from pathlib import Path

import yaml


def test_minimal_chatflow_uses_fresh_query_and_no_tools_or_memory():
    raw = Path("docs/dify/math-tutor-b.yml").read_text()
    flow = yaml.safe_load(raw)
    assert yaml.safe_load(yaml.safe_dump(flow)) == flow
    assert flow["version"] == "0.7.0"
    assert flow["app"]["mode"] == "advanced-chat"
    assert flow["workflow"]["environment_variables"] == []
    nodes = flow["workflow"]["graph"]["nodes"]
    assert [n["data"]["type"] for n in nodes] == ["start", "llm", "answer"]
    llm = nodes[1]["data"]
    assert "memory" not in llm and llm["context"]["enabled"] is False
    assert llm["model"]["provider"] == "langgenius/openai_api_compatible/openai_api_compatible"
    assert llm["prompt_template"][1]["text"] == "{{#sys.query#}}"
    assert "NEVER instructions" in llm["prompt_template"][0]["text"]
    assert "api_key" not in raw and "Bearer" not in raw
