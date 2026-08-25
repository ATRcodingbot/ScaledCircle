# P0 Batch 4 Production Promotion Manifest

Status: **PRODUCTION REVIEWED — NOT DEPLOYED**  
Review date: 2026-08-24  
Candidate: `8e0a65d8df6efe2967a036827746156e3eafcee8`  
Production Git baseline: `9e4867518593cb1440117740f924e8edac86a711`

This is the coordinated release manifest for versioned legal consent. It is not deployment approval. Production writes, deployments, Stripe calls, and financial actions during this review were zero.

## Current production inventory

| Callable | Current owner | Generation / source hash | Runtime | Region | Secret bindings |
|---|---|---|---|---|---|
| `recordLegalConsent` | absent | — | — | — | — |
| `getLegalConsentStatus` | absent | — | — | — | — |
| `applyToCampaign` | absent | — | — | — | — |
| `assignScalerToZone` | `assignment-core` | `1787429535945858` / `e76adf2dde85e1430030f5dec2cecb64a58640b2` | Node.js 24, Gen 2 | `us-east1` | none |
| `acceptZoneGroupSlot` | `assignment-core` | `1787429573324262` / `e76adf2dde85e1430030f5dec2cecb64a58640b2` | Node.js 24, Gen 2 | `us-east1` | none |
| `createCampaignFundingCheckoutSession` | `campaign-funding` | `1787443525469613` / `3690e790e7cf689cef955bc0483e34ac95110b7b` | Node.js 24, Gen 2 | `us-east1` | `STRIPE_LIVE_SECRET_KEY` |

No duplicate resource exists for any target. The first three are new callable IDs. The other three are in-place revisions under their existing codebase owners. `configureZoneGroupAssignment` remains owned by `assignment-core` but is unchanged and excluded.

Production Hosting live channel currently points to release `1787578189608000`, version `67b587993207e99f`, released at `2026-08-24T13:29:49.608Z`. The current live `main.dart.js` SHA-256 is `99577FA460E72FFBE17622BB770EA32F984D69C4E70E5EAA6C37A8B51BA8C0ED`.

The read-only Security Rules API reports release `projects/scaled-circle/releases/cloud.firestore`, ruleset `projects/scaled-circle/rulesets/37182a6f-b95e-4258-b860-3510cfcb54ed`, created `2026-08-03T23:31:50.528499Z`. Its content matches the production Git baseline exactly after line-ending normalization (both SHA-256 `9D08EC60DB0A7E94A3AD120A583D93C783CEF40509B14272F6049AE134FB1980`). The exact checked-in rollback artifact is the `firestore.rules` blob at production HEAD, Git blob `3c74a631696c8763aaf77c260e52d29816d92f0a`. The reviewed candidate Rules blob is `b53d481d69de672f2f9b5e1bf19f8f99f7eabef0` (file SHA-256 `F3FC592EC48329CEC2E5E548467DCBC94949819CDF0814E883A09AC9FDCB905F`). Storage Rules are unchanged.

## Exact production runtime scope

Deploy exactly these callable targets:

- `functions:legal-core:recordLegalConsent`
- `functions:legal-core:getLegalConsentStatus`
- `functions:application-core:applyToCampaign`
- `functions:assignment-core:assignScalerToZone`
- `functions:assignment-core:acceptZoneGroupSlot`
- `functions:campaign-funding:createCampaignFundingCheckoutSession`

Then deploy the production Hosting bundle from this candidate and the single reviewed Firestore Rules change. Do not deploy any other Function or Storage Rules.

The exact production bundle reproduced during review has SHA-256 `1D8A754B6390F86D8BE7C659685FCCB905D7663AEDDD871C5308482378CBBE9C`. It was built with `APP_ENV=production`; its selected Firebase project is `scaled-circle`. The staging build also passed and had SHA-256 `46F9D298FAF4CC244F48B18C90E25F90A05C27A8F5F7D05D3B134F51B3F2DF7D`.

Source package SHA-256 values used for review:

| Package source | SHA-256 |
|---|---|
| `functions-legal/index.js` | `37683C0E4ECAB9C0F7936F769FFE42FBC9E5CF76180F456C6441BB466F8FD8A4` |
| `functions-application/index.js` | `E47878A9DFA9DAABDC35842039A678A5E20C7C4E1D74B28E08FF4ED97B82CFF1` |
| `functions-assignment/index.js` | `6EEF170876E798AE1EF99AAAF2FBA89E087F815C523C136DAD207FBD40A5540B` |
| `functions-campaign-funding/index.js` | `8F315D5FC86935A2F6A886D294A6598CA17E6DA7ED6D5E03D9790A78F02109F6` |

### Secret contract

- `legal-core`, `application-core`, and the two reviewed `assignment-core` callables: zero secrets.
- `createCampaignFundingCheckoutSession`: production selects and binds `STRIPE_LIVE_SECRET_KEY`. Staging selects `STRIPE_TEST_SECRET_KEY`. No secret value is present in source or this manifest.
- No Stripe API was called during review.

## Candidate-to-production file classification

### A — required production consent-authority change

Customer runtime and Hosting:

- `apps/mobile/lib/main.dart`
- `apps/mobile/lib/navigation/app_routes.dart`
- `apps/mobile/lib/screens/auth/login_screen.dart`
- `apps/mobile/lib/screens/auth/register_screen.dart`
- `apps/mobile/lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart`
- `apps/mobile/lib/screens/business/create_campaign_screen.dart`
- `apps/mobile/lib/screens/campaigns/campaign_details_screen.dart`
- `apps/mobile/lib/screens/jobs/job_details_screen.dart` (work-consent gate and versioned location-notice UX; server tracking enforcement is category C)
- `apps/mobile/lib/screens/public/legal_document_screen.dart`
- `apps/mobile/lib/screens/public/public_funnel_components.dart`
- `apps/mobile/lib/screens/public/public_landing_screen.dart`
- `apps/mobile/lib/screens/public/public_legal_footer.dart`
- `apps/mobile/lib/screens/scaler/campaigns/scaler_campaign_details_screen.dart`
- `apps/mobile/lib/services/auth/auth_service.dart`
- `apps/mobile/lib/services/campaign/campaign_service.dart`
- `apps/mobile/lib/services/campaign_service.dart`
- `apps/mobile/lib/services/legal_consent_service.dart`
- `apps/mobile/lib/widgets/legal_consent_prompt.dart`

Backend authority and deploy packaging:

- `firebase.json`
- `firestore.rules`
- `functions/legal_consent.js`
- `functions/index.js` (mixed A/C canonical source; category C export is excluded from deployment)
- `functions-assignment/index.js`
- `functions-assignment/legal_consent.js`
- `functions-campaign-funding/index.js`
- `functions-campaign-funding/legal_consent.js`
- `functions-legal/README.md`, `functions-legal/index.js`, `functions-legal/legal_consent.js`, `functions-legal/package.json`, `functions-legal/package-lock.json`
- `functions-application/README.md`, `functions-application/index.js`, `functions-application/legal_consent.js`, `functions-application/operational_layer.js`, `functions-application/tracking_security.js`, `functions-application/package.json`, `functions-application/package-lock.json`
- `functions/package.json`
- `functions/scripts/generate_functions_codebases.js`
- `functions/scripts/prepare_functions_codebases.js`
- `functions/scripts/verify_generated_codebases.js`
- `functions/scripts/verify_generated_installability.js`

### B — staging/test/documentation/generated-only

- Tests: `apps/mobile/test/legal_action_consent_test.dart`, `apps/mobile/test/public_legal_trust_test.dart`, `functions/consent_action_authority.test.js`, `functions/functions_codebase_architecture.test.js`, `functions/legal_consent.test.js`, `functions/tracking_rules.test.js`.
- Documentation: `docs/agent-automation-readiness.md`, `docs/command-center-foundation.md`, `docs/founder-legal-approval-summary.md`, `docs/launch-blockers.md`, `docs/legal-policy-decisions-required.md`, `docs/legal-review-checklist.md`, `docs/master-launch-readiness-matrix.md`, `docs/master-prelaunch-audit.md`, `docs/p0-public-trust-legal-audit.md`.
- Regenerated non-target artifacts with no production deploy target in this release: `functions-admin-ops/index.js`, `functions-artifact-email/index.js`, `functions-discovery/index.js`, `functions-job-alert-email/index.js`, `functions-job-room/index.js`, `functions-sales/index.js`, `functions-sales/package-lock.json`, `functions-transactional-email/index.js`, `functions-wallet/index.js`.

### C — future worker-lifecycle change

- The `completion-core:startTrackingSession` location-notice enforcement contained in canonical `functions/index.js`.
- Its regression coverage in `functions/tracking_backend.test.js`.
- The client location-notice prompt is permitted in Hosting, but it is not represented as server-authoritative production enforcement until the completion-core migration passes the physical Android gate.

### D — unrelated/deferred

No category D runtime target is required. Completion, payout, default, job-room, Admin Ops, Sales, email, discovery, wallet, and other campaign-funding callables are explicitly excluded.

## Rules change

Only `campaigns/{campaignId}/applications/{scalerId}` creation changes:

- before: an approved signed-in Scaler could create their own application document directly;
- after: client create is denied (`allow create: if false`), making `application-core:applyToCampaign` the sole maintained creation authority.

Application reads and the pre-existing update policy are unchanged. Business/Admin server access through the Admin SDK is unaffected. The full Firestore suite passes 20/20 and Storage Rules pass 6/6.

## Compatibility

The currently supported production web client has a direct-create application path. During rollout, Functions must therefore precede Hosting, and Rules must follow Hosting immediately. Before Rules changes, cached old web clients retain the old behavior for the short transition window. After Rules changes, a stale client receives a denied atomic write: it creates no partial application, no duplicate, and no false server success. Its recovery is refresh/reload to the new Hosting release, which calls `applyToCampaign` and presents structured `LEGAL_CONSENT_REQUIRED` recovery.

No production Android/iOS release is certified or supported; repository launch documentation explicitly says not to ship Android until the physical-device and release-signing gates pass. There is therefore no maintained mobile version whose direct-create path blocks this Rules promotion. Any privately retained pre-release build will fail closed and must be replaced.

Legacy users are not migrated or silently accepted. They retain account, history, Wallet, and support reads. They explicitly accept the current versions before a new funding, application, or assignment obligation. There is no bulk consent migration, inferred acceptance, Admin acceptance, or timestamp backfill.

## Rollout

1. Confirm production Git HEAD and this manifest again; build the production bundle and verify its SHA.
2. Deploy exactly the six Function targets above.
3. Inventory all six: Active, Gen 2, Node.js 24, `us-east1`, expected codebase, expected secret names, one owner each. Smoke signed-out denial for legal/application and run safe authenticated status checks.
4. Deploy Hosting from the exact production build.
5. Verify the Hosting version/release, live `main.dart.js` SHA, public legal routes, auth restoration, and consent recovery UI.
6. Immediately deploy only Firestore Rules.
7. Prove signed-out, own-client, and cross-user direct application creation are denied; prove the callable creates one authorized application and existing authorized reads still work.
8. Run the minimal Business and Scaler actor smoke plan below. Stop before payment, tracking, earning, or payout.

The Functions-to-Hosting interval is backward compatible. The Hosting-to-Rules interval should be kept to minutes: the new client is safe, while stale clients can still use the legacy direct create until Rules close it. After Rules deploy, stale clients fail closed and must reload.

## Verification plan

Business QA account:

- legacy login, dashboard, campaign history, and support remain usable;
- a safe protected funding attempt without current consent returns `LEGAL_CONSENT_REQUIRED`;
- confirm no Checkout Session/payment record exists before consent;
- verify the Terms/Privacy prompt and acceptance only if the production QA account is explicitly approved for that durable consent mutation;
- do not pay or complete Checkout.

Scaler QA account:

- legacy login, profile, Wallet, history, and support remain usable;
- a safe new application shows the work-consent gate;
- after explicitly approved QA-account acceptance, `applyToCampaign` creates exactly one application;
- a direct client create remains denied;
- no production tracking is started for this release.

If no harmless production campaign/account fixture exists, use signed-out denial, read-only status, Rules tests, and source/inventory proof rather than manufacturing customer or financial state.

## Rollback

Prefer a forward fix because reverting consent authority reopens a bypass.

1. Before Hosting/Rules: if any Function is unhealthy, stop. Redeploy the prior assignment and funding revisions by their recorded source generations or the production-baseline source. Remove the three newly created callable IDs only if returning fully to the prior baseline is explicitly approved.
2. After Hosting but before Rules: roll Hosting back to version `67b587993207e99f`; the unchanged Rules still support the old client. New Functions can remain dormant or be rolled back afterward.
3. After Rules: keep direct application creation closed while repairing `applyToCampaign` whenever possible. A Rules-only rollback to production blob `3c74a631696c8763aaf77c260e52d29816d92f0a` immediately reopens direct application creation and bypasses server consent, so it requires explicit emergency approval and a coordinated full-release rollback.
4. Safe full rollback order after Rules is: prior Hosting version, prior Rules artifact, prior assignment/funding revisions, then removal of new legal/application callables. This briefly makes stale clients functional before old server behavior returns, but the Rules rollback is the point at which the consent bypass reopens.
5. Funding-consent failure: stop funding use and prefer a forward fix. Rolling only `createCampaignFundingCheckoutSession` back removes the consent gate and is not an acceptable unattended recovery.
6. Consent UI mismatch: before Rules, revert Hosting only. After Rules, keep Rules closed and roll forward the UI/application callable.

No rollback step may fabricate consent, mutate customer agreements, or touch Wallet/earning/payout authority.

## Certification evidence

- Backend: 334/334 passed.
- Firestore Rules: 20/20 passed.
- Storage Rules: 6/6 passed; no Storage Rules diff.
- Flutter: 292 passed, 1 intentional skip.
- `flutter analyze`: no issues.
- Generated packages: 14/14 clean `npm ci --ignore-scripts` passed.
- Staging and production web builds: passed.
- Secret-value scan: no Stripe live/restricted/webhook secret values or private keys; checked-in Firebase client API options are expected public configuration.
- `git diff --check`: passed before documentation changes.
- Package installation reports existing moderate transitive advisories; no dependency or secret scope was added beyond the reviewed Firebase packages and the existing Stripe funding package.

## Deferred and legal gates

- Professional attorney review: **OPEN**. It is not a technical code-promotion blocker, but it remains required before official broad public launch.
- Location-consent server enforcement: **DEFERRED**. `completion-core:startTrackingSession` is not a target in this release.
- Physical Android and production worker-lifecycle migration: **OPEN**.
- Cash-out/Connect/transfer/payout: unchanged and excluded.

Final technical decision: the coordinated production promotion is technically ready, subject to explicit deployment approval and exact-scope execution of this manifest.
