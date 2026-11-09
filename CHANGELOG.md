# LeadOS Changelog

## 0.4.0 — Server-side AI Gateway

- Adds an OpenAI-compatible Chat Completions gateway configured through server environment variables.
- Persists per-lead conversations and Local / Export product and sales knowledge.
- Includes recent customer activities and related tasks in model context.
- Supports two allowlisted internal tools: create follow-up task and save customer note.
- Model tool calls become pending actions and require explicit user confirmation.
- Applies contact-permission guardrails when creating tasks.
- Keeps a transparent rule-based demo fallback when no model is configured.
- Does not add external message delivery or automated marketing.

## 0.3.0 — AI Sales Workbench
- Adds the three-column sales assistant workspace and Local / Export customer context.

## 0.2.0 — UI/UX redesign
- Reworks navigation, overview, lead list, task center and customer drawer.

## 0.1.0 — Initial MVP
- Adds shared Local / Export lead management, CSV import, scoring and follow-up tasks.
