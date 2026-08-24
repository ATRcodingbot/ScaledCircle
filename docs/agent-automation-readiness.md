# Agent Automation Readiness

Agents should operate maintained interfaces after the product is deterministic. They must not receive free-form Firestore mutation, secret access, or implicit financial authority. Model/vendor selection remains replaceable behind typed interfaces.

## Automation classes

- **Class A — deterministic:** bounded validation, status correlation, retry scheduling, deduplication, and alerts after existing authority is proven.
- **Class B — agent assisted:** drafts, recommendations, prioritization, and summaries; a human initially approves external communication or material business changes.
- **Class C — high authority:** payments, refunds, worker approval, transfers, payouts, role/security changes, legal decisions, and irreversible external actions. Human approval is required unless separately redesigned and reviewed.

## Proposed agent map

| Agent | Class | Purpose / inputs | Allowed actions | Forbidden actions | Human approval triggers | Success metric | Required interface |
|---|---|---|---|---|---|---|---|
| Product / UX Agent | B | Screen telemetry, QA reports, route inventory | Draft simplifications and copy | Deploy or alter authority | Any product change | Reduced steps/errors | `getProductSurfaceStatus`, issue drafts |
| Business QA Agent | A/B | Staging fixtures, campaign state | Execute nonfinancial test paths; report | LIVE payment/refund; seed authority | Financial checkpoint | Core E2E pass rate | QA fixture API, read-only campaign status |
| Scaler QA Agent | A/B | Staging jobs/device evidence | Run staging workflow and validate states | Fake production GPS; approve earning | Device permissions/earning approval | Completion E2E pass | QA job API, device attestation/status |
| Admin QA Agent | A | Admin screens/role fixtures | Verify access and issue visibility | Promote real users | Role mutation | Admin regression pass | Admin test fixture API |
| Payments Agent | A/C | Payment/refund/event status | Correlate and recommend retry/review | Charge/refund without approval | Any new charge/refund | Zero stranded payments | `getPaymentsNeedingReview`, narrow reconcile command |
| Security Agent | A/B | Rules tests, auth logs, dependency inventory | Scan, classify, open issues | Change roles/rules/secrets | Security control change | Critical findings zero | read-only security events |
| Release Agent | A/C | Git SHA, tests, inventory, build hashes | Produce preflight/rollback plan | Push/deploy without release approval | Every production mutation | Exact-scope releases | release manifest/status API |
| Operations Agent | A/B | Structured exceptions | Deduplicate, route, recommend recovery | Free-form database edits | Financial/worker consequences | Mean time to resolution | `getCampaignExceptions`, approved commands |
| Support Agent | B | Support case + participant-safe timeline | Draft replies, categorize, escalate | Reveal private/financial data; mutate money | Refund, earning, suspension | First-response and resolution SLA | support-case API, redacted timeline |
| Business Prospecting Agent | B | Public Business facts, geography, demand | Build candidate list with evidence | Scrape prohibited data; contact automatically | Any outreach | Qualified leads | `listQualifiedBusinessLeads` |
| Business Outreach Agent | B | Approved lead/message template | Draft/send within approved campaign limits | Spam, fabricate identity/personalization | First contact/campaign changes | Positive replies, complaints near zero | `recordOutreachAttempt`, consent/suppression API |
| Business Follow-up Agent | B | Prior attempt/reply/next action | Draft follow-up and schedule | Pretend reply; ignore opt-out | Ambiguous reply | Qualified conversion | `scheduleFollowup`, reply status |
| Sales Qualification Agent | B | Lead facts and responses | Recommend status/priority | Mark paid/revenue without authority | Qualification downgrade/close | Activation conversion | lead funnel API |
| Scaler Recruiting Agent | B | Supply gap, public candidates | Draft localized recruitment | Optimize raw signup/spam | External send | Approved active Scalers | supply-gap + recruiting APIs |
| Scaler Activation Agent | A/B | Signup/verification/profile milestones | Send approved reminders | Approve worker or fabricate progress | Account approval | First verified earning rate | activation milestone API |
| Supply/Demand Agent | A/B | Open demand, eligible active supply | Calculate gaps and recommend recruiting | Assign workers or change compensation | Recruiting action | Fill rate/time | `getScalerSupplyGap` |
| Weather Opportunity Agent | B | Authoritative weather facts | Rank possible Business opportunities | State property damage as fact; contact automatically | Outreach | Qualified opportunities | weather signals API |
| Property Intelligence Agent | B | Provider-neutral property facts | Produce bounded interpretation | Use protected demographics; invent condition | Customer-facing recommendation | Useful/grounded outputs | property analysis API |
| Funnel Analytics Agent | A | Event milestones and attribution | Compute conversion/retention | Rewrite source attribution | Metric definition change | Complete trustworthy funnels | event/attribution warehouse API |
| Supervisor / Coordinator | B/C | Agent jobs, budgets, approvals | Route jobs, enforce permissions, stop failures | Expand authority or approve own C actions | Any Class C action | Policy compliance | job ledger, approval service |

## Deterministic workflows closest to automation

- Signed payment/refund event correlation and duplicate detection.
- Campaign inactivity/expiration detection and Admin alerting.
- Email job deduplication, status collection, and bounded retry recommendations.
- Provider outage detection and incident grouping.
- Funnel milestone calculation from authoritative events.
- Supply-gap calculation from open Zones and eligible Scalers.
- Notification deduplication and recipient-policy validation.
- Release inventory comparison, build hashing, and test evidence collation.

These are not ready for unattended production automation until structured APIs, observability, and runbooks exist.

## Human approval required

- New charge, refund, transfer, payout, reversal, or compensation adjustment.
- Completion approval/rejection where evidence is ambiguous.
- Admin/role changes, account suspension, or security control changes.
- Legal/tax conclusions and policy changes.
- First external outreach, new outreach campaign, or disputed opt-out state.
- Material logistics change with worker or Business consequences.
- Production push, deployment, rollback, or deletion.

## Available P0 operations interfaces

Production P0 Batch 2 provides structured, Admin-authorized outputs through `getAdminOperationsOverview` and `getAdminCampaignTimeline`, plus the typed `updateAdminSupportCaseStatus` command. These interfaces expose bounded exceptions, severity, entity references, timestamps, current status, allowed navigation/action hints, categorical health, and a derived authoritative timeline. They are designed for future Operations/Supervisor consumption without Flutter scraping or free-form Firestore mutation. No autonomous agent control is implemented.

The current autonomy contract remains: observe-only and draft-only consumers may read redacted outputs; consequential recovery stays approval-required; no agent may create payment, refund, earning, Wallet, transfer, payout, role, or security authority.

## Remaining interfaces and observability

| Needed interface | Authority | Minimum behavior |
|---|---|---|
| `listQualifiedBusinessLeads` | Sales service | Public-source evidence, geography, fit, suppression state |
| `getLeadStatus` | Sales service | Owner, stage, next action, source, timestamps |
| `recordOutreachAttempt` | Outreach service | Channel, template/version, consent, outcome, deterministic ID |
| `scheduleFollowup` | Outreach service | Bounded schedule, cancellation, opt-out enforcement |
| `markLeadConverted` | Funnel service | Link Auth Business without inventing revenue |
| `getScalerSupplyGap` | Marketplace analytics | Open eligible demand versus eligible active supply |
| `listScalerCandidates` | Recruiting service | Permission-aware candidates and activation state |
| Specialized/paginated exception APIs | Operations service | Split the bounded P0 overview only when scale or a dedicated workflow proves the need |
| Provider telemetry | Platform operations | Measured runtime success/latency/outage beyond current authoritative record health |
| Participant-safe support conversation timeline | Support service | Extend the current campaign timeline only after message/privacy requirements are reviewed |
| `requestApprovedRecovery` | Operations command | Typed command, authorization, idempotency, audit, approval |

P0 Batch 3 replaces the conceptual Sales rows above with a first deterministic boundary: `getSalesPipeline`, `mutateSalesLead`, and `recordSalesActivity`. These are human-operated, Admin-authorized launch APIs. Future agents may consume their redacted output, suppression state, follow-up schedule, attribution, and activity history, but autonomous discovery/research/outreach remains **NOT YET IMPLEMENTED**.

## Business funnel

Prospect → Qualified → Contacted → Follow-up → Interested → Signup → Activated → First Campaign → Paid → Retained.

Required measurements: source, owner, time-in-stage, attempts, reply, opt-out, Auth Business ID, first campaign/payment authority, repeat campaign/subscription, and retained revenue component. Gross campaign payment must not be reported wholly as ScaledCircle revenue.

## Scaler recruiting funnel

Prospect → Contacted → Signup → Email Verified → Profile Complete → Approved → First Application → First Assignment → First Verified Earning → Active Scaler.

Optimize for verified successful workers, not signups. Required measurements include geography/work capability, time-in-stage, failure reason, first earning, repeat completion, and inactivity/reactivation.

## Supply/demand intelligence

- Demand: funded/open eligible Zones, work type, geography, time window, compensation, required capabilities.
- Supply: approved active Scalers, work areas/preferences, capability/consent, current obligations, recent successful completion.
- Output: a deterministic gap score and explanation.
- Agent action: recommend recruiting/prospecting. No autonomous assignment or outreach.

## Outreach safety contract

- Approved channels and rate limits.
- Source and personalization evidence retained.
- No fabricated facts, identity, replies, urgency, or property condition.
- Opt-out/suppression checked before every send.
- Every attempt attributable and auditable.
- Human approval for initial campaigns and policy/template changes.
- Social ad spend is pass-through, not ScaledCircle revenue; direct-mail fee and vendor costs remain separate.
