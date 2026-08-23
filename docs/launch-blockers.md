# ScaledCircle Launch Blockers

Audit date: 2026-08-23. This file contains only P0 findings. Production was not changed.

## P0-1 — Physical Android worker proof is incomplete

- Problem: emulator integration proves the native bridge, foreground service, tracking chunks, completion, earning, and wallet projection, but not genuine device GPS, screen-lock continuity, battery behavior, or real camera return/upload behavior.
- Role: Scaler, Business, Operations.
- Risk: field evidence or privacy/battery behavior can fail after a worker accepts paid work.
- Acceptance: physical Android staging run proves genuine movement, foreground notification, screen-lock/background continuity without `ACCESS_BACKGROUND_LOCATION`, accepted/rejected sample behavior, camera capture/cancel/upload where required, and service termination after completion/cancel. Internal GPS harness remains disabled.
- Likely scope: QA and only defects discovered by QA.
- Staging proof: one assigned, funded TEST campaign through verified completion and exactly one wallet earning; stop before Connect/transfer/payout.

## P0-2 — Production worker lifecycle does not match the staging-proven authority

- Problem: staging has `completion-core` (8 Functions) and `job-room-core` (6 Functions). Production still runs older/default `submitZoneCompletion` and `approveZonePayout`, while Job Room authorities are split under `platform-core` and several maintained same-ID/new authorities are absent.
- Role: Business, Scaler, Support.
- Risk: the launch client can reach workflows whose production authority differs from the tested earning boundary.
- Acceptance: after P0-1, approve a migration plan with one owner per callable ID; deploy exact completion/job-room targets; prove assignment → handoff → verified completion → one earning → one wallet increment; retain rollback and legacy retirement sequencing.
- Likely scope: `completion-core`, `job-room-core`, default retirement exclusions, exact Hosting compatibility.
- Staging proof: already functionally proven in emulator; repeat only the physical-device portions and migration smoke tests.

## P0-3 — A launch-safe worker cash-out operating model is not established

- Problem: earning authority and Wallet projection work, but Connect onboarding, transfer, withdrawal, failure handling, KYC/tax boundaries, and Support procedures have not passed an approved staging gate. The Wallet copy refers to earnings and payouts while general self-service withdrawal authority is not launch-proven.
- Role: Scaler, Admin, Support.
- Risk: workers can earn money without a truthful, supportable path to receive it.
- Acceptance: choose and document launch policy (manual reviewed payout or tested Connect flow); establish eligibility, KYC/tax responsibility, pending/failed states, reconciliation, support SLA, and a TEST-only payout E2E. Hide or clearly gate any unusable cash-out control.
- Likely scope: payout operations contract, payout-core review, Wallet copy/gating, admin visibility.
- Staging proof: TEST connected account/onboarding/transfer only after separate approval; never use LIVE for QA.

## P0-4 — Authenticated browser reload can reconstruct `/login`

- Candidate status: RESOLVED in hosted staging. The declarative browser-visible route boundary, separate Business/Scaler/Admin login sessions, consistent Sign Out, protected-route denial after logout, repeated campaign/Job Room Back/Forward, and role gates all passed. Production promotion remains separately gated and unauthorized.
- Previous problem: successful login pushed an unnamed `MaterialPageRoute`; the browser URL could stay `/login`, so refresh reconstructed login rather than the authenticated dashboard/workflow.
- Role: Business, Scaler, Admin.
- Risk: users lose workflow context during payment, Job Room, completion review, or recovery.
- Acceptance: named/restorable role routes; refresh/back/forward tests for dashboards, campaign detail, Job Room, payment return, and completion review; authenticated users never see a false logged-out workflow.
- Implemented scope: stable role, campaign, and Job Room URLs; Firebase Auth/profile gates; authoritative resource reload; payment-return continuation; branded unknown-route recovery. Financial authority is unchanged.
- Staging proof: hosted Flutter web actor sessions and responsive Sign Out passed; broader cross-browser compatibility remains a P1 release matrix rather than this P0 authority blocker.

## P0-5 — Production has no minimum usable Sales funnel

- Problem: the Admin “Sales Program” card is deliberately disabled and referral administration is not a Sales workflow. There is no maintained lead owner, status, next follow-up, notes, or conversion path.
- Role: Sales, Admin.
- Risk: launch acquisition cannot be operated or measured consistently; launch gate explicitly requires a usable minimum workflow.
- Acceptance: a minimal internal-only funnel supports Prospect → Qualified → Contacted → Follow-up → Interested → Signup → Activated → First Campaign → Paid, with owner, source, next action, notes, and auditable conversion attribution. No autonomous outreach.
- Likely scope: small server-mediated Sales surface and backend authority.
- Staging proof: role/access tests, one synthetic lead lifecycle, attribution read-back, no financial mutation.

## P0-6 — Public trust/legal links and required disclosures are not discoverable

- Problem: maintained public UI search found no discoverable Terms, Privacy, refund-policy, location/evidence, independent-contractor, affiliate-terms, or payout-language links. Consent checkboxes exist but do not replace the complete documents.
- Role: Public, Business, Scaler.
- Risk: users cannot review the rules governing payment, refunds, tracked work, evidence, earnings, or marketing consent before commitment.
- Acceptance: professionally reviewed documents are linked from public footer and relevant commitment points; versions/acceptance timestamps are retained where required; language matches Stripe-first Business payments and separate Scaler earnings/payouts.
- Likely scope: legal content/links, consent versioning, professional legal review.
- Staging proof: link, responsive, accessibility, and acceptance-record tests. This audit does not offer legal conclusions.

## P0-7 — Minimum launch operations cannot be completed inside ScaledCircle

- Problem: Admin UI covers issues, roles, beta entitlements, subscriptions, and provider configuration, but not campaign/payment/refund/completion/earning/email/support exception queues. Operators still need Firebase, Stripe, and logs for routine recovery.
- Role: Admin, Support, Operations.
- Risk: paid campaigns and worker obligations can strand without a safe, auditable response path.
- Acceptance: one internal operations queue exposes read-only correlated status and approved actions for payment/refund review, completion/earning exceptions, support cases, and failed email/provider jobs. Actions call maintained server authorities; no free-form Firestore mutation.
- Likely scope: minimum exception API + admin queue, not an enterprise portal.
- Staging proof: fixture-driven exception resolution, authorization, audit, retry/idempotency, and no direct financial writes.

## Launch rule

Official launch remains blocked by unresolved P0-1, P0-2, P0-3, P0-5, P0-6, and P0-7; security-critical findings must be zero and rollback/runbooks reviewed. P0-4 is resolved in staging and still requires separately approved production promotion.
