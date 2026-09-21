# Email message preparation and adaptive execution — September 21

## Scope and findings

Continues application 4439ecc79d97c663cbf75fee219d106d3a910a6c and handoff 9198c7d. No live messages, model calls, appointments, mailbox reconnection, policy edits or grant activation in this implementation.

Read-only production snapshot at 2026-09-21T12:40:01.149Z: Attractive Remodel active v5 (updated 12:16:58.384 UTC), label-scoped future intake and introductions on, follow-ups/adaptive/comparison off. Schedule availability v2. Expiry September 28 11:32:01.242 UTC. ScaledCircle active v4 (updated 12:32:27.566 UTC), future Inbox intake and introductions on, follow-ups/adaptive off, comparison selected with an empty alternative. Availability v1. Expiry September 28 11:33:16.002 UTC. Both request pending AI and push without a ready device; email alerts are independent. Attractive Remodel has nine contacts with permission not recorded; ScaledCircle has no contacts. Neither has verified eligible outbound recipients from this readback.

The saved ScaledCircle comparison/adaptive combination was accepted by the prior validator when adaptive was false. This is now explicitly displayed and rejected on a future save; existing selections are not silently rewritten. The available evidence does not prove that a previously selected true adaptive switch was serialized as false. Current authoritative summaries and dispatcher both read the saved policy.

## Checkpoint A

Existing Messages section now separates owner-written versus ScaledCircle-prepared origin from fixed/adaptive execution. Maintained context supplies baseline and distinct alternative previews without a paid call; owner mode preserves the baseline and requests only an alternative. Replacing nonempty copy requires an explicit draft-replacement confirmation. Existing Save changes/focused Confirm changes remains authoritative and preserves the original term, pending AI and audit. Blank manual adaptive alternatives and contradictory comparison selections produce specific errors.

Initial proposals are deterministic maintained-context proposals, not proof of model generation. ScaledCircle's existing corrected proposal uses customer-readable Core Business OS language instead of planning categories. Model-preparation readiness, latest learning decision and next bounded step are visible. No new scheduler or agent.

## Checkpoint B

Prepared copy (including fixed mode) gets immutable workspace, strategy, policy version, objective, audience, template, origin, context references, validation and authority attribution. Existing stable prospect/account assignment consumes its exact variant. Existing dispatcher and send authority revalidate current policy, recipient, sender, limits and copy; sent records retain the assignment/experiment lineage.

A new model-written candidate is triggered only after both arms have at least 20 comparable mature prospects and zero qualified outcomes, with a complete bounded evidence window. One stable attempt per strategy; baseline remains preserved. Generation plus independent quality review must pass factual, distinct-approach, recipient-purpose and public-copy checks. Failed/uncertain/rejected attempts do not automatically retry. Old sent records are immutable; corrected outcomes affect subsequent evaluation. Controlled traffic remains excluded by existing commercial-evidence filtering.

Model path uses existing gpt-4.1-mini Responses transport, store:false, minimized reviewed Business context and existing templates. It excludes Gmail messages and prospect identity fields. Structured outcome evaluation is local and non-model. Each generation/review request uses the existing shared transactional reservation/reconciliation controls; one candidate normally takes two requests, at most $0.0096 reserved in total under the maintained token bounds. Rejected/provider-uncertain calls count and unknown cost stays reserved. Default provider retention is not zero retention.

## Actual gates, not activation

The existing shared $1 / 100-request / seven-day inference grant remains prepared with null start/end. Outbound purpose extension was requested once and remains pending user response at preparation time. The runtime requires explicit audited outbound_business_context purpose authorization on that same grant, an outbound-specific provider/data assessment, current owner-reviewed Business context and an active allowance. No parallel budget, implicit extension or clock start. Reply/Gmail processing remains separately gated.

The maintained Admin purpose-enrollment/activation disposition must be completed after the pending scope decision; this change does not claim that an unrecorded purpose is authorized. Current normal reply-specific enrollment does not itself grant outbound scope. No new paid provider or funds from research/Social.

## Focused validation

- 17 pure policy, inference, learning and preparation tests pass.
- 22 initial emulator integration tests pass (execution, complete roundtrip fixture, budget, owner authority).
- Final changed-path emulator set: 13 pass (10 dispatcher tests including fixed prepared mode and one bounded candidate, plus 3 provider/runtime budget tests). Overlap is intentional after the fixed-mode change; these are not 35 unique tests.
- 13 Flutter owner/conversation tests pass, including both message-origin choices and protected-copy confirmation.
- Focused Flutter analysis clean. No test skips. Fixtures are not production delivery, conversion or appointment proof.

## One owner review / controlled test

Business Email → Email assistance → B. Messages and eligible recipients. Choose origin, prepare previews, review Business facts/audience/sender, choose fixed/adaptive and optional comparison, retain/review existing limits, then Save changes and confirm only the actual expansion. Do this separately for each Business; do not reset the term or disable pending reply AI to save.

Before a controlled send, record genuine permission for the exact test recipient and review the exact test content. Attractive Remodel's existing label filter only covers its reviewed test subject/from pair; changing subject requires an explicitly reviewed routing change. No new controlled recipient permission is inferred from earlier OAuth certification. Observe one permitted send, genuine reply, conversation/email alert and immutable assignment attribution. Retain a clear controlled-test marker so it is excluded from commercial learning. One test reply cannot establish a winning strategy. No live test executed here.

## Release disposition

Shared Flutter delta: Messages origin/previews/validation/learning status on top of all earlier Email authorization, access, disconnect, availability and intake work. iOS 29 / Android 27 do not include these changes. Final full regression and new matched native pair remain separate release steps after this bounded batch and its production smoke check. No repeated Google/Stripe/map/Admin work. External review/CASA, natural Social publication, useful research and deferred cash-out remain separate gates.


## Deployment and final candidate readback

- Server application source: `b90df01fdb607d6364367a1a0e3b30d875012769`.
- Final application candidate: `c399e5aeb287df763717e9c7a8d215208749c5b9`, clean and pushed. Only the final two Flutter files differ from the server source: show prepared alternatives in fixed mode and translate the specific model gate into readable copy. Server bytes are identical.
- `businessEmailOperationsV1`: `businessemailoperationsv1-00021-tob`, ACTIVE, September 21 13:00:22.614715278 UTC.
- `syncBusinessEmailRepliesV1`: `syncbusinessemailrepliesv1-00010-voj`, ACTIVE, September 21 13:01:44.865172775 UTC.
- Final Hosting version `aea07743cdaefd40`, release `1789995854266000`, September 21 13:04:14.266 UTC.
- No unexpected Function changes. Rules, environment variables, secret bindings and runtime service identities unchanged. Eight protected mailbox, policy, grant and shared usage records hash-identical before/after.
- Production owner UI confirms Attractive Remodel's original active v5, fixed execution, no eligible recipient dispatch, pending model authority, message-origin selector and proposal action. No saved preferences or confirmations clicked during this batch.
- Fresh full regression on c399e5a: backend 833 pass / 2 opt-in emulator skips / 0 fail; Flutter 815 pass / 3 maintained skips / 0 fail (APP_ENV=staging). Skips: backend Story publisher concurrency and Story preparation immutable replay; Flutter quote debounce, early-access referrer-name dialog, postcard file-picker cancellation. These skips are not passing coverage. Focused new Email emulator tests listed above have no skips.
- Final focused analysis and production web build pass. The current full suite does not replace the explicit new Email emulator coverage.

## Consolidated native delta from 79dda7b

No native iOS/Android configuration or tracked Flutter dependency lock changes. Shared client changes span Email assistance/setup/availability/permission/conversation, Email connection/entry, Schedule integration, Business Email/Operations services, Growth agent/prospect/evidence/relationship presentation, Admin agentic Growth display and public model-data disclosure. Tests changed alongside these clients. These exact bytes are absent from iOS 29 / Android 27.

The tested application source can be used as a gated candidate; it is not a claim of model activation or live pilot certification. Before another matched pair, dispose of the pending outbound-purpose enrollment/activation source work, then pin one exact source and check actual unused Apple/Play numbers. No number is reserved or claimed verified here. Avoid multiple intermediate rebuilds. The pending scope answer is not permission, and no new paid call is justified by fixture success.
