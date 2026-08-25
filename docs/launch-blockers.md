# ScaledCircle Launch Blockers

Audit date: 2026-08-24. This file contains only P0 findings. P0 Batches 1–3 are production-verified; their QA caused no financial activity.

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

## P0-4 — Authenticated browser reload can reconstruct `/login` — RESOLVED

- Production status: RESOLVED and manually verified in Firefox. The declarative browser-visible route boundary, separate Business/Scaler/Admin login sessions, consistent Sign Out, protected-route denial after logout, repeated campaign/Job Room Back/Forward, and role gates passed. Customer role switching remains removed.
- Previous problem: successful login pushed an unnamed `MaterialPageRoute`; the browser URL could stay `/login`, so refresh reconstructed login rather than the authenticated dashboard/workflow.
- Role: Business, Scaler, Admin.
- Risk: users lose workflow context during payment, Job Room, completion review, or recovery.
- Acceptance: named/restorable role routes; refresh/back/forward tests for dashboards, campaign detail, Job Room, payment return, and completion review; authenticated users never see a false logged-out workflow.
- Implemented scope: stable role, campaign, and Job Room URLs; Firebase Auth/profile gates; authoritative resource reload; payment-return continuation; branded unknown-route recovery. Financial authority is unchanged.
- Production proof: Business, Scaler, and Admin normal-login sessions, role URLs, reload, Sign Out, and protected-route denial passed. Business campaign Back/Forward passed. No financial action or production-data mutation occurred during QA.
- P1 follow-up: a Codex automation browser retained a broken intermediate Flutter service-worker response after the corrected release. Direct custom-domain/origin HTTP checks and Firefox served the valid current asset. Audit update strategy, cache invalidation, Hosting headers, rapid replacement/rollback, and automatic recovery in `docs/p1-flutter-web-cache-recovery.md`.

## P0-5 — Production has no minimum usable Sales funnel — LIVE + VERIFIED

- Problem: the Admin “Sales Program” card is deliberately disabled and referral administration is not a Sales workflow. There is no maintained lead owner, status, next follow-up, notes, or conversion path.
- Role: Sales, Admin.
- Risk: launch acquisition cannot be operated or measured consistently; launch gate explicitly requires a usable minimum workflow.
- Acceptance: a minimal internal-only funnel supports Prospect → Qualified → Contacted → Follow-up → Interested → Signup → Activated → First Campaign → Paid, with owner, source, next action, notes, and auditable conversion attribution. No autonomous outreach.
- Likely scope: small server-mediated Sales surface and backend authority.
- Staging proof: role/access tests, one synthetic lead lifecycle, attribution read-back, no financial mutation.
- Batch 3 staging proof: the Admin-authorized `/sales` home/detail flow and zero-secret `sales-core` are deployed and hosted-verified. One clearly marked Internal QA lead passed Prospect → Qualified → Contacted ledger → scheduled follow-up → Interested, note recording, and Do Not Contact suppression. Pipeline counts updated; suppression removed the lead from actionable follow-ups; Business and Scaler were denied. No outbound message, payment, financial mutation, or production action occurred.
- Production proof: the curated `sales-core` deployment exposes exactly `getSalesPipeline`, `mutateSalesLead`, and `recordSalesActivity` as ACTIVE Gen 2, Node.js 24, `us-east1`, zero-secret Functions. Production Admin login, `/sales`, reload, canonical branding, and Sign Out passed. Business and Scaler access fail closed; the Scaler Wallet remained unchanged. The certified Hosting bundle matched live production. No prospect, outbound message, payment, refund, earning, Wallet mutation, Connect account, transfer, or payout was created during production QA.

## P0-6 — Public trust/legal consent authority — STAGING VERIFIED

- Staging status (2026-08-24): public legal routes, immutable acceptance, consent-gated funding/application/assignment authorities, Hosting, and the server-only application-create Rule are deployed and verified. Hosted Business funding stopped before Stripe until current Terms/Privacy acceptance. Hosted Scaler application and legacy-applicant assignment both stopped before mutation until current Terms/Scaler Work Terms acceptance, then proceeded exactly once through server authority. No payment, earning, or Wallet mutation occurred.
- Remaining engineering release work: curate and approve the coordinated production rollout. New-session location-notice enforcement remains deferred to the separately gated worker-lifecycle promotion.
- Remaining professional blocker: founder policy is approved, while worker classification, jurisdiction/privacy rights, dispute/liability terms, and other documented binding legal conclusions remain open for attorney review.
- Role: Public, Business, Scaler.
- Risk: users cannot review the rules governing payment, refunds, tracked work, evidence, earnings, or marketing consent before commitment.
- Acceptance: professionally reviewed documents are linked from public footer and relevant commitment points; versions/acceptance timestamps are retained where required; language matches Stripe-first Business payments and separate Scaler earnings/payouts.
- Likely scope: legal content/links, consent versioning, professional legal review.
- Staging proof: link, responsive, accessibility, and acceptance-record tests. This audit does not offer legal conclusions.

## P0-7 — Minimum launch operations cannot be completed inside ScaledCircle — LIVE + VERIFIED

- Production status: P0 Batch 2 is live and manually verified. Admin Home provides one Needs Attention queue, bounded operational metrics, recent authoritative activity, categorical system health, and a derived campaign timeline.
- Authority: `admin-ops-core` exposes three Admin-only, server-authoritative interfaces for the overview, campaign timeline, and typed support-case status transitions. Business, Scaler, and signed-out access fail closed. The codebase has zero provider-secret bindings.
- Financial safety: normal payments/refunds remain notifications and timeline events, not exceptions. Financial summaries distinguish customer gross, worker allocation, ScaledCircle fee, refunds, and worker earnings. The UI cannot create payment, refund, earning, Wallet, transfer, or payout authority.
- Support: the hosted zero-state and existing staging data passed; the typed Open → In Progress → Resolved transaction path, authorization, audit, and replay behavior are covered by focused tests. No generic Firestore editor exists.
- Production proof: Admin normal login, reload, Command Center, Needs Attention, metrics, activity, health, timeline, support surface, responsive layout, Sign Out, and post-logout denial passed. Business and Scaler normal Auth sessions were denied Admin Ops. The live bundle exactly matched the certified production build. No financial or historical-record mutation occurred.
- Runtime scope: exactly three `admin-ops-core` Functions and Hosting; zero Rules or unrelated Function deployments.

## Launch rule

Official launch remains blocked by unresolved production P0-1, P0-2, P0-3, and P0-6; security-critical findings must be zero and rollback/runbooks reviewed. P0-6 consent engineering is staging-verified but still needs curated production promotion, while professional attorney review remains open. P0-4/P0 Batch 1, P0-7/P0 Batch 2, and P0-5/P0 Batch 3 are live and production-verified. Four production P0 gates remain; three still require product implementation.
