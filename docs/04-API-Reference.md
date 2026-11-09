# 04 — REST API 参考

Base URL：`http://localhost:8080`。所有 JSON 请求使用 UTF-8。请求体最大 2MB。

统一错误格式：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "可供用户理解的错误说明"
  }
}
```

## 1. 健康检查

`GET /api/health`

成功响应：

```json
{"status":"UP","application":"LeadOS","version":"0.2.0","time":"2026-11-09T00:00:00Z"}
```

## 2. 总览

`GET /api/overview`

返回 `stats`、`funnel`、`recentLeads` 和 `upcomingTasks`。

## 3. 线索列表

`GET /api/leads?marketType=LOCAL&status=NEW&q=门窗`

参数均可选：

- `marketType`: `ALL`、`LOCAL`、`EXPORT`。
- `status`: `ALL`、`NEW`、`QUALIFIED`、`CONTACTED`、`OPPORTUNITY`、`WON`、`LOST`。
- `q`: 搜索企业、联系人、邮箱、电话、地区、产品和需求。

响应：`{ "items": [], "total": 0 }`。

## 4. 新增线索

`POST /api/leads`

请求示例：

```json
{
  "marketType": "LOCAL",
  "subjectType": "COMPANY",
  "companyName": "示例门窗有限公司",
  "contactName": "李经理",
  "email": "buyer@example.com",
  "phone": "",
  "region": "郑州",
  "source": "官网表单",
  "productInterest": "系统门窗",
  "requirement": "旧房换窗，关注隔音与保温",
  "budget": "2-5万元",
  "timeline": "1个月内",
  "owner": "销售A",
  "contactPermission": "UNCONFIRMED"
}
```

成功：HTTP 201，返回新线索对象。

重复：HTTP 409，错误码 `DUPLICATE_LEAD`，响应可能包含 `existingLeadId`。

必填校验：企业名称和联系人姓名至少提供一项。邮箱和电话不是必填项。

## 5. 线索详情

`GET /api/leads/{id}`

返回 `{ "lead": {}, "activities": [] }`。

## 6. 修改线索

`PATCH /api/leads/{id}`

仅允许更新白名单字段：`marketType`、`subjectType`、`companyName`、`contactName`、`email`、`phone`、`region`、`source`、`productInterest`、`requirement`、`budget`、`timeline`、`owner`、`status`、`contactPermission`。

示例：

```bash
curl -X PATCH http://localhost:8080/api/leads/LEAD_ID \
  -H 'Content-Type: application/json' \
  -d '{"status":"CONTACTED","owner":"销售A"}'
```

## 7. 删除线索

`DELETE /api/leads/{id}`

当前是硬删除，仅用于本地 MVP。生产版应评估软删除、审计、保留和数据主体请求。

## 8. 运行客户分析

`POST /api/leads/{id}/analyze`

请求体可为空对象 `{}`。响应：

```json
{
  "lead": {"id":"...","score":80,"scoreLevel":"HIGH"},
  "analysis": {
    "score":80,
    "level":"HIGH",
    "reasons":["已描述具体需求（+25）"],
    "recommendation":"...",
    "engine":"RULE_BASED_DEMO"
  }
}
```

## 9. CSV 导入

`POST /api/leads/import/csv`

请求 JSON：

```json
{
  "marketType": "EXPORT",
  "csv": "marketType,companyName,email\\nEXPORT,Example GmbH,buyer@example.com"
}
```

返回：`imported`、`duplicates`、`invalid`、`errors`、`message`。CSV 表头支持中英文别名，见 `03-Functional-Guide.md`。

## 10. 任务列表

`GET /api/tasks?status=OPEN&leadId=LEAD_ID`

`status` 可为 `ALL`、`OPEN`、`IN_PROGRESS`、`DONE`。

## 11. 创建任务

`POST /api/tasks`

```json
{
  "title":"联系客户确认采购时间",
  "leadId":"LEAD_ID",
  "description":"确认预算和预计采购时间",
  "priority":"HIGH",
  "status":"OPEN",
  "dueAt":"2026-11-10T08:00:00Z"
}
```

`title` 必填；`leadId` 可为空。`dueAt` 使用 ISO-8601 时间字符串。

## 12. 更新任务

`PATCH /api/tasks/{id}`

可更新 `title`、`description`、`dueAt`、`status`、`priority`。

## 13. 删除任务

`DELETE /api/tasks/{id}`

删除指定任务。删除线索时，当前 MVP 会同时清理其关联任务和互动记录。

## 14. 互动记录

`GET /api/activities?leadId=LEAD_ID`

`POST /api/leads/{id}/activities`

```json
{"type":"NOTE","content":"已沟通，客户希望下周收到报价。"}
```

活动类型：`NOTE`、`CALL`、`EMAIL`、`MEETING`、`SYSTEM`。MVP 不会真的发送邮件或拨打电话。

## 15. API 限制和生产改造

- 当前没有用户身份认证和租户权限校验，只能作为本地演示服务。
- 当前没有分页；线索量较大时必须引入分页、索引和查询限制。
- 当前没有 API 限流、幂等键和审计操作者字段。
- 生产环境必须启用 HTTPS、认证授权、租户隔离、请求审计和敏感字段保护。

OpenAPI 3.1 文件见 `openapi.yaml`。
