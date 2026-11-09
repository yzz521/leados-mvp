# LeadOS AI Sales Workbench 0.3.0

- Adds a three-column AI sales workbench: prospect list, conversation, and customer profile.
- Adds search and Local / Export filters within the prospect list.
- Adds per-lead conversation history stored in browser localStorage.
- Adds rule-based demo responses for customer summaries, next-step plans, and communication drafts.
- Adds actions to create a follow-up task, save the last recommendation as a lead activity, and refresh rule-based lead scoring.
- Enforces UI-level guardrails: opted-out contacts receive no marketing message draft; unconfirmed contacts are instructed to verify contact permission first.
- No real LLM call, external research, email delivery, or social messaging is implemented in this release.
- Existing backend API and persisted data model remain unchanged.
