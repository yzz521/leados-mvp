# 02 — 技术架构与模块边界

## 1. 当前可运行架构

```text
Browser
  │ same-origin HTTP
  ▼
JDK 21 HttpServer
  ├── Static UI (HTML/CSS/JavaScript)
  ├── REST API (ApiHandler)
  ├── Business rules (validation, deduplication, scoring)
  └── LeadStore
         │
         ▼
     data/leados.json
```

本地实现刻意不依赖 Maven、Node、Docker、数据库、Redis 或模型服务。这样可在干净的 JDK 21 环境里直接编译、启动和验证。

## 2. 核心类

### `LeadOsApplication`

- 读取 `PORT` 和 `LEADOS_DATA_DIR`。
- 初始化本地仓库。
- 启动 JDK 内置 HTTP Server。
- 将 `/api/*` 路由交给 API Handler，将其他 GET 请求交给静态资源服务。

### `ApiHandler`

- REST 路由、请求体大小限制、参数校验和统一 JSON 错误结构。
- 客户新增/修改、重复邮箱/电话检查、CSV 解析。
- 规则评分、任务、活动记录及总览统计。
- 静态资源路径限制。

### `LeadStore`

- 当前使用同步方法保护内存数据。
- 每次写操作将数据序列化到临时文件，再原子替换 JSON 文件。
- 首次启动时生成虚构演示数据。

### `Json`

- 项目内最小 JSON parser/serializer，无第三方依赖。
- 如后续迁移至 Spring Boot，可替换为 Jackson。

## 3. 正式 SaaS 推荐模块

建议后续在 Spring Boot 3.5 + Java 21 下采用模块化单体：

```text
leados-app
leados-tenant       # 租户上下文、企业组织
leados-iam          # 身份认证、RBAC、API Key
leados-crm          # 企业、联系人、客户档案
leados-lead         # 线索来源、导入、查重、分配
leados-sales        # 商机、阶段、活动、任务
leados-channel      # Webhook 和渠道账户
leados-workflow     # 事件、条件、动作和重试
leados-ai           # 模型网关、提示词、结构化输出
leados-compliance   # 同意、反对、保留、删除、审计
leados-analytics    # 归因、漏斗、留存与报表
leados-billing      # 套餐、额度、账单、支付
connectors-local    # Local 官方/授权渠道适配器
connectors-export   # 商业数据源、邮箱验证、邮件服务
```

这只是逻辑模块边界，不应在首版拆成多个微服务。

## 4. 关键领域对象

- Organization：企业客户/采购商等商业组织。
- Person：自然人联系人。
- Lead：某次具体销售意向或潜在商机，不等同于客户主档。
- Opportunity：进入销售流程、需要金额和预计成交日期管理的商机。
- Interaction：邮件、电话、会议、备注、表单事件等互动。
- Task：销售下一步行动。
- SourceRecord：来源、抓取/导入时间、来源许可、原始引用。
- ConsentRecord：同意/请求接收、目的、渠道、时间、证明来源。
- SuppressionRecord：退订、拒绝联系、投诉等禁止触达状态。

一个联系人可以属于多家组织；同一家组织可有多个联系人；同一客户可以有多个不同线索和商机，不能只按手机号简单覆盖。

## 5. 多租户设计要求

当前 MVP 固定 `tenantId=demo`，没有认证，不具备真实隔离能力。正式版至少要求：

1. 用户先完成身份认证。
2. 后端从服务端授权上下文解析 tenantId，不信任客户端任意传入的 tenantId。
3. 所有业务查询强制绑定 tenantId。
4. PostgreSQL 表建立 `tenant_id` 索引，并根据风险启用 Row-Level Security。
5. 文件、向量索引、缓存 key、异步任务和审计记录都纳入租户边界。
6. 做跨租户越权自动化测试。

## 6. AI 设计

当前 `analyzeLead` 是可解释规则，不是真实 LLM。正式架构建议：

- Model Gateway：统一供应商、模型路由、超时、重试、成本和密钥管理。
- Prompt Registry：版本化提示词和结构化输出 Schema。
- Tool Registry：只开放最小必要业务工具。
- Workflow Engine：事件触发、条件分支、人工审核、失败重试。
- Evaluation：用标注样本评估准确率和业务效果。

AI 输出必须包含依据、置信度/不确定项和下一步建议。不能仅凭模型评分自动决定对个人进行高影响动作，也不能绕过联系授权状态发送营销内容。

## 7. 存储演进

本地 JSON → PostgreSQL（业务）+ Redis（缓存/队列辅助）+ S3 兼容对象存储（文件）。

客户名单和企业数据检索可后续采用 PostgreSQL 全文检索，确定确有复杂语义检索需求后再增加向量数据库。不要在 MVP 阶段为了技术完整性引入不必要基础设施。
