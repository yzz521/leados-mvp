#!/usr/bin/env python3
"""Exercise OpenAI-compatible model calls and confirmation-gated internal tools."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE_URL = os.environ.get("LEADOS_BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def request(path: str, method: str = "GET", body: dict | None = None, expected=(200,)):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            payload = response.read().decode("utf-8")
            result = json.loads(payload) if payload else {}
            status = response.status
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        result = json.loads(payload) if payload else {}
        status = exc.code
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {result}")
    return status, result


def main() -> int:
    _, status = request("/api/ai/status")
    assert status.get("enabled") is True, status
    assert status.get("engine") == "OPENAI_COMPATIBLE", status
    print("[ok] configured OpenAI-compatible gateway status")

    suffix = uuid.uuid4().hex[:8]
    _, lead = request("/api/leads", "POST", {
        "marketType": "LOCAL",
        "subjectType": "COMPANY",
        "companyName": "AI Gateway Test Customer " + suffix,
        "contactName": "测试采购联系人",
        "region": "郑州",
        "source": "AI Gateway CI",
        "productInterest": "定制产品",
        "requirement": "需要评估产品规格和预计采购计划",
        "budget": "待确认",
        "timeline": "待确认",
        "contactPermission": "UNCONFIRMED",
    }, expected=(201,))
    lead_id = lead["id"]

    _, knowledge = request("/api/ai/knowledge", "POST", {
        "marketType": "LOCAL",
        "kind": "PRODUCT",
        "title": "Gateway Test Product Knowledge",
        "content": "Verified mock product profile for context integration testing.",
    }, expected=(201,))
    knowledge_id = knowledge["id"]

    _, chat = request("/api/ai/chat", "POST", {
        "leadId": lead_id,
        "conversationId": "",
        "message": "请基于客户信息创建一个内部跟进任务建议。",
    })
    assert chat.get("engine") == "OPENAI_COMPATIBLE", chat
    conversation_id = chat["conversationId"]
    assert "MOCK_CONTEXT_OK=True" in chat.get("message", ""), chat
    pending = chat.get("pendingActions", [])
    assert len(pending) == 1 and pending[0].get("name") == "create_follow_up_task", pending
    action_id = pending[0]["id"]

    _, before = request("/api/tasks?leadId=" + lead_id)
    before_count = len(before.get("items", []))
    request("/api/ai/actions/execute", "POST", {
        "conversationId": conversation_id,
        "actionId": action_id,
        "confirmed": False,
    }, expected=(400,))
    _, after_rejected = request("/api/tasks?leadId=" + lead_id)
    assert len(after_rejected.get("items", [])) == before_count, "Action executed without confirmation"
    print("[ok] model tool call is pending and cannot run without confirmation")

    _, executed = request("/api/ai/actions/execute", "POST", {
        "conversationId": conversation_id,
        "actionId": action_id,
        "confirmed": True,
    })
    assert executed.get("success") is True, executed
    _, after_task = request("/api/tasks?leadId=" + lead_id)
    assert len(after_task.get("items", [])) == before_count + 1, after_task
    created_task = after_task["items"][-1]
    assert created_task["title"].startswith("核验联系权限后再跟进："), created_task["title"]
    assert "不得联系客户" in created_task["description"], created_task["description"]
    print("[ok] confirmed task created with unconfirmed-contact guardrail")

    _, second_chat = request("/api/ai/chat", "POST", {
        "leadId": lead_id,
        "conversationId": conversation_id,
        "message": "Please save a note about this customer.",
    })
    pending_note = second_chat.get("pendingActions", [])
    assert len(pending_note) == 1 and pending_note[0].get("name") == "save_customer_note", pending_note
    _, note_result = request("/api/ai/actions/execute", "POST", {
        "conversationId": conversation_id,
        "actionId": pending_note[0]["id"],
        "confirmed": True,
    })
    assert note_result.get("success") is True, note_result
    _, lead_detail = request("/api/leads/" + lead_id)
    assert any("Mock model note" in activity.get("content", "") for activity in lead_detail.get("activities", []))
    print("[ok] multi-turn conversation and confirmed note tool")

    request("/api/ai/knowledge/" + knowledge_id, "DELETE", expected=(200,))
    request("/api/leads/" + lead_id, "DELETE", expected=(200,))
    print("OpenAI-compatible mock model test passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"AI Gateway model test failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
