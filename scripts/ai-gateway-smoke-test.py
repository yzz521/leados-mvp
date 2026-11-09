#!/usr/bin/env python3
"""Smoke-test the local AI Gateway without calling a paid model provider."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE_URL = os.environ.get("LEADOS_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def request(path: str, method: str = "GET", body: dict | None = None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            payload = response.read().decode("utf-8")
            return response.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            detail = json.loads(payload)
        except json.JSONDecodeError:
            detail = payload
        raise AssertionError(f"{method} {path}: HTTP {exc.code}: {detail}") from exc


def main() -> int:
    status_code, status = request("/api/ai/status")
    assert status_code == 200 and "enabled" in status, status
    print(f"[ok] AI status: {status.get('engine')}")

    _, leads = request("/api/leads")
    items = leads.get("items", [])
    assert items, "No demo lead exists; start from a clean data directory."
    lead_id = items[0]["id"]

    _, material = request("/api/ai/knowledge", "POST", {
        "marketType": "ALL",
        "kind": "FAQ",
        "title": "AI gateway smoke test material",
        "content": "This temporary material verifies create/list/delete persistence.",
    })
    material_id = material["id"]
    _, knowledge = request("/api/ai/knowledge?marketType=ALL")
    assert any(item.get("id") == material_id for item in knowledge.get("items", []))
    print("[ok] knowledge create/list")

    if status.get("enabled"):
        print("[skip] model chat test skipped to avoid an unexpected paid provider call")
    else:
        _, chat = request("/api/ai/chat", "POST", {
            "leadId": lead_id,
            "conversationId": "",
            "message": "请总结当前客户信息，并说明还缺少哪些关键字段。",
        })
        assert chat.get("engine") == "RULE_BASED_DEMO", chat
        conversation_id = chat.get("conversationId")
        assert conversation_id, chat
        _, conversation = request("/api/ai/conversations/" + conversation_id)
        messages = conversation.get("messages", [])
        assert len(messages) >= 2, conversation
        assert messages[-1].get("role") == "assistant"
        print("[ok] demo chat and server-side conversation persistence")

    request("/api/ai/knowledge/" + material_id, "DELETE")
    print("[ok] knowledge delete")
    print("AI Gateway smoke test passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"AI Gateway smoke test failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
