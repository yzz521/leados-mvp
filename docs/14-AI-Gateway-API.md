# 14 — AI Gateway API

本组接口仅供本地单工作空间 MVP 使用，目前无身份认证和租户鉴权。

## GET /api/ai/status

返回是否可用、引擎类型、模型名、Base URL（隐藏凭据）、Key 是否配置及工具状态；不会返回 API Key。

## GET /api/ai/knowledge?marketType=ALL

marketType 支持 ALL、LOCAL、EXPORT。查询 LOCAL 会包含 LOCAL 和 ALL 资料。

## POST /api/ai/knowledge

\`\`\`json
{
  "marketType": "LOCAL",
  "kind": "PRODUCT",
  "title": "系统门窗产品资料",
  "content": "真实规格、适用场景、服务范围和产品卖点。"
}
\`\`\`

kind 支持 PRODUCT、STRATEGY、FAQ、POLICY。标题最多 120 字符，内容最多 12,000 字符。

## DELETE /api/ai/knowledge/{id}

删除知识资料。

## POST /api/ai/chat

\`\`\`json
{
  "leadId": "led_xxxxxxxxxxxx",
  "conversationId": "",
  "message": "请结合客户历史沟通和产品资料，整理需求及下一步。"
}
\`\`\`

首次 conversationId 可为空。响应返回 conversationId，后续多轮复用该 ID。

响应核心字段：conversationId、leadId、message、messages、pendingActions、engine、model。engine 为 OPENAI_COMPATIBLE 或 RULE_BASED_DEMO。

## GET /api/ai/conversations/{conversationId}

读取服务端保存的多轮消息和当前待确认操作。

## POST /api/ai/actions/execute

\`\`\`json
{
  "conversationId": "conv_xxxxxxxxxxxx",
  "actionId": "actn_xxxxxxxxxxxx",
  "confirmed": true
}
\`\`\`

confirmed 必须为 true。只允许创建内部任务和保存客户备注；不允许外部消息发送。已经处理的动作不能再次执行。

## 错误码

| HTTP | 错误码 | 说明 |
|---|---|---|
| 400 | AI_VALIDATION_ERROR | 请求参数无效 |
| 400 | AI_ACTION_REJECTED | 未确认、已处理或不允许的操作 |
| 404 | CONVERSATION_NOT_FOUND / KNOWLEDGE_NOT_FOUND | 会话或资料不存在 |
| 502 | AI_PROVIDER_ERROR | 模型服务不可用、超时或响应格式无效 |

## 安全

API Key 只由后端环境变量提供。生产部署须补齐认证、权限、租户隔离、审计、限流、TLS 和数据保护策略。
