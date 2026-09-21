# Email authorization and adaptive dispatch — September 21

## Boundaries and current production owner records

At 10:16:29 UTC Attractive Remodel had prepared preference v3, saved 09:49:11.718 UTC; ScaledCircle had prepared v1, saved 09:50:28.312 UTC. Neither was authorized. Deployment must preserve these records and both connected mailboxes.

- Attractive Remodel: label `SC-Pilot-Inquiries`, future intake ON; introductions ON (20/day), follow-ups OFF; email/push selected; AI selected but gated; Schedule selected and bound to availability v2. Location remains required; staff optional. Existing nine contacts have no recorded recipient permission, so they are not authorized outreach recipients.
- ScaledCircle: Inbox selected but new intake OFF; introductions/follow-ups OFF; email/push and AI selected; Schedule v1. Inbox selection alone does not authorize scanning future inbox messages. No CRM contacts.
- Neither has a ready production push device. Email alerts do not depend on push registration. The shared $1/100-request/seven-day reply-inference grant remains prepared without a start time. No model-data processing-permission record exists.

## Repair

Review & authorize is always visible. It reloads the saved version, summarizes actual capabilities and rejects unsaved or stale changes. Explicit available-features confirmation may activate non-model functionality while preserving selected AI as pending. Model invocation and joint-pilot activation reject pending-model policies even if readiness changes later. Pause/resume preserves that restriction; saving preferences returns to prepared and cannot be resumed as if authorized. Never-authorized preferences do not show Revoke.

Server preflight still checks exact owner, mailbox credentials, scoped grant, Schedule version, term, templates, coverage and other selected requirements. Partial authorization removes only model prerequisites; dispatch separately enforces recipient consent, suppression, switch state, sending window, cap and immutable approval. No owner selections were changed during implementation.

## Adaptive selection versus generating new copy

Adaptive selection is optional and server-authorized. The baseline and distinct alternative are reviewed in owner setup. Strategy digest includes objective, exact copy, context and authority; segment includes maintained relationship/stage, source, service and permission. Recipient/account assignment is stable and freezes decision, strategy, segment and variant on the exact sent revision.

Comparable evidence requires at least 20 mature distinct recipients in each arm, contemporaneous weekly cohorts, seven-day maturity and a 35-day window. Qualified outcomes, uncertainty and negative responses are separate. No open/delivery/raw or automated reply is a positive result. Controlled tests and other workspaces are excluded. Truncated evidence produces HOLD. Corrections are new outcome events; sent history stays immutable. Outcomes on maintained follow-up descendants can be attributed to the originating introduction.

HOLD retains baseline by default. An explicitly selected small comparison permits approximately 80% baseline / 20% reviewed alternative without increasing recipients or volume. It remains that approved allocation until evidence supports a change. Supported decisions choose 75% preferred / 25% comparison for future assignments, preserving baseline and stable prior assignments. The owner can pause or change strategy. Owner-editable new alternatives create a new strategy lineage and do not inherit old evidence as a winner.

New subject/body proposals currently use maintained Business context and owner editing. **Automatic model-generated outreach alternatives are not implemented/certified by this batch.** The existing allowance authorizes reply suggestions only; it is not spent on outreach generation. No new paid calls or spending occurred.

## Google and model gates

The one authorized factual amendment was confirmed sent at 06:25 Eastern / 10:25 UTC in the original Attractive Remodel case. See `google-review-amendment-unsent-20260920.md` for exact thread reference/text. The earlier CASA-cost question is separate. No further search or send is required.

ADA-CASA AL1 remains open, due December 19. Review submission/amendment delivery does not prove processing approval. The maintained processing-permission assessment remains unrecorded; AI cannot activate until its actual requirements are satisfied and the owner explicitly authorizes it. Existing provider binding, minimized gpt-4.1-mini Responses/store:false path and published disclosure remain intact; no zero-retention claim. The reply allowance has not started.

## One controlled web retest

1. Each owner opens Business Email → Assistance setup → Review & authorize assistance. Review saved coverage, switches and Schedule binding. If changing alternatives or small-comparison selection, save and review that new version first. Retain or explicitly change AR label coverage; do not assume a Gmail filter exists merely from saved confirmation.
2. Explicitly authorize available non-model features if desired. AI stays selected/pending and its clock does not start. ScaledCircle intake/introduction/follow-up OFF choices stay OFF unless separately changed, saved and authorized.
3. Start with AR and a genuinely new Founder-controlled incoming message from skotiatrades@gmail.com matching the saved filter. Confirm the selected label actually receives it; no historical import. Verify one CRM conversation and owner-email alert, then review and send an exact permitted owner reply through ScaledCircle.
4. If testing Schedule, review a newly future available slot and the required actual location, obtain clear genuine acceptance and confirm one linked event. Do not use an old time. Repeat independently for ScaledCircle only after its relevant capabilities are explicitly enabled/authorized.
5. AI suggestions are a separate later step after processing prerequisites and explicit owner authorization; this non-model test does not certify them. No implementation sends, appointments, inference or production outcome fixtures are permitted.

Shared Flutter delta: review/partial-authorization, adaptive alternatives/consent, evidence and outcome presentation. Installed iOS 29 / Android 27 do not contain this batch. No native rebuild here.

Validation/deployment evidence is appended after production readback; fixture results are not live pilot certification.

Production UI verification caught an additional relative-expiry clock race: separate Date.now calls could resolve the policy milliseconds later than its prepared grant and falsely report valid_policy_term_required. The owner preflight now captures one instant for grant, budget and policy expiry checks. A moving-clock regression covers this; no saved expiry or owner choice is rewritten. This is server-only and does not change the web build.

## Deployed/read back

- Main application source: `ae14ab43e433554fcee92e47226fa370f9784286`; final server timing correction: `af1069ade4f6d5ac47d77b72f6a857bf339e4725`. Both pushed. Web bytes are unchanged by the latter server-only commit.
- `businessEmailOperationsV1`: `businessemailoperationsv1-00018-qof`, ACTIVE, updated 2026-09-21T10:50:57.026027228Z.
- `syncBusinessEmailRepliesV1`: `syncbusinessemailrepliesv1-00009-viy`, ACTIVE, updated 2026-09-21T10:47:01.613092560Z.
- Hosting: `sites/scaled-circle/versions/febf737b15016b76`, release `1789987648745000`, 2026-09-21T10:47:28.745Z.
- Readback: no unexpected Functions changed; Rules, runtime service identities, environment configuration and secret bindings preserved. Eight protected mailbox/policy/grant/usage records hash-identical before/after. Both policies still prepared and unapproved; shared inference grant prepared, start null, usage absent.
- Live AR owner UI: opened Business Email → Email assistance settings → E. Review and save → Review & authorize assistance. Confirmation displays saved v3, label/new intake ON, follow-ups OFF, availability v2, selected AI pending and a real **Authorize available features** button. False expiry blocker absent. Confirmation left unaccepted for Founder; Revoke absent for this never-authorized policy.
- Tests: 57 focused backend tests passed; latest selection dispatcher suite 8/8; moving-clock authorization suite 8/8; adaptive pure suite 5/5; final projection subset 3/3; Flutter UI 6/6; focused Dart analysis clean; production web build succeeded. Earlier full integrated suite 49/49 includes inquiry intake, independent reply monitoring, owner alerts, exact approved reply, budget and one conflict-checked appointment. No claim that these fixtures prove live delivery, learning improvement or appointment operation.
- Local evidence: `.firebase/launch-close-20260919/email-adaptive-*` logs/readbacks; private outputs remain ignored. No production prospect send, model call, appointment, activation, subscription change or native rebuild in this batch. The only outgoing message was the separately authorized Google case amendment recorded above.
