# 05 — 当前数据结构与正式数据库设计建议

## 1. 当前 JSON 持久化结构

根对象：

```json
{
  "schemaVersion": 1,
  "updatedAt": "ISO-8601",
  "leads": [],
  "tasks": [],
  "activities": []
}
```

## 2. Lead 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `led_` 前缀唯一 ID |
| tenantId | string | 当前固定 `demo`，仅作为未来迁移提示，不是安全隔离 |
| marketType | enum | `LOCAL` / `EXPORT` |
| subjectType | enum | `COMPANY` / `PERSON` |
| companyName | string | 企业/组织名称 |
| contactName | string | 联系人 |
| email | string | 邮箱 |
| phone | string | 电话 |
| region | string | 国内城市/区域或海外国家/地区 |
| source | string | 来源说明 |
| productInterest | string | 意向产品/服务 |
| requirement | string | 需求摘要 |
| budget | string | 预算描述，当前不做数值归一化 |
| timeline | string | 预计决策或采购时间 |
| owner | string | 负责人文本，当前无用户外键 |
| status | enum | `NEW/QUALIFIED/CONTACTED/OPPORTUNITY/WON/LOST` |
| score | int | 0–100 规则评分 |
| scoreLevel | enum | `HIGH/MEDIUM/LOW` |
| scoreReason | string | 评分依据说明 |
| contactPermission | enum | `UNCONFIRMED/AUTHORIZED/OPTED_OUT/NOT_APPLICABLE` |
| createdAt | string | 创建时间 |
| updatedAt | string | 更新时间 |

## 3. Task 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `tsk_` 前缀 ID |
| tenantId | string | 当前固定 `demo` |
| leadId | string | 关联线索 ID，可为空 |
| title | string | 任务标题 |
| description | string | 任务说明 |
| priority | enum | `LOW/MEDIUM/HIGH` |
| status | enum | `OPEN/IN_PROGRESS/DONE` |
| dueAt | string | 截止时间 |
| createdAt / updatedAt | string | 创建/更新时间 |

## 4. Activity 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `act_` 前缀 ID |
| leadId | string | 关联线索 |
| type | enum | `NOTE/CALL/EMAIL/MEETING/SYSTEM/AI_ANALYSIS/STATUS`（系统也会写入后两种） |
| content | string | 事件描述 |
| createdAt | string | 发生时间 |

## 5. 正式 PostgreSQL 表建议

建议按领域拆表：

- `tenant`、`tenant_user`、`user_account`、`role`、`permission`。
- `organization`、`person`、`person_organization_relation`。
- `lead`、`lead_source_record`、`lead_field_value`、`lead_dedup_key`。
- `opportunity`、`opportunity_stage_history`。
- `interaction`、`task`、`task_assignment`。
- `channel_account`、`channel_event`、`webhook_delivery`。
- `consent_record`、`suppression_record`、`data_subject_request`、`audit_log`。
- `workflow_definition`、`workflow_run`、`workflow_step_run`。
- `ai_execution`、`prompt_version`、`model_usage_record`。
- `subscription`、`plan`、`usage_balance`、`usage_record`、`invoice`。

所有租户业务表必须有 `tenant_id`。对 email、phone 的查重应考虑归一化、市场边界、数据权限和误合并风险。不要只用一个明文手机号覆盖同一个人的全部关系。

## 6. 联系授权与来源数据建议

生产设计应将“是否可以联系”拆成可审计记录，而不是只保留一个布尔值。建议保存：

- 数据主体/企业主体。
- 渠道与用途。
- 授权/请求接收状态。
- 取得时间、证明来源和版本。
- 撤回或反对时间。
- 数据来源 URL / 供应商及使用许可。
- 信息验证状态与最后验证时间。
- 保留期限与删除状态。

`UNCONFIRMED` 不等于已授权。任何自动触达工作流都必须检查授权、国家规则、退订和 suppression 状态。
