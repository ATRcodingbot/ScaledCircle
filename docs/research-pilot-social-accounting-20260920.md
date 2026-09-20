# Shared research pilot and historical Social accounting

Founder authorization: attachment `038330dc-f1e8-4c79-b93c-236da4324258`. This checkpoint supersedes the pending-budget wording in `social-enforcement-research-preparation-20260920.md`; it does not claim activation.

## Research: approved, not activated

The approved $5 is shared across production Attractive Remodel (`scaled-circle/IqRjZYHKOzXYuJcSyL68LYNwtDg1`) and the separate staging-backed ScaledCircle internal Growth workspace (`scaledcircle-staging/FF1bfDuvtdNjuuC4mc7NdGtk3LC3`). No production grant has been saved, no paid access request dispatched, and the seven-day clock has not started. Start/end must be recorded from the eventual authenticated activation, not this document. No spend or discoveries are claimed.

The private production `researchPilotAuthorityV1` uses one production ledger, exact runtime-to-workspace bindings, one search call/request, 1,200 maximum output tokens, $0.10 reservations, two requests/workspace/day and a hard 28-request lifetime cap including validation. Unknown provider outcomes retain reservations. No automatic retries, renewal or top-ups. Responses use gpt-4.1-mini and non-preview web_search. Tenant prospect records remain in their own projects; the shared authority receives only bounded public query inputs and usage attribution.

Scheduled adapters are prepared in source but NOT deployed or enabled. Local configuration must explicitly enable the fixed central endpoint. Interactive/manual research paths do not inject the paid transport. Internal ScaledCircle query context uses its existing maintained target-industry registry, not Attractive Remodel's Business profile. Preferences, source verification, dedupe and suppression remain in the existing discovery path. Automatic outreach remains off.

### Exact pending permission

- Principal: `998249478055-compute@developer.gserviceaccount.com` (existing staging research runtime).
- Resource: `projects/scaled-circle/locations/us-east1/services/researchpilotauthorityv1`.
- Minimal role: service-level `roles/run.invoker` (`run.routes.invoke`).
- Purpose: invoke the private, workspace-bound central research authority; no production Firestore role.
- Status: requested from Founder, NOT applied. Production runtime already has project-level invoker authority. Endpoint service IAM has no public bindings, verified 2026-09-20 14:08:35 UTC.

Before enabling recurring spend: approve/apply only this service binding; verify both real runtime transports and maintained provider access; expose/use authenticated activation and the single reserved access check; record its cost separately from scheduled research; then enable/deploy only the two scheduled adapters without changing cadence. Activation/access-check helpers are currently source functions, not an exposed Admin activation workflow. Do not claim end-to-end readiness yet.

Existing next-cycle evidence: Attractive Remodel approximately September 21 11:34:08.496 UTC; internal ScaledCircle September 21 13:00 UTC. These are research eligibility times, not paid search results. Re-read authoritative schedule state if activation happens later.

## Attractive Remodel: reconciliation deployed, authenticated application pending

Read-only inventory at 13:52:36 UTC: 19 historical visual-review attempts; 11 have response/token evidence totaling $0.008431 at the standard-rate upper bound. Eight lack sufficient cost evidence. The reconciliation retains $0.50 per unknown attempt ($4.00 total), covering the documented model input/output envelope conservatively. This is not a final provider invoice or an assertion that unknown calls were free.

The existing counters/reservation authority receives additive, stable per-attempt records in one transaction. Attempt inventory mismatch fails closed. Repeated reconciliation returns the saved audit and does not duplicate entries, reset concepts, increase allowance, bill the Business or use ScaledCircle's operating grant. Only the Attractive Remodel accounting-ready marker is changed after successful import. Existing ready scheduled publication is unaffected.

The maintained Admin action is deployed in `getGeneratedMediaOperations`. It requires a verified authenticated production Admin. The prepared localhost helper at port 18633 still showed signed out at this checkpoint; no production reconciliation was applied. New paid preparation remains held until this action succeeds. Preserve the helper tab for Founder sign-in; never bypass via ad hoc CLI writes.

## ScaledCircle Social

At the 13:50:40 UTC readback, the existing grant had one successful source concept, $0.043135 accounted cost, no reservation, and zero current-strategy scheduled jobs. Remaining grant: $14.956865 and 59 concepts, subject to other maintained controls. Policy expiry remains October 20 00:00 UTC / October 19 8:00 PM EDT. No re-enrollment or manual generation/scheduling/publication occurred.

A stale supply blocker was traced to an older deployed preparation-worker archive, despite the previous deployment report. The older archive lacked the grant lookup. Bounded redeployment corrected it. The new deployed worker's `social_managed_supply.js` SHA-256 matches source: `B4DF832547DAAB0B7AE9F3CFB4BC91309E6D1249320C396EBB74F8799F2DC9DE`. Natural scheduling/publication proof remains OPEN; the successful generated concept is not publication evidence.

## Deployment and tests

Deployed source `258a6505ad0826ae4095e7e743d4cc1262309d65`:

| Function | Revision |
|---|---|
| runManagedSocialPreparationV1 | runmanagedsocialpreparationv1-00010-dal |
| prepareCustomerSocialPostV1 | preparecustomersocialpostv1-00026-xuc |
| processGeneratedServiceVisual | processgeneratedservicevisual-00010-qal |
| runManagedSocialVisualGenerationV1 | runmanagedsocialvisualgenerationv1-00004-lin |
| getGeneratedMediaOperations | getgeneratedmediaoperations-00005-zuv |
| researchPilotAuthorityV1 | researchpilotauthorityv1-00001-fud |

Readback at 14:06:53 UTC confirmed 250 unrelated Functions unchanged, existing application environment/secret bindings preserved, Hosting `77c805c14d14357d` and Rules `eabb947e-4e2b-41ca-a4e2-ef993e4dd3e8` unchanged. No native changes/builds.

Focused validation: 14 passing historical-accounting/budget persistence cases; 14 passing adapter/runtime binding/client cases after the final transport edits; one passing customer discovery-to-CRM/dedupe fixture. Suites overlap prior evidence and are not a combined novel-test count. Tests used local fixtures/emulators only, no paid provider requests. Initial persistence setup needed the local emulator restarted; rerun passed. JavaScript syntax checks and diff whitespace checks passed.

Local evidence: `.firebase/launch-close-20260919/researchpilot-deployment-readback.json`, `researchpilot-private-readback.json`, `research-runtime-access.private.json`, `ar-review-accounting.private.json`, and `socialbudget-enrollment-readback.json`. Preserve private evidence locally. No verifier/polling loop was recreated.
