# Changelog

## 0.1.0 — 2026-11-09

- 首个可运行的单机 MVP。
- 加入 Local / Export 统一线索管理。
- 加入 CSV 导入、联系方式查重、规则评分和客户详情。
- 加入跟进任务、活动备注、总览漏斗和基础持久化。
- 增加运行脚本、示例 CSV、API 文档、数据模型、合规清单及路线图。


## 0.2.0 — UI/UX redesign

- Rebuilt the workspace shell with a consistent design system, responsive navigation, reusable icon treatment, spacing, typography, surfaces, and status colors.
- Reworked the overview into clearer KPI, pipeline, priority-task, and recent-lead sections.
- Improved lead search/filter presentation and task management layout without changing existing API payloads.
- Changed lead details from a blocking centered modal into a right-side drawer (bottom sheet on small screens).
- Added mobile off-canvas navigation, keyboard shortcut `⌘/Ctrl + K` for lead search, and improved focus-visible states.
- Kept the UI dependency-free and removed third-party font requests; local system fonts are used.
- Updated the health endpoint version to `0.2.0`.
