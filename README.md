# LeadOS MVP — AI 商机增长工作台

> 版本：0.1.0  
> 交付形态：可运行的本地 MVP 源码 + 操作文档 + API 说明  
> 目标：用一套共同底座承载 Local Growth（国内本地获客）和 Export Growth（外贸客户开发）两条业务线。

## 1. 这是什么

LeadOS 是一个围绕“线索进入—客户识别—销售跟进—商机转化”设计的轻量销售工作台。本压缩包提供一个可独立运行的本地 MVP：

- 总览工作台：线索总量、待处理、高意向、跟进任务及销售阶段漏斗。
- 线索中心：新增、搜索、筛选、修改阶段、客户详情、删除、重复联系方式拦截。
- CSV 导入：支持中英文常见字段名，重复邮箱/手机号自动跳过。
- 客户分析：使用可解释的本地规则计算 0–100 分，并给出下一步建议。
- 跟进任务：创建任务、关联线索、调整状态、完成/重新打开。
- 互动记录：查看系统记录，并为客户添加人工跟进备注。
- Local / Export：同一客户和销售底座，通过 `marketType` 区分业务线。
- 文件持久化：数据写入 `data/leados.json`，重启不丢失。

## 2. 重要的范围说明

当前版本是**单机、单工作空间 MVP**，用于产品验证和流程演示，不是可直接公开运营的生产 SaaS：

- 没有登录、身份认证和真正的多租户鉴权。
- 当前使用 JSON 文件存储，不是 PostgreSQL。
- 客户评分使用本地规则引擎，不调用大模型；界面不会把它冒充成真实 AI。
- 没有接入抖音、微信、LinkedIn、Google、WhatsApp 等外部平台。
- 没有发送短信、邮件、私信或自动营销行为。
- 没有订阅支付、账单和线上套餐管理。
- 示例客户和邮箱均为虚构演示数据；不要录入真实敏感个人信息。

这些边界是有意保留的：先验证线索管理和销售闭环，再按正式 SaaS 规范补齐认证、数据库、授权渠道、AI 服务与计费。

## 3. 环境要求

- JDK 21（需要 `java` 和 `javac`）
- macOS、Linux 或 Windows
- 无需 Maven、Node.js、Docker 或外部 API Key
- 浏览器：Chrome、Edge、Firefox、Safari 的近期版本

## 4. 启动

### macOS / Linux

```bash
cd leados-mvp
chmod +x scripts/run.sh
./scripts/run.sh
```

默认访问：<http://localhost:8080>

指定端口和数据目录：

```bash
PORT=8181 LEADOS_DATA_DIR="$HOME/leados-data" ./scripts/run.sh
```

### Windows

在 PowerShell 或 CMD 中：

```bat
cd leados-mvp
scripts\run.bat
```

默认访问：<http://localhost:8080>

Windows CMD 指定端口：

```bat
set PORT=8181
scripts\run.bat
```

Windows PowerShell 指定端口：

```powershell
$env:PORT = "8181"
.\scripts\run.bat
```

### 停止

在运行终端按 `Ctrl + C`。

## 5. 首次登录 / 演示数据

当前版本没有登录页，启动后直接进入“演示工作空间”。首次启动会自动生成：

```text
data/leados.json
```

首次运行会写入 5 条虚构的 Local / Export 线索和 1 条待办任务。之后重启会继续读取已有数据，不会重复种子数据。

要重置为初始演示数据：

1. 停止服务。
2. 删除项目根目录下 `data/leados.json`（或你通过 `LEADOS_DATA_DIR` 指定目录中的该文件）。
3. 再次运行 `scripts/run.sh`。

**重置前先备份数据。**

## 6. 快速体验

1. 打开总览工作台，查看 5 条演示线索。
2. 点击“新增线索”，选择“本地获客”或“外贸开发”，保存一条测试线索。
3. 进入“线索中心”，点击“分析”，查看规则评分和建议。
4. 点击“详情”，添加一条跟进备注，再创建跟进任务。
5. 进入“跟进任务”，点击圆形按钮将任务标记为完成。
6. 点击“导入 CSV”，选择 `examples/local-leads.csv` 或 `examples/export-leads.csv`。
7. 使用业务线筛选查看 Local / Export 两种数据。

## 7. 目录结构

```text
leados-mvp/
├── backend/
│   └── src/main/
│       ├── java/com/leados/
│       │   ├── LeadOsApplication.java  # JDK HTTP 服务入口
│       │   ├── ApiHandler.java         # REST API、静态资源及业务校验
│       │   ├── LeadStore.java          # JSON 文件持久化仓库
│       │   └── Json.java               # 零依赖 JSON 解析/序列化
│       └── resources/static/
│           ├── index.html
│           ├── styles.css
│           └── app.js
├── docs/                              # 产品、架构、API、数据、合规等文档
├── examples/                          # Local / Export CSV 模板
└── scripts/
    ├── run.sh
    ├── run.bat
    └── smoke-test.py
```

## 8. API 文档

启动服务后，健康检查：

```bash
curl http://localhost:8080/api/health
```

完整接口、字段、状态值和调用示例见：

- `docs/04-API-Reference.md`
- `docs/openapi.yaml`

## 9. 验证方法

项目已在 JDK 21 环境完成编译和 HTTP 冒烟验证。启动服务后另开一个终端执行：

```bash
python3 scripts/smoke-test.py
```

脚本默认访问 `http://localhost:8080`。如服务运行在其他端口：

```bash
LEADOS_BASE_URL=http://localhost:8181 python3 scripts/smoke-test.py
```

## 10. 下一步开发建议

生产 SaaS 的推荐升级顺序：

1. Spring Boot 3.5 + Java 21 后端工程化，保留现有 REST 资源语义。
2. PostgreSQL 持久化、数据库迁移、租户隔离和审计。
3. 登录认证、RBAC、组织成员、租户上下文和 API 限流。
4. Local：客户自有表单、官网 H5、二维码、平台官方授权接口。
5. Export：许可数据供应商、企业网站研究、邮箱验证服务和邮件服务。
6. 统一 AI Gateway，替换规则分析；保留规则分析作为无模型降级方案。
7. 套餐、用量、账单、支付、监控和备份。

详细路线见 `docs/08-Roadmap.md`。

## 11. 安全提示

不要将本地演示服务直接暴露到公网。当前版本无身份认证、TLS、租户鉴权和速率限制。对真实个人信息或客户名单进行处理前，应先明确数据来源、处理目的、联系授权、跨境要求、保留期限和退订机制。详见 `docs/07-Compliance-and-Security.md`。
