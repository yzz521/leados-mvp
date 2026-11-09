# LeadOS UI/UX Redesign — 0.2.0

## Goals

The first MVP proved the lead and task workflow but looked like a generic CRUD admin page. This revision establishes a coherent, lightweight SaaS workspace without introducing a frontend build chain or changing business API contracts.

## Visual system

| Token | Value | Usage |
|---|---|---|
| Primary | #2D7654 | Primary actions, active states |
| Sidebar | #1B2B23 | Main navigation surface |
| Page background | #F5F7F5 | Workspace canvas |
| Surface | #FFFFFF | Panels, forms, tables |
| Border | #E7ECE8 | Dividers and component outlines |
| Text | #202B25 | Primary text |
| Muted | #7D8982 | Secondary text |

Local Growth uses a soft green semantic treatment; Export Growth uses a low-saturation blue treatment. Status badges retain text labels and do not rely on color alone. Icons use inline or typographic primitives so the UI does not depend on third-party font CDNs.

## Page structure

- **Growth overview:** KPI cards, stage funnel, priority tasks, recent leads.
- **Lead center:** search, stage and market filters, permission status, score and inline stage updates.
- **Task center:** task summaries, priority, due time and completion action.
- **Lead profile:** right-side drawer on desktop and bottom sheet on narrow screens.
- **Global shell:** persistent workspace navigation, market selector, refresh action and connection status.

## Interaction

- Existing data-page, data-market, data-open-lead and data-goto actions are retained.
- Existing lead, task, activity and CSV form IDs and field names are retained for compatibility with app.js.
- Escape closes dialogs and the customer drawer.
- Ctrl/⌘ + K opens the lead center and focuses the search field.
- Mobile navigation opens as an off-canvas sidebar with a dismissible scrim.
- Focus-visible outlines and reduced-motion preferences are supported.

## Compatibility and scope

- No changes to API endpoints or payloads.
- No React, Vue, icon package, Tailwind or external font dependency introduced.
- AI analysis continues to be labeled as a local rule-based demo; the UI does not claim a real model call.
- The product remains a local MVP. Authentication, multi-tenant authorization, PostgreSQL, real channel connectors, messaging delivery and subscription billing are not added by this UI revision.

## Validation

- Preserve every DOM ID consumed by the existing frontend controller.
- Confirm the overview, lead list, task list and form controls can render.
- Confirm modal open/close behavior, drawer layout and mobile navigation.
- Run the project's JDK 21 startup and HTTP smoke-test script before release.
