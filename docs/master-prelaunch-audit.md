# ScaledCircle Master Pre-Launch Audit

Audit date: 2026-08-24. Evidence: current source, test suites, reviewed staging E2E, production inventories, exact-bundle verification, and manual production actor QA. P0 Batch 3 was promoted without outbound or financial activity.

## Executive assessment

The core Business Stripe lifecycle, reload-safe routing, minimum Admin/Ops Command Center, minimum Sales workflow, public legal discovery, and action-level consent authority are production-proven, while the new worker earning boundary is staging-proven through the Android emulator. ScaledCircle is not ready for official launch because physical Android proof, production worker-authority parity, worker cash-out, and professional legal review remain open.

The product should launch around one narrow promise: Businesses fund mapped field campaigns; approved Scalers complete verified work and earn transparent compensation. Intelligence, Managed Growth, social publishing, direct mail, automated outreach, and payout automation must remain gated until each is complete and supportable.

## Repository and deployments

- Branch: `codex/scaler-earning-authority-remediation-20260823`
- Local HEAD: `df7bea8e92c50e9a35e8d2c71ac2dec01e22865d`
- Production branch HEAD: `f844af7005ae00f415fd4d7f85f6b216f856c9a1`
- Worktree: intentionally dirty with staging Android configuration, assignment/discovery/completion/job-room/payout isolation, earning/redo/payment compatibility fixes, reproducible generated locks, and tests. No audit-time product implementation was added.
- Staging Functions: 29 ACTIVE, Node.js 24/us-east1: assignment-core 3, discovery-core 2, campaign-funding 6, completion-core 8, job-room-core 6, payout-core 4.
- Production Functions: 71 ACTIVE: platform-core 40, default 13, campaign-funding 6, assignment-core 3, discovery-core 2, transactional-email 3, and one each artifact-email/job-alert-email/wallet-core/weather.
- Production still contains legacy/default completion, payout, tracking, subscription, review, and funding authorities. Staging and production worker lifecycle ownership are not equivalent.

## Current proven financial/worker evidence

- Business TEST gross: $9.60; worker allocation: $8.00; platform fee: $1.60.
- Android emulator native bridge and foreground service: 7 samples; internal GPS harness unused.
- Coverage: 52.9%; approved base earning: $2.64; bonus: $0.
- Exactly one immutable earning and one $2.64 Wallet transaction; no duplicate.
- No connected account, transfer, or payout.
- This proves earning is created by approved verified completion, independently of provider payout execution.

## Public

- Strengths: authentic role-specific funnels, responsive Flutter UI tests, active signup/login, public illustrative map disclosure, Stripe/dollar language.
- P0 staging remediation: discoverable maintained Terms, Privacy, payment/refund, Scaler work/earnings, location/evidence, and support pages now exist with versioned consent authority. Binding classification, retention, jurisdiction, affiliate settlement, and payout policy still require founder/counsel review before production promotion.

## P0 Batch 4 public trust staging verification

- Stable signed-out routes: `/legal`, `/terms`, `/privacy`, `/payments-refunds`, `/scaler-terms`, and `/support`.
- Public footer, login, and signup expose the appropriate documents; signup acceptance is separate from optional marketing email preference.
- Active tracked work presents a concise location/evidence disclosure before the native tracking pipeline and links to Privacy.
- `legal-core:recordLegalConsent` is a Node.js 24 Gen 2, zero-secret, idempotent authority for own-user versioned consent; signed-out calls return 401.
- Hosted staging deep links, reload, Back/Forward, 390×844 layout, and exact bundle match passed. No production, financial, outreach, or payout action occurred.
- Professional review remains required for the policy decisions recorded in `legal-policy-decisions-required.md` and `legal-review-checklist.md`.
- The consent-action candidate uses one canonical exact-version helper and structured `LEGAL_CONSENT_REQUIRED` responses. It protects new funding, new Scaler application, new assignment obligations, and new tracking sessions without globally locking out legacy users. Existing active tracking sessions remain recoverable.
- The server-only application-create Rule is deployed to staging. Hosted actor QA proved direct application authority remains closed, `application-core` creates one post-consent application, and assignment defense-in-depth blocks a legacy applicant until current work consent before creating one immutable obligation. No payment, earning, or Wallet mutation occurred.
- `location-notice-2026-08-v1` enforcement for new tracking sessions remains source/test-verified in the future worker candidate and is not production-active until the physical-device/worker-lifecycle gate.
- Production deployment verified 2026-08-25: exactly six consent-owning callables are ACTIVE, the live Hosting bundle matches the certified SHA-256, and Firestore ruleset `08214668-9748-429f-b2c3-c8a319978634` denies direct client application creation. Storage Rules, unrelated Functions, financial state, and worker state were untouched.
- P1: copy is lengthy and describes architecture rather than showing the product. Pricing, SEO/share metadata, password-reset links, referral persistence, Safari, and unknown-route recovery need launch QA.
- Decision: launch homepage, role funnels, login/signup, and illustrative map after P0/P1 fixes; hide waitlist for launched roles; keep affiliate entry invite-only.

## Business

- The quote → Stripe Checkout → signed webhook → funded → publish lifecycle is READY and LIVE-proven.
- Eligible unassigned cancellation/refund, applicant-only refund, assignment block, signed refund finality, archive, and revised-campaign behavior are READY and LIVE/staging-proven.
- Assignment-core is deployed in production and staging with race guards.
- Service Areas and Zone analysis have isolated production/staging authorities.
- P0: production Job Room/completion authority differs from staging-proven ownership. Production lacks completion-core and job-room-core parity.
- P1: campaign creation has duplicated screen families; dashboard and campaign details expose too many tools/states; “Approve Payment” should describe work approval/earning; summary projections can disagree with details.
- Advanced products: Property/Weather/Managed Growth/social are PARTIAL and should be entitled beta/Coming Soon. Direct-mail/social-ad payment products are not complete and must not expose purchase actions.
- Business credits remain retired. No audited maintained core flow routes back to `fundCampaign`; `fundCampaignWithCard` correctly calls current Checkout authority.

## Scaler

- Marketplace, application, assignment, Job Room, material receipt/readiness, native tracking, completion submission, review, earning, and Wallet work together in staging.
- P0: physical Android QA remains; production completion ownership remains legacy; worker cash-out launch policy is missing.
- Wallet/earning terminology should remain, but transfer/payout language must not imply self-service availability.
- Work Preferences are authoritative but long; use progressive disclosure for travel, vehicle/cargo, and outreach consent.
- Push remains explicitly Coming Soon; remove disabled controls from primary setup.
- Camera flow calls `image_picker` with `ImageSource.camera`, which delegates to Android external capture. The manifest correctly lacks `CAMERA` and `ACCESS_BACKGROUND_LOCATION`; physical capture/cancel/upload remains unproven.

## Admin

- LIVE + VERIFIED: guarded Admin login plus one responsive Command Center with Needs Attention, bounded operational metrics, concise recent activity, categorical health, and an authoritative derived campaign timeline.
- P0 Batch 2 authority: Admin-only `admin-ops-core` read models correlate payment/refund, completion/earning, email/provider, support, and campaign/participant exceptions. A typed audited support status command is the only new mutation; no generic document editor exists.
- Financial copy separates customer gross, worker allocation, platform fee, refund, and worker earning. Provider health is categorical operational evidence, never a fabricated percentage.
- Production QA proved Admin access, Business/Scaler denial, session restoration, empty/error states, responsive layout, Sign Out, and existing campaign/payment/earning timeline data without financial mutation.

## Sales

- Status: NOT IMPLEMENTED. The disabled Sales card is accurate but does not satisfy launch operations.
- Referral/affiliate administration is not a Sales funnel.
- Minimum required: lead owner, source, stage, notes, next follow-up, conversion links, and first campaign/payment milestones. Keep internal-only and server-mediated.

## Operations and support

P0 Batch 2 productizes the minimum routine exception view in production without replacing payment/refund authority. The Command Center correlates authoritative ScaledCircle records, while high-authority financial recovery remains behind existing purpose-built controls and human review rather than raw console editing.

| Event | Launch operating class | Required behavior |
|---|---|---|
| Signed payment/refund replay | SELF-RECOVERING | Idempotent reconciliation and durable result |
| Payment/refund mismatch | ADMIN ALERT | Correlated read-only state and typed recovery |
| GPS rejection/loss | SELF-RECOVERING + HUMAN if unresolved | Simple resume/help path; preserve evidence |
| Material disagreement/no-show | HUMAN DECISION REQUIRED | Support case, timeline, settlement freeze |
| Email/provider failure | ADMIN ALERT / AGENT-AUTOMATABLE LATER | Deduplicated incident, bounded retry |
| Dispute/chargeback | HUMAN DECISION REQUIRED | Financial review; no automatic earning clawback |
| Campaign inactivity/expiration | SELF-RECOVERING | Deterministic state/notification |
| Security anomaly | ADMIN ALERT | Fail closed; audited investigation |

## Financial and accounting semantics

- Business payments: Stripe dollars. Business credits/wallet: retired from new payment UX.
- Field campaign fee: 20%. Full eligible campaign refund returns the full gross payment; ScaledCircle retains $0 of that charge.
- Scaler compensation: immutable `assignmentCompensations`; earning: deterministic `scalerEarnings`; Wallet is a projection; transfer/payout is separate.
- Direct mail/postcards: future 20% platform fee with printing/postage/vendor/list costs separated.
- Social ad spend: 0% percentage markup on actual ad spend; only separate explicit service/subscription fees are revenue.
- Affiliate liability is not a mature settlement/payout system.
- Admin alerts must distinguish gross payment, worker liability, ScaledCircle fee, refund, earning, transfer, and payout.

## Financial authority map

| Event | Canonical authority | Conflicts / action |
|---|---|---|
| Campaign payment | signed Stripe + `campaignPayments` | Keep `fundCampaign` legacy only; monitor before retirement |
| Worker obligation | `assignmentCompensations/{zoneId}` | Immutable after assignment |
| Tracking/completion | tracking session/chunks/route + `campaignCompletions` | Production legacy completion must migrate |
| Worker earning | `scalerEarnings/{deterministicId}` | Promote only after physical gate |
| Wallet | deterministic transaction/projection | Never root earning authority |
| Transfer | `scalerTransfers` + Stripe Connect | Not launch-proven; human gate |
| Refund | campaign payment/refund + signed Stripe event | Legacy refund callable later retirement |
| Affiliate commission | attribution/rate records | Complete liability/settlement authority absent |

## Legacy

Traffic-sensitive production resources include `fundCampaign`, `approveZonePayout`, older tracking/review Functions, subscription purchase authority, and default operational triggers. Do not delete them in bulk. For each: identify maintained callers, observe traffic, migrate same-ID ownership where required, deploy new authority, verify, then perform separately approved targeted retirement.

Known source-only competing path: `requestCampaignCancellationRefund`; maintained cancellation is `cancelUnassignedFundedCampaign`.

## Security

Current tests strongly cover server-mediated role, payment, assignment, tracking, completion, earning, Wallet, and Rules authority. Firestore Rules 19/19 and Storage Rules 6/6 pass. Clients are denied direct authoritative financial/evidence writes.

Launch security work:

- Run a focused callable/Rules threat model across every role and cross-tenant identifier.
- Verify production has one intended owner for each callable ID after migration.
- Keep provider secrets isolated; generated locks are now clean/reproducible.
- Add structured security/audit visibility without logging location, card, tax, or secret material.
- Validate support/admin screens cannot expose participant-private logistics or evidence.

No security-critical bypass was found in this source audit, but the production legacy overlap is a P0 authority-management risk.

## Privacy

- Public: marketing content and explicitly illustrative fixtures only.
- Role-private: profile/contact/preferences and account notifications.
- Participant-private: exact Job Room logistics, pickup/dropoff instructions, precise routes, checkpoints, photos, and support content.
- Admin-only: operational exceptions and necessary audit detail.
- Financially restricted: payment identifiers, refunds, earnings, Wallet, transfers, disputes.

Required follow-up: retention/deletion policy for precise routes/photos/support content, redacted exports, account deletion behavior, screenshot/log hygiene, and professional review of consent/disclosure. Do not expose exact routes in marketplace/public views.

## Notifications and email

- Deterministic signup, job-alert, payment, refund, application, assignment, cancellation, completion, and earning patterns exist.
- Payment/refund Admin alerts are production-verified and duplicate-safe.
- Worker earning must be described as worker liability/earning, not new platform revenue.
- Push is not implemented; keep disabled/Coming Soon outside the core flow.
- Audit every email’s sender/reply-to, mobile rendering, plain text, link environment, deterministic identity, retry state, and transactional versus marketing classification.
- Failed, retry-exhausted, and long-pending durable email jobs are visible in the staging Command Center without exposing provider secrets; execution/retry authority remains separate.

## Navigation and state consistency

Top defects:

1. Post-login unnamed routes leave `/login` in browser history/location; reload can reconstruct login (P0).
2. Single-Scaler `receivedCount` is computed only from group participant handoffs, yielding `0 / 1` while authoritative handoff is `received` (P1).
3. Multiple campaign/applicant/marketplace screen families risk divergent behavior (P1).
4. Unknown routes have no explicit recovery page (P1).
5. Deep-link/back/forward tests are incomplete for Job Room, campaign detail, verification, referrals, and payment return (P1).

State rule: display detail authority directly when practical; treat summaries as replaceable projections with version/timestamp and reconciliation.

## Failure and recovery

Strong: payment/refund webhook replay, assignment race, tracking chunk ordering/retry, completion/earning replay, Wallet idempotency, and refund failure freeze.

Needs launch proof: app kill/screen lock on physical Android; camera cancel/upload failure; slow/offline Firestore UX; Business no-response; no-show/support settlement; failed email/provider queues; expired verification/password links; browser route restoration; support recovery without console edits.

## Performance

No production performance measurement was executed. Source risks requiring measurement:

- dashboard and notification listeners with broad query lifetimes;
- multiple screens querying the same campaign/Zone/application data;
- Job Room aggregation and per-participant handoff reads;
- map/provider initialization and Zone analysis;
- large route/evidence documents and image uploads;
- client-maintained campaign summary projections;
- Admin issue queries without correlated pagination/search.

Measure user-perceived startup, dashboard first content, map readiness, Job Room load, tracking sync, photo upload, and review load. Optimize only measured P0/P1 problems.

## Visual design and accessibility

- A shared theme/brand and responsive components exist, but legacy/new screen families create inconsistent density, card geometry, and CTA hierarchy.
- Primary action is often obscured by explanatory text, several cards, or technical state.
- Preserve tested keyboard-focusable Admin cards and responsive funnel behavior.
- Audit contrast, semantics, focus order, 44–48px tap targets, form errors, dialog focus, map alternatives, loading/empty/error states, and screen-reader labels.
- Chrome/Edge have substantial QA evidence; Firefox/Safari and iOS architecture remain unproven. Do not claim physical iOS/Android proof beyond evidence.

## Outreach, funnels, and agents

Do not implement autonomous outreach. First build the minimum Sales funnel and structured attribution. Future Business outreach should use public evidence, consent/suppression, rate limits, human-approved templates, and auditable attempts. Future Scaler recruiting should begin with deterministic supply gaps and optimize for first verified earning/repeat completion, not raw signup.

The proposed agent permissions and APIs are in `agent-automation-readiness.md`. Financial, legal, security, role, production release, and consequential worker decisions remain human-approved Class C actions.

## Recommended remediation batches

1. Cross-role named navigation, reload, back/forward, unknown-route recovery.
2. Physical Android gate and defects found there.
3. Production completion/job-room ownership migration and legacy sequencing.
4. Worker cash-out policy/TEST gate and truthful Wallet presentation.
5. Retain and monitor the production-verified minimum Admin/Support Command Center; expand only from measured operational need.
6. Public trust/legal surface with professional review.
7. Minimum internal Sales funnel.
8. Top P1 simplification/state-consistency work.
9. Advanced-feature gating and visual consistency.

Do not combine these into one broad release.

## P0 Batch 3 Sales production verification

The minimum Sales funnel is live and production-verified: one Admin-authorized Sales home, lead detail, follow-up schedule, contact/note ledger, suppression, source attribution, Business linkage, and server-derived activation/payment milestones. The staging Internal QA lifecycle passed; production Admin access and Business/Scaler denial passed without copying QA lead data. It does not send outreach, create a Sales role, label receipts as revenue, or allow manual Paid/Retained status. See `sales-funnel-foundation.md`.
