#!/usr/bin/env python3
"""End-to-end smoke test for a running LeadOS MVP server."""
import json
import os
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("LEADOS_BASE_URL", "http://localhost:8080").rstrip("/")


def request(path, method="GET", payload=None, expected=(200,)):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            status = response.status
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        status = exc.code
        body = exc.read().decode("utf-8")
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {body}")
    return status, json.loads(body) if body else {}


def main():
    _, health = request("/api/health")
    assert health["status"] == "UP"
    _, leads = request("/api/leads")
    assert isinstance(leads["items"], list)

    token = uuid.uuid4().hex[:10]
    email = f"smoke-{token}@example.com"
    _, created = request("/api/leads", "POST", {
        "marketType": "LOCAL", "subjectType": "COMPANY", "companyName": f"Smoke Test {token}",
        "contactName": "测试联系人", "email": email, "region": "郑州", "source": "Smoke Test",
        "productInterest": "测试产品", "requirement": "验证线索创建、评分和跟进接口",
        "budget": "5万元", "timeline": "1个月内", "contactPermission": "UNCONFIRMED"
    }, expected=(201,))
    lead_id = created["id"]

    _, analyzed = request(f"/api/leads/{lead_id}/analyze", "POST", {}, expected=(200,))
    assert 0 <= analyzed["analysis"]["score"] <= 100
    assert analyzed["analysis"]["engine"] == "RULE_BASED_DEMO"

    status, duplicate = request("/api/leads", "POST", {
        "marketType": "LOCAL", "companyName": "Duplicate Test", "email": email
    }, expected=(409,))
    assert duplicate["error"]["code"] == "DUPLICATE_LEAD"

    _, task = request("/api/tasks", "POST", {
        "title": "Smoke test follow-up", "leadId": lead_id, "priority": "HIGH", "status": "OPEN"
    }, expected=(201,))
    task_id = task["id"]
    _, updated_task = request(f"/api/tasks/{task_id}", "PATCH", {"status": "DONE"})
    assert updated_task["status"] == "DONE"

    request(f"/api/leads/{lead_id}/activities", "POST", {"type": "NOTE", "content": "smoke test note"}, expected=(201,))
    _, detail = request(f"/api/leads/{lead_id}")
    assert len(detail["activities"]) >= 1

    request(f"/api/tasks/{task_id}", "DELETE", expected=(200,))
    request(f"/api/leads/{lead_id}", "DELETE", expected=(200,))

    print("PASS: health, list, create, duplicate protection, analyze, task create/update/delete, activity, lead delete")


if __name__ == "__main__":
    main()
