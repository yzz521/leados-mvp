# 13 — 服务端 AI Gateway 配置

## 运行模式

LeadOS 0.4.0 支持真实模型和规则演示两种模式。真实模型在服务端通过 OpenAI-compatible Chat Completions 调用；未配置可用模型时，自动使用规则演示回复。查询 \`GET /api/ai/status\` 可查看当前模式，不会返回 API Key。

## 环境变量

| 变量 | 说明 |
|---|---|
| LEADOS_AI_BASE_URL | API Base URL，例如 https://api.openai.com/v1 |
| LEADOS_AI_MODEL | 服务商提供的模型名称，模型须支持 tool/function calling |
| LEADOS_AI_API_KEY | 云端服务通常必需；只在服务端设置 |
| LEADOS_AI_TIMEOUT_SECONDS | 超时，默认 45 秒，范围 10–120 |
| PORT | HTTP 端口，默认 8080 |
| LEADOS_DATA_DIR | 数据目录，默认 ./data |

服务端会在 Base URL 后追加 \`chat/completions\`。例如本机 Ollama OpenAI-compatible endpoint 可使用 \`http://127.0.0.1:11434/v1\`；本机 loopback 模型允许不配置 API Key。远程服务必须配置 Key。

## macOS / Linux

复制 \`.env.example\` 为项目根目录 \`.env\`，填写模型地址、模型名和密钥，再运行：

\`\`\`bash
./scripts/run-with-ai.sh
\`\`\`

脚本会加载本地 \`.env\`。只应加载自己创建并信任的配置文件。也可以直接运行：

\`\`\`bash
LEADOS_AI_BASE_URL="https://api.openai.com/v1" \\
LEADOS_AI_MODEL="your-tool-calling-model" \\
LEADOS_AI_API_KEY="your-secret" \\
./scripts/run.sh
\`\`\`

## Windows PowerShell

\`\`\`powershell
$env:LEADOS_AI_BASE_URL = "https://api.openai.com/v1"
$env:LEADOS_AI_MODEL = "your-tool-calling-model"
$env:LEADOS_AI_API_KEY = "your-secret"
$env:LEADOS_AI_TIMEOUT_SECONDS = "45"
.\scripts\run.bat
\`\`\`

不要把密钥写进 HTML、前端 JavaScript 或提交到 Git。

## 上下文构建

每轮按所选线索收集：客户档案字段、最近 12 条互动、最近 8 条关联任务，以及适用于 LOCAL / EXPORT 的知识资料。知识类型为 PRODUCT、STRATEGY、FAQ、POLICY；单条标题最多 120 字符，内容最多 12,000 字符。UI 通过“资料与策略”入口维护。

客户档案和知识资料作为数据处理，不作为系统指令。不要写入 API Key、密码、身份凭证或不必要的敏感个人信息。

## 受控工具

工具白名单仅有：

- create_follow_up_task：提出内部跟进任务建议。
- save_customer_note：提出客户备注建议。

模型不会直接执行工具调用。建议先作为 PENDING 操作返回，用户点击“确认执行”并再次确认后，后端才写入内部任务或备注。没有发送邮件、短信、私信、WhatsApp、拨号或自动发布工具。

权限处理：OPTED_OUT 会强制改写为内部拒绝联系记录维护任务；UNCONFIRMED 会强制先核验联系权限；即使为 AUTHORIZED，也只执行内部动作，不代表可自动向外部发送消息。

## 数据与安全边界

业务数据位于 \`data/leados.json\`，AI 知识与会话位于 \`data/leados-ai.json\`。迁移或备份时应同时处理两个文件。

当前仍是本地单工作空间 MVP，没有登录认证、RBAC、租户隔离、TLS、审计操作者和生产级限流。服务仅监听 127.0.0.1。不要将它暴露到公网，也不要在未评估供应商条款和数据处理依据前发送真实敏感客户信息。模型供应商会接收到本次请求携带的上下文。

## 排查

- 仍为演示模式：检查 BASE_URL、MODEL、API_KEY 和 \`/api/ai/status\`。
- 502 AI_PROVIDER_ERROR：检查 endpoint、模型名称、服务可达性和工具调用兼容性。
- 不生成工具建议：确认模型具备 function calling 能力。
- 超时：适当增加 LEADOS_AI_TIMEOUT_SECONDS 或检查模型服务负载。
