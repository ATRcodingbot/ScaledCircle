# P0 Batch 4 Public Trust and Legal Audit

Audit date: 2026-08-24. Production baseline: `9e4867518593cb1440117740f924e8edac86a711`.

## Inventory

| Surface | Before Batch 4 | Decision |
|---|---|---|
| Public Terms | MISSING | Add one readable source-grounded page. |
| Privacy Policy | MISSING | Add one role-aware data/use page; do not invent retention periods. |
| Payments/cancellation/refunds | PARTIAL across campaign UI/docs | Add one public lifecycle summary linked from public/signup surfaces. |
| Scaler work/location/evidence terms | PARTIAL in active-job modal and internal docs | Add a public Scaler agreement and improve the session disclosure. |
| Public legal hub/footer | MISSING | Add small branded legal index and footer. |
| Support/contact | PARTIAL | Add public route using only `support@scaledcircle.com`. |
| Signup acceptance | MISSING durable legal version | Add concise checkbox plus immutable server acceptance. Marketing remains separate. |
| Affiliate terms | PARTIAL/INTERNAL | Preserve existing explicit Phase 1 acceptance; disclose that accounting/settlement is unavailable. |
| Account deletion/export | PARTIAL/MISSING | Do not claim self-service completeness; direct verified requests to Support. |
| Cookie notice | NOT JUSTIFIED BY CURRENT INVENTORY | Do not add a banner; record jurisdiction/legal review. |

## Product conflicts and corrections

- Production payout/cash-out is not launch-certified. Public language must distinguish earning/Wallet authority from bank payout and avoid payment-time guarantees.
- The public product includes beta/provider-dependent direct mail, advertising, intelligence, attribution, and affiliate concepts. Legal text does not certify them; the launch matrix retains their separate gates.
- Existing signup optional email checkbox is marketing/launch-update consent, not Terms acceptance. Batch 4 separates the two.
- The active-job disclosure used the spaced old product name and had no legal detail link. Batch 4 uses `ScaledCircle`, explains active-session scope, and links to Privacy.
- No explicit reviewed retention schedule or minimum age was found. Both remain founder/legal decisions.

## Data and technology inventory

- Account: name, email, role, profile, approval/verification, contact and discovery source.
- Business: service areas, campaign/Zone/content/material/logistics, participant and review records.
- Scaler: preferences, applications, assignments, active-session GPS/routes/chunks, checkpoints/photos/evidence, completion, earnings and Wallet projections.
- Financial: Stripe identifiers, campaign payment/refund records, allocation/fee, earning, transfer/payout status references.
- Support: case summary, participant/campaign context, status and audit history.
- Sales: Admin-scoped prospect/contact, source, follow-up, activity, suppression and conversion linkage.
- Affiliate: enrollment, accepted terms version, attribution, rate and incomplete accounting state.
- Web persistence: Firebase Auth browser persistence, Flutter/service-worker caches, and narrow session storage for early-access/emulator state. No maintained analytics SDK, advertising pixel, or marketing tracker was found.

## Consent authority

`legal-core:recordLegalConsent` is a Gen 2, Node.js 24, `us-east1`, zero-secret callable. It accepts only the authenticated profile owner, re-reads authoritative role, permits fixed agreement/version pairs, uses deterministic immutable document IDs, applies server `acceptedAt`, and is idempotent for the same version. It cannot write financial or campaign authority.

The remediation candidate adds bounded own-user `legal-core:getLegalConsentStatus` and a shared read-only server contract. Enforcement is placed at the owning action boundaries: campaign funding, Scaler application, assignment obligation, and new tracking-session creation. Errors use `failed-precondition` with `reason: LEGAL_CONSENT_REQUIRED` and exact missing agreement/version pairs. The maintained application client no longer writes Firestore directly.

Staging closure is blocked by one necessary security change: Firestore Rules must deny direct application creation so `application-core:applyToCampaign` is the exclusive authority. The candidate Rule and regression test pass locally; no Rules deployment was performed under the current authorization.

Versions:

- `terms-2026-08-v1`
- `privacy-2026-08-v1`
- `scaler-work-2026-08-v1`
- `location-notice-2026-08-v1`

Material-change/re-consent workflow is intentionally future work after professional review.

## Separate feature certification

Legal discoverability does not certify QR/landing pages, call tracking, tracked email, postcards/direct mail, printing/postage, social advertising, property/weather intelligence, physical GPS/camera, worker authority migration, payout, subscriptions, or affiliate settlement. Their existing readiness decisions remain independent.
