# P0 Batch 1 — Authentication, Navigation, and Authoritative UI State

Audit/remediation date: 2026-08-23. Scope is Flutter routing/auth restoration and the Job Room material aggregate. P0 Batch 1 is live and verified in production.

## Architecture before

`MaterialApp` combined a small static route table with `onGenerateRoute`, while most workflows used unnamed `MaterialPageRoute` objects. The maintained tree contained 117 `MaterialPageRoute` constructions, 73 `Navigator.push` calls, and seven unnamed `pushReplacement` calls. Successful Business and Scaler login used unnamed replacements, so the visible screen changed while the web URL could remain `/login`. Campaign details and Job Rooms depended on in-memory documents/arguments and therefore were not reconstructible from a URL. Unknown routes fell through with no product recovery screen.

## Architecture after this batch

Flutter's built-in `Router` / `RouterDelegate` / `Page` model now owns the small set of browser-visible routes; no third-party routing framework was added. Existing unnamed Navigator flows remain in place for internal, modal, and wizard navigation.

- Stable role destinations: `/business`, `/scaler`, `/admin`.
- Stable resource destinations: `/campaign/<campaignId>` and `/job-room/<zoneId>`.
- Existing stable routes retained: `/verify-email`, `/campaign-funding-return`, public funnels, signup, and profile completion.
- `ProtectedRouteGate` restores Firebase Auth, reads `users/{uid}`, enforces active/beta and role policy, and renders protected content only after authorization.
- Campaign detail re-reads `campaigns/{campaignId}` and permits the owning Business or Admin.
- Job Room reconstructs only from `zoneId`; `getJobRoom` remains the server authority for membership, assignment, material, readiness, and campaign state.
- Authenticated `/login` reload resolves to the authoritative role dashboard. Signed-out protected URLs retain the intended URL and display normal login; successful login returns through the protected gate.
- Unknown routes render a branded recovery screen with a safe login or role-dashboard destination.
- Important campaign/Job Room entry points now push stable names, including dashboard cards, notifications, Current Campaigns, campaign material cards, and the post-Checkout return.

## Workflow classification

| Workflow | Before | Candidate |
|---|---|---|
| Business dashboard | reload unsafe | hosted login/reload/sign-out/history passed |
| Scaler dashboard | reload unsafe | hosted login/reload/sign-out/cross-role denial passed |
| Admin dashboard | role-gated but separate login path | hosted login/reload/sign-out and authoritative Admin gate passed |
| Business campaign detail | argument-only; reload unsafe | hosted Back/Forward/reload and owner protection passed |
| Job Room | argument-only; reload unsafe | hosted deep-link/reload/Back/Forward and server membership passed |
| Email verification | generated URL route | preserved; safe invalid-link recovery passed |
| Referral `?ref=` | read from `Uri.base` at signup | preserved through hosted root-query routing |
| Payment return | stable route, authoritative listener | preserved; funded transition now opens stable campaign URL |
| Unknown route | no recovery | branded authenticated/signed-out recovery |

Browser history correctness follows from the declarative browser-visible route boundary. Hosted staging proved repeated campaign and Job Room Back/Forward traversal without losing the Forward stack. The remaining unnamed routes are modal, wizard, subordinate, or separately deferred surfaces; they are not silently claimed as globally reload-safe.

## Authenticated session lifecycle

- Business, Scaler, and Admin shells expose the same accessible `Sign Out` action, including responsive layouts.
- Sign Out calls Firebase Auth session termination and navigates to `/login`; it does not change role, profile, approval, or financial data.
- Hosted staging proved Business, Scaler, and Admin login, reload, sign-out, and post-sign-out protected-route denial with separate role-specific accounts.
- The prior Admin failure was browser automation leaving the secure password field empty. Staging-only safe diagnostics reported `missing-password`; normal secure-field keystroke entry authenticated the existing enabled Admin user. No credential or account mutation was required.
- The Business/Scaler role switch and its client mutation remain removed.

## Authorization outcomes

- Business cannot render Scaler or Admin dashboards.
- Scaler/Marketer cannot render Business or Admin dashboards.
- Admin can pass protected role gates but campaign documents are still checked before rendering.
- Pending/unapproved profiles fail the protected gate.
- Signed-out users do not see protected resource content before login.
- Campaign ownership is re-read; URL identity is not trusted as authority.
- Job Room participant authority remains enforced by `job-room-core:getJobRoom`.

## Authoritative aggregate correction

Before, `receivedCount` always counted group participant handoffs. A single-Scaler room intentionally has no participant handoff projection, so an authoritative Zone handoff of `received` displayed `0 / 1`.

After, group assignments still count participant handoffs; single-Scaler assignments derive `receivedCount` from the authoritative Zone handoff. No participant record is manufactured and group semantics are unchanged.

Closely related counters were inspected. Assignment/readiness counts already use room membership and readiness documents. Application and completion counters are outside this narrow Job Room projection and no unrelated authority change was made.

## Duplicate surfaces deferred

- Campaign creation has both catalog/type-specific wizards and older generic screens.
- Marketplace has campaign-specific and older job marketplace surfaces.
- Applicants have Business campaign-specific and shared campaign screens.
- Review has completion review, user review, and campaign review surfaces with overlapping names but different contracts.

No removal was made: compatibility and maintained callers remain. Canonical-route consolidation is a P1 simplification after this P0 batch.

## Acceptance status

RESOLVED in production. The staging-proven candidate was curated onto actual production and deployed as Hosting plus only `job-room-core:getJobRoom`; no Rules or unrelated Functions were deployed.

Manual Firefox production QA passed for all three authoritative role-specific accounts:

- Business login to `/#/business`, reload, Campaign Details, browser Back/Forward, Sign Out, and protected-route denial after logout.
- Scaler login to `/#/scaler`, reload, Business/Admin denial, unchanged Wallet, Sign Out, and protected-route denial after logout.
- Admin login to `/#/admin`, reload, Admin dashboard authority, Sign Out, and `/admin` denial after logout.
- The Business/Scaler role switch remained absent for Business and Scaler, and no customer role switch appeared for Admin.

No payment, refund, earning, Wallet, Connect, transfer, payout, Rules, or production-data mutation occurred during actor QA. Campaign/Job Room history, verification, referral, payment return, unknown-route recovery, and the single-Scaler `1 / 1 received` aggregate retain the hosted staging proof and deployed production implementation evidence.

The Codex automation browser retained stale service-worker state from a broken intermediate Hosting release even though direct custom-domain/origin HTTP checks and Firefox received the corrected assets. This is classified as a P1 deployment/cache-recovery concern, not a current production-bundle defect; see `docs/p1-flutter-web-cache-recovery.md`.
