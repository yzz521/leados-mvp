#!/usr/bin/env python3
"""Deterministic OpenAI-compatible Chat Completions stub for CI only."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"OK")
            return
        self.send_error(404)

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 2_000_000:
            self.send_error(400)
            return
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        messages = payload.get("messages", [])
        if not messages or messages[0].get("role") != "system":
            self.send_error(400, "system context missing")
            return

        system_context = messages[0].get("content", "")
        user_message = next(
            (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        context_ok = "AI Gateway Test Customer" in system_context and "Gateway Test Product Knowledge" in system_context
        if "note" in user_message.lower() or "备注" in user_message:
            name = "save_customer_note"
            arguments = {
                "content": "Mock model note: summarized customer requirements and pending verification."
            }
            text = "MOCK_CONTEXT_OK=" + str(context_ok) + "；我建议保存一条客户内部备注。"
        else:
            name = "create_follow_up_task"
            arguments = {
                "title": "联系客户确认采购计划",
                "description": "确认客户的应用场景、预算和采购时间；先核验联系权限，未确认前不要联系客户。",
                "priority": "HIGH",
                "dueInHours": 24,
            }
            text = "MOCK_CONTEXT_OK=" + str(context_ok) + "；我建议创建一条内部跟进任务，待你确认。"

        response = {
            "id": "chatcmpl-mock",
            "object": "chat.completion",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": text,
                    "tool_calls": [{
                        "id": "call-mock-1",
                        "type": "function",
                        "function": {"name": name, "arguments": json.dumps(arguments, ensure_ascii=False)},
                    }],
                },
                "finish_reason": "tool_calls",
            }],
            "usage": {"prompt_tokens": 20, "completion_tokens": 20, "total_tokens": 40},
        }
        encoded = json.dumps(response, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8090), Handler).serve_forever()
