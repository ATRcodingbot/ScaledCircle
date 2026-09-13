# Pricing, Referrals and production-compatible Account Deletion

Status: staging Founder review candidate. Coordinated production promotion is held until physical acceptance of Pricing and Referrals.

## Account Deletion

The dedicated account-closure codebase exports only accountClosureV1 and finishAccountClosureV1 (us-east1). It contains no Stripe secret, payment-certification export, QA identity or TEST ledger implementation. Matched production/scaled-circle and staging/scaledcircle-staging runtimes are accepted; mismatches fail before Auth access. Both clients use the dedicated endpoint. The prior staging endpoints remain undisturbed.

Recent authentication, typed DELETE, explicit confirmation, durable intent, token revocation, personal preference/token/notification cleanup, tombstone and retry finisher are preserved. Workspace credentials belong to the Business and are retained; provider-linked personal payout identities block closure for review. Financial, referral, consent, compensation and work history remain retained. Pending earnings, Wallet funds, financial operations, active work and referral liabilities block deletion. Final owners are protected; authoritative ownership transfer allows personal closure while preserving the workspace and subscription history.

Production firestore.rules and storage.rules add only the corresponding accountClosures existence guard to their authentication helper. Client writes cannot create/remove closure markers. No staging Rules wholesale replacement. Production Rule deployment is prepared, not performed.

## Public presentation

Pricing now has one cohesive four-plan grid, prominent prices/seats, an included-with-every-paid-plan section, and three premium cards. Managed Growth uses a compact access badge and Request Access. Prices and seat totals are unchanged. Business Assistant and Lead Generation remain separate from Managed Growth; Growth Department identifies the combined offering and ten seats. Email Campaigns is Private Beta; provider setup and roadmap details are removed from the pricing decision.

Referrals now leads with Grow your circle. Get rewarded., prominent 10% and 1% cards, a Share / They join and qualify / You earn sequence, and Pending / Under Review / Paid explanations. No signup reward, instant payout or downstream reward is promised. Scaler pay protection is explicit. Primary links enter the maintained referral portal; signed-out routing retains LoginScreen(returnRoute: '/referral-portal'). No referral accounting changed.

## Evidence

- Flutter staging: 702 passed, 2 skipped. Flutter production: 703 passed, 1 skipped. Analyzer clean.
- Production-mode closure backend: 8 passed, including pending earning and transferred-owner protection.
- Production Firestore/Storage closure + workspace Rules: 5 passed.
- Public metadata/delivery: 10 passed.
- Rendered Pricing and Referrals at 320, 390, 768 and 1440 pixels, normal and enlarged-text test copies. All final scroll widths fit the viewport. Tablet navigation and narrow headline wrapping were corrected. Test-only enlarged copies are private and not deployed.
- Source/package checks exclude credentials, payment exports and private evidence. No real account deleted; no financial/ledger/provider mutation or production deployment.

Staging Hosting: sites/scaledcircle-staging/versions/93d2f6eaa4629430

## Exact prepared production operations — HOLD

1. Prepare dedicated functions-account-closure from functions/scripts/prepare_account_closure.js; install the locked dependencies. Set non-secret APP_ENV=production for project scaled-circle. No secret binding is required.
2. Function selectors using firebase.account-closure.json: functions:account-closure:accountClosureV1,functions:account-closure:finishAccountClosureV1. The finisher has retry=true and is idempotent. Review and capture existing production baseline again before deployment.
3. Separate Rules operation: firestore:rules,storage using the same config, after final production baseline reconciliation. Never copy firestore.staging.rules or storage.staging.rules into production.
4. Build the accepted client with APP_ENV=production, apply maintained marketing delivery, then separately deploy only the reviewed production Hosting target. No native build or production Hosting release was performed here.
5. Read-only production authority/availability checks; do not delete a real customer for certification.

Founder acceptance required only for the final Pricing and Referral presentation before coordinated promotion resumes. The existing broader production promotion manifest still needs its full selected-function reconciliation; this narrow package does not claim that wider promotion is complete.
