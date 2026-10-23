"""Live official provider source probe; never prints credentials or raw diagnostics."""
# ruff: noqa: E402, I001

import json
import os
import sys
import tomllib
from importlib.metadata import version
from pathlib import Path
from urllib.parse import urlsplit

plugin = os.environ["DIFY_PROVIDER_SOURCE"]
sys.path.insert(0, plugin)
# Initialize the provider SDK runtime before importing HTTP clients.
from dify_plugin.entities.model.message import UserPromptMessage
from models.llm.llm import OpenAILargeLanguageModel
import httpx
import requests

config = tomllib.loads((Path.home() / ".codex/config.toml").read_text())["model_providers"][
    "9router"
]
key = config.get("experimental_bearer_token") or os.environ.get(config.get("env_key", ""), "")
headers = dict(config.get("http_headers", {}))
for name, env in config.get("env_http_headers", {}).items():
    if os.environ.get(env):
        headers[name] = os.environ[env]
authorization = next((v for k, v in headers.items() if k.lower() == "authorization"), "")
if not key and authorization.lower().startswith("bearer "):
    key = authorization[7:]
credentials = {
    "stream_mode_auth": "use",
    "extra_headers": headers,
    "endpoint_url": config["base_url"].rstrip("/") + "/",
    "api_key": key,
    "mode": "chat",
    "context_size": "8192",
    "max_tokens_to_sample": "512",
}
observed = []
original = httpx.Client.send


def send(client, request, *args, **kwargs):
    request.extensions["timeout"] = {"connect": 3, "read": 45, "write": 10, "pool": 5}
    response = original(client, request, *args, **kwargs)
    observed.append(
        {
            "method": request.method,
            "path": urlsplit(str(request.url)).path,
            "status": response.status_code,
        }
    )
    return response


httpx.Client.send = send
original_requests = requests.Session.send


def requests_send(session, request, *args, **kwargs):
    kwargs["timeout"] = (3, 45)
    response = original_requests(session, request, *args, **kwargs)
    body = json.loads(request.body) if request.body else {}
    observed.append(
        {
            "method": request.method,
            "path": urlsplit(str(request.url)).path,
            "status": response.status_code,
            "stream": body.get("stream", False),
            "max_tokens": body.get("max_tokens"),
        }
    )
    return response


requests.Session.send = requests_send
model = OpenAILargeLanguageModel(model_schemas=[])
results = {
    "plugin_manifest": "0.0.68",
    "dify_plugin_sdk": version("dify_plugin"),
    "openai_sdk": version("openai"),
    "model": "ag/gemini-3.8-flash-high",
    "checks": [],
}
for name in ["credential_validation", "blocking", "streaming"]:
    item = {"check": name}
    try:
        if name == "credential_validation":
            model.validate_credentials(results["model"], credentials)
            item["passed"] = True
        else:
            answer = model._invoke(
                model=results["model"],
                credentials=credentials,
                prompt_messages=[UserPromptMessage(content="Reply exactly OK.")],
                model_parameters={"temperature": 0.2, "max_tokens": 32},
                stream=name == "streaming",
            )
            if name == "streaming":
                chunks = list(answer)
                item["chunks"] = len(chunks)
                item["content_chunks"] = sum(bool(c.delta.message.content) for c in chunks)
                item["passed"] = item["content_chunks"] > 0
            else:
                item["passed"] = bool(answer.message.content)
    except Exception as e:
        detail = str(e)
        for secret in [key, *headers.values()]:
            if secret:
                detail = detail.replace(secret, "[REDACTED]")
        item.update(passed=False, error=type(e).__name__, detail=detail[:600])
    results["checks"].append(item)
results["http"] = observed
Path("docs/verification/dify-b/official-provider-live.json").write_text(
    json.dumps(results, indent=2)
)
print(json.dumps(results))
sys.exit(0 if all(c["passed"] for c in results["checks"]) else 1)
