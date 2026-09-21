# Email assistance settings lifecycle — September 21, 2026

Application/server source: `4439ecc79d97c663cbf75fee219d106d3a910a6c` (pushed).

## Confirmed cause and scope

The previous server `prepare` action unconditionally replaced an already-authorized active policy with `prepared`. The UI then continued to offer full authorization. The dirty Review early-return placed its explanation above the long form, away from the pressed action. Additionally, `load` swallowed a failed readback and its caller overwrote that error with save success, leaving dirty edits alongside a saved-state message. The available browser showed Attractive Remodel active v4 without dirty edits, not the exact ScaledCircle failed request; its precise earlier payload/error was not recovered. No claim is made that a particular validation field caused that historical request.

## Repair

The existing maintained owner action now reviews and updates authorized preferences transactionally. The review digest binds the exact proposed configuration and base version. Ordinary updates preserve authorization attribution, active/paused/revoked status and the original expiry; an earlier stop may shorten it. Expired records cannot renew through saving. Audit retains changed fields, focused permission expansion and the configuration snapshot. Resume retains initial approval attribution. No new grant or accounting system.

Expanded intake/coverage, enabled sending, higher caps, widened sending windows/content boundaries, adaptive/comparison mode or Schedule authority require one focused Confirm changes inside Save changes. Reductions need no expansion confirmation. Model selection remains pending separate readiness and explicit authorization. Sender/recipient, suppression, queued-message revalidation and immutable sent history remain enforced by the existing dispatcher.

Never-authorized UI uses Save draft and Review & enable. Authorized UI uses Save changes and read-only View permissions; Pause/Revoke and Resume remain separate. Nearby live-region feedback identifies unsaved sections, failures and conflicts. Dirty state clears only after the exact saved version is read back. Failed readback has Check saved result; conflicts retain local input and offer an explicit choice to load saved preferences. In-flight newer edits and stale load responses are protected.

## Focused validation

11 backend tests (Firestore emulator + pure change review) and 11 Flutter UI tests passed. Coverage includes initial partial authorization, ordinary updates, cancelled/failed expansion, stale versions, replay, stopped inference clock, pause/resume, revoked/expired saves, tenant isolation, narrowing, exact diff digest, UI dirty state, visible conflict and readback retry without duplicate save. Focused Flutter analysis clean. No full-regression or native-build claim.

## Bounded deployment

Only `businessEmailOperationsV1`: `businessemailoperationsv1-00020-vud`, ACTIVE, update 2026-09-21T12:14:35.506420700Z. All other Function revisions unchanged. Runtime identity, environment, secret bindings and Firestore Rules unchanged.

Hosting `52cf53887695b2ec`, release `1789992901787000`, 2026-09-21T12:15:01.787Z. Production web build uses APP_ENV=production. All eight protected policy/mailbox/grant/budget record hashes matched immediately after deployment.

Shared Flutter change is pending the next matched native pair; iOS 29 / Android 27 lack it. No native rebuild. No Google, Stripe, research or Social changes; no messages, appointments or model calls initiated.

## Production UI verification

Production Attractive Remodel owner UI: active v4 → trailing-space-only Business-name edit → Save changes → Checking changes → All changes saved / existing authorization and expiry preserved → dirty cleared → View permissions opens a read-only saved-version-5 dialog with no authorization action. The UI trims the Business name back to its existing value. No capability switch was touched. A full page refresh and reopen confirmed active / All changes saved with the same September 28 expiry and no unsaved flag.

Authoritative update audit `update_1789993016871000`, 2026-09-21T12:16:58.384Z, base v4 → v5, expansions empty. The only normalized preference addition was `adaptiveOutreach` with enabled=false, explorationEnabled=false, empty alternative and the default objective; fixed-message behavior remained unchanged. Original approvedAt 2026-09-21T11:32:00.810Z, expiry 2026-09-28T11:32:01.242Z, AI-pending true and availability v2 preserved. ScaledCircle policy remains active v2 with its saved OFF intake/introduction/follow-up choices and original expiry. Both mailbox records, both pilot grants, shared inference grant and absent usage record are hash-identical to predeployment; only the intentionally tested AR policy/audit changed.

Founder retest: Business Email → Email assistance settings → edit the intended preferences → E. Review and save → Save changes. Ordinary changes save directly. An expansion opens its actual diff; Confirm changes applies that version under the existing expiry. Cancel retains current authority and the local draft. No repeated initial authorization; pending AI remains pending.

