# ScaledCircle Sales Funnel Foundation

Status: P0 Batch 3 deployed and hosted-verified in staging on 2026-08-24. Production remains unchanged until a separate promotion review.

## Product boundary

This is a deliberately small human-operated Business acquisition workflow. It answers who to contact, who needs follow-up, what happened, and which prospects became real ScaledCircle Businesses. It is not a general CRM and sends no email, social message, SMS, or other outreach.

There is no dedicated authoritative Sales role today. Launch access therefore uses the existing verified, active Admin authority. Admin can open `/sales`; Business, Scaler, and signed-out users fail closed. A dedicated Sales permission can be reviewed later without changing the lead authority contract.

## Canonical funnel

The stages are `prospect`, `qualified`, `contacted`, `interested`, `signed_up`, `activated`, `paid`, `retained`, and `closed_not_interested`.

- Human-authorized stages: Prospect, Qualified, Contacted, Interested, Closed / Not Interested.
- Signed Up: derived when the lead is linked to an authoritative Business profile.
- Activated: derived when that Business has completed onboarding/profile readiness or the explicit campaign-creation-ready milestone.
- Paid: derived from at least one authoritative paid `campaignPayments` record for the linked Business.
- Retained: derived from at least two authoritative paid campaign records. Subscription retention remains future work and is not fabricated.

Sales cannot manually set Paid or Retained. Gross campaign payment remains customer payment; it is not relabeled as ScaledCircle revenue.

## Records and authority

`salesLeads` stores the minimum acquisition record: Business identity, optional lawful contact details, industry/geography, source, priority, owner, manual stage, follow-up, research summary, opportunity context, suppression, and optional Business linkage.

`salesActivities` is the immutable operational ledger for lead creation, meaningful mutations, contact attempts, notes, outcomes, stage changes, follow-up scheduling, suppression, owner assignment, and Business linkage. It records actor and server timestamp, not every UI click.

`sales-core` is Node.js 24, Gen 2, `us-east1`, and zero-secret. Its three callables are:

- `getSalesPipeline`: bounded, filtered, redacted pipeline and recent activity; derives conversion milestones from Business/payment authority.
- `mutateSalesLead`: creates or applies a purpose-built audited mutation. It cannot accept financial truth.
- `recordSalesActivity`: records human contact/note/outcome and enforces suppression. It sends nothing.

Firestore clients have no direct Sales collection authority under the existing default-deny Rules posture. No Rules change is required.

## Follow-up, suppression, and attribution

Follow-up time/reason is separate from stage and presented as overdue, today, or upcoming. Suppression is structured: do not contact, opted out, invalid contact, or not interested. `mayContact` is server-derived false whenever suppression exists.

Sources are Founder, Sales, Business Referral, Scaler Referral, Website, Social, Organic, Outreach, Event, Partnership, future Agent Discovery, and Other. Source detail is optional; the system never fabricates attribution.

## Query and privacy model

The read model returns at most 50 leads and 30 recent activities per request, supports stage filtering, and reports whether another page exists. It loads at most 200 authoritative paid payment records for the current launch-scale conversion projection. Pagination/cursors and aggregate projections should replace these launch bounds when measured volume requires it.

Summaries omit payment-method data, provider references, secrets, tokens, tax/KYC data, and backend IDs from the maintained UI. Contact information remains Admin-scoped.

## Future agent inputs — NOT YET IMPLEMENTED

A future Business Growth or Outreach agent may read the purpose-built fields for stage, source, priority, research summary, opportunity context, suppression, allowed contact state, last contact, next follow-up, prior attempts, and authoritative conversion milestones. It must call reviewed authorities and may not mutate Firestore directly.

No prospect discovery, research agent, scoring agent, message generation, outbound delivery, follow-up automation, Scaler recruiting, Growth Supervisor, or AI logic is included in Batch 3.

## Hosted staging proof

The deployed `sales-core` Functions are ACTIVE, Gen 2, Node.js 24, `us-east1`, source hash `a45885d65a551250b1ffe01f6c118ad40ff04950`, and have zero secret bindings. The final hosted bundle SHA-256 is `4E657E7AE6D0527AA9BF8CBE89FF350F8397F7923CFA6F178D6BCC5CB9248EA1`, with an exact live match.

An Admin created one clearly marked `ScaledCircle Batch 3 Internal QA` prospect with a non-deliverable `example.invalid` contact. Through the normal hosted UI it passed qualification, a non-outbound activity ledger entry, follow-up scheduling, an internal-only note, Interested stage, and Do Not Contact suppression. Counts updated authoritatively and the suppressed record was removed from the actionable Today queue. Recent activity and the lead-specific activity history render human summaries without backend IDs. Business and Scaler normal sessions were denied `/sales`; Scaler was also denied `/business`; all actors signed out cleanly. No outbound message, financial action, production write, or provider action occurred.

## Separate follow-up

Admin exception resolution commands—Review, Redo, Cancel, Refund, Reconcile, Archive, and Mark Internal QA—remain a separate state-specific authority review. There is no generic record editor or unrestricted refund action in this Sales batch.
