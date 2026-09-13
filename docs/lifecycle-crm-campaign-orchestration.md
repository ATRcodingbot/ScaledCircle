# Lifecycle CRM and campaign orchestration

## Current launch boundary

Invited Business owners can review a saved historical-inquiry audience, edit each source-backed message, and explicitly approve a campaign or one Lead Generator message. Saving, researching, opening review, and checking conversations never approve a send. Future trigger-driven outreach is not activated by this release.

A campaign records an audience type and objective. The initial audience is `historical_inquiry`, with the objective `historical_inquiry → estimate_scheduled`. This is a desired outcome, not a statement that an estimate exists. Delivery, a reply, or an open cannot advance the relationship stage or create appointment, win, or revenue evidence.

## Shared identity and history

The maintained Business OS customer is the workspace CRM identity. Reviewed outreach resolves its exact normalized email within that workspace. Multiple matches fail closed; matching names never merge customers. A new reviewed relationship starts at `new_lead` and retains its historical-inquiry/prospect relationship type and immutable source references. Existing stages are preserved.

Campaign review reads that customer's actual stage, relationship type, last inbound/outbound contact, and contact restrictions. Unknown stages remain unknown. Execution links the same customer to campaign membership, the approved objective, the immutable send operation, connected mailbox, provider message/thread and deduplicated replies. The existing customer timeline projects these operation IDs; a duplicate timeline row is not written.

The shared `contactAuthority` record serializes outbound contact. Individual Lead Generator emails and campaign sends use the same claim, cooldown and workspace delivery limits. Ambiguous provider operations retain their claim until reconciliation. Only a definitively unattempted send can be released or continued; uncertain outcomes never return to the queue. A real reply allows an explicitly reviewed response through the maintained reply exception.

Current conservative private-beta limits are five attempts per hour, twenty per day, at most twenty-five saved campaign recipients, and the maintained five-day unsolicited follow-up window. Business suppression, unsubscribe and Do Not Contact remain authoritative. These are hard caps, not target sending volumes.

## Common lifecycle contract for subsequent agents

The common relationship context must retain lifecycle stage, relationship type, interests/services, provenance, last inbound/outbound contact, engagement events, service/job history, current opportunity, next-best-action, contact cooldown, consent/restrictions and campaign memberships. Existing Business OS records supply the maintained customer/job/schedule history; missing facts must not be synthesized from message volume.

Future audience recommendations should distinguish historical inquiries, pending/accepted estimates, past/dormant customers, Scaler onboarding/activity, and Business prospect/activation stages. Each recommendation must identify its source stage, intended progression, evidence and exclusion reasons. A human may approve a manual campaign now; later trigger-based approval needs its own bounded policy and audit record.

Social/DM and other future outbound agents must adopt the same contact authority before autonomous person-directed outreach is enabled. This release does not claim that every future channel is integrated, does not create a global cross-Business contact directory, and does not activate automated follow-ups. Internal account notifications remain separate from Business marketing.

## Execution and recovery

Final in-product confirmation freezes the version, sender, saved audience, subject and each rendered body/footer/unsubscribe link. Fresh provider-history checks and current suppression are required. The worker drains only those approved operations and cannot discover additional recipients. Sender-generation changes and source changes hold execution. Approved content is immutable.

One recipient has one operation per campaign regardless of repeated taps or worker overlap. Provider uncertainty is displayed as Needs attention and reconciled without another send. A held operation with zero attempts can continue only after explicit owner action and fresh checks. Sent, partially sent, scheduled, skipped and unknown states are distinct. Gmail acceptance is not claimed as delivered/opened evidence.

Recorded replies, estimates, appointments and wins are attributed through the exact operation/conversation. Certification traffic remains excluded from Growth learning. Revenue must come from authoritative economic records; no revenue is inferred here.
