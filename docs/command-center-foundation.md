# ScaledCircle Command Center Foundation

Status: P0 Batch 2 is live and production-verified as of 2026-08-23. The three `admin-ops-core` Functions and reviewed Command Center Hosting surface are deployed; no financial action occurred during release or QA.

## Product boundary

The launch surface is intentionally small: **Needs Attention**, **Operational Overview**, **Recent Activity**, and **System Health**. It answers what needs attention and why, then offers a safe detail or support-state action. It is not a generic Firestore editor, Stripe console, provider console, Sales CRM, or agent-control system.

## Existing Admin inventory

| Capability | Current classification | Batch 2 decision |
|---|---|---|
| Admin dashboard and authoritative role gate | READY | Reuse and simplify as the Command Center landing page |
| Administrator role management | READY | Reuse unchanged |
| Internal beta entitlements | READY / INTERNAL | Reuse unchanged |
| Subscription overview | PARTIAL | Reuse; do not present gross campaign payments as revenue |
| Provider/platform configuration page | PARTIAL | Keep as configuration, distinct from runtime health |
| `adminIssues` list | PARTIAL | Consume through the consolidated server read model |
| Payment/refund operations | MISSING as a unified surface | Add redacted exceptions and campaign timeline |
| Completion/earning operations | MISSING in production | Add compatibility-aware read model; do not promote worker authorities |
| Transactional email failures | MISSING as an Admin surface | Add durable queue exception summaries |
| Support-case producer and legacy support callables | PARTIAL / DUPLICATE | Reuse `supportCases`; expose only Open → In Progress → Resolved through the new narrow authority |
| Affiliate administration | PARTIAL / INTERNAL | Leave unchanged and outside the landing workflow |
| Configuration-only “health” page | LEGACY SEMANTICS | Keep for configuration detail; new runtime health is derived from operational exceptions |
| Sales foundation | P0 Batch 3 staging verified | Admin-only link to the separate, minimal Sales surface; no outbound or agent controls |

## Authoritative operations API

Codebase: `admin-ops-core`, Node.js 24, Gen 2, `us-east1`, zero secrets.

- `getAdminOperationsOverview`: bounded server reads produce redacted metrics, exceptions, recent activity, and categorical health.
- `getAdminCampaignTimeline`: derives a campaign-specific timeline from existing campaign, payment, job-event, completion, earning, and support records.
- `updateAdminSupportCaseStatus`: purpose-built audited transition among `open`, `in_progress`, and `resolved`; it is not a generic document mutation API.

Every callable requires the existing verified authoritative Admin contract. Business, Scaler, affiliate, and signed-out callers fail closed. The client never queries Stripe and the codebase binds no Stripe, SMTP, AI, Census, Weather, or other provider secret.

## Exception model

Each exception contains a stable read-model ID, category, severity (`action_required` or `attention`), human summary, authoritative status, safe entity references, occurrence time, recommended next action, and supported detail kind.

Categories are payment/refund, completion/earning, email/provider, support, and campaign/participant. Normal payment and completed refund notifications remain normal activity; only stuck, failed, review-required, or inconsistent authority becomes an exception.

## Health model

Health is categorical: `healthy`, `attention`, or `degraded` for payments, email, campaigns, completions, support, and providers. `degraded` means an authoritative source could not be loaded. No arbitrary percentage is displayed, and configuration presence is not described as runtime health.

## Timeline model

The timeline is derived and rebuildable. It does not create a second authority. Only existing timestamps produce events, and low-level GPS chunks are omitted. Payment details preserve gross customer payment, worker allocation, and platform fee separately; refunds and worker earnings are separate events. Provider references are redacted.

## Query and privacy contract

The overview performs a fixed set of bounded server queries (100 documents per source) and returns at most 50 exceptions and 20 recent events. The Flutter client uses one callable refresh instead of dozens of listeners or unbounded historical reads. Timeline queries are campaign-scoped and capped at 100 records per source.

Summaries omit raw GPS history, private addresses, payment-method data, client secrets, provider credentials, tax/KYC data, Auth tokens, and raw exception dumps.

## Future structured consumers — NOT YET IMPLEMENTED

Future Growth, Marketplace Intelligence, Agent Fleet, approval queue, and Supervisor/Intelligence systems may consume the structured exception, metric, health, and timeline contracts. They must use ScaledCircle-authoritative APIs and purpose-built commands rather than scrape Flutter or mutate Firestore directly.

Future autonomy levels are documented only: **Observe Only**, **Draft Only**, **Approval Required**, and **Autonomous Within Limits**. No agent controls, AI analysis, outreach, Sales workflow, opportunity feed, or autonomous action is implemented in this batch.

Batch 3 adds a separate structured Sales summary contract (`counts`, overdue follow-ups, high-priority interested leads, and recent paid conversions) for future Command Center use. The current Admin Home links to Sales but does not add a large Growth dashboard. The surface and Admin/Business/Scaler access boundaries passed hosted staging QA. Agent and Supervisor consumption remains **NOT YET IMPLEMENTED**.

## Explicit exclusions

- Sales funnel and outreach agents
- legal-document implementation
- worker-lifecycle production migration
- physical Android QA
- Stripe Connect, onboarding, transfers, payouts, or withdrawal
- direct provider interrogation
- financial override, refund, transfer, or payout commands
- Rules changes
