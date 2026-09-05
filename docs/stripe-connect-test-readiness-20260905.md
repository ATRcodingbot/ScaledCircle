# Stripe Connect TEST readiness

Status: offline hardening DONE; supervised procedure prepared; complete cash-out
certification BLOCKED by the missing maintained Wallet-to-Connect cash-out bridge.
No Stripe API call, account, payout, secret change or deployment in this pass.

## Source evidence and repairs

`functions/index.js` owns the legacy Connect callables. Account creation and
onboarding require authenticated Scaler role; account records use UID document
paths. Added explicit stored owner/mode/account-ID checks before reuse, recovery,
retrieval and onboarding. Missing historical binding metadata now fails closed;
verify metadata through a reviewed migration before rollout, never infer ownership.
Nonproduction accepts only test-secret prefixes; production only live prefixes.
Malformed/publishable credentials fail before SDK construction. These guards do
not validate a secret with Stripe. No secret was read. Staging onboarding return
origin now stays on `https://scaledcircle-staging.web.app` instead of production.

`marketplace_operations.js` coordinates durable input-digest claims and recovery;
the memory store incorrectly reclaimed terminal failures. Fixed and tested so a
second request cannot execute again. Existing tests cover concurrent claims,
allocation bounds, reversals, duplicate webhook delivery, signature verification,
thin/snapshot separation and out-of-order current-resource reconciliation.

The backend fixture suite lacked an emulator guard and timed out when initially
invoked without an emulator. It now refuses execution before SDK initialization
unless localhost Firestore and demo project are selected. That suite did not pass
in this session. Offline suites pass; no provider or deployed-system proof implied.
Generated ignored codebases must be regenerated and packaging checked for a future
narrow deployment; none were deployed here.

## Remaining integration decisions

| Concern | Evidence / required next implementation |
| --- | --- |
| KYC / onboarding | v2 recipient capability and sanitized requirement projection exist. Returning from onboarding is not proof of eligibility; retrieve current account and check transfer AND payout capabilities, outstanding requirements and mode. Validate actual v2 requirement shape in supervised TEST. |
| Cash-out | Existing queue/transfer executor uses legacy assignment compensation. Do not connect it directly to certified exact-location earnings without an explicit immutable earning-to-reservation mapping. Wallet screen currently has no maintained cash-out action. |
| Wallet authority | Preserve certified earning source. Available = settled eligible funds minus atomic reservations, holds and prior withdrawals; pending is not spendable. `wallet_service.subtractCredits` has no callsites and is not a payout implementation. Do not activate it. |
| Double spend | Add server cash-out command: authenticated UID, integer minor units, currency, bounded available balance, atomic reservation, immutable operation ID/input digest. Two concurrent cash-outs must not overreserve. |
| Transfer vs payout | Platform-to-connected-account transfer and connected-account-to-bank payout are separate receipts. Never label transfer success a bank deposit. Failure of bank payout must not create another platform transfer. |
| Retry / ambiguity | Durable reconciliation is mandatory before retry. Freeze unresolved operations beyond provider idempotency retention; do not generate new IDs automatically. |
| Reversal / dispute | Link original charge, earning, reservation, transfer and reversal; bounded compensating entries, no destructive ledger edits. Freeze affected settlement during disputes. |
| Raw payment data | Use Stripe-hosted onboarding for bank/eligible debit details; store only provider IDs, status and safe display metadata. Do not log onboarding links, financial details or secrets. |
| UI | Wallet: Set up payouts / Continue setup / Payouts need attention / Available / Pending / Cash out / Processing / Paid / Failed. No claim of instant eligibility until provider confirms. |

## Exact supervised TEST sequence (not executed)

1. First implement and offline-test the cash-out bridge above. Select an isolated
   TEST deployment/project; check runtime environment, test-only secret binding
   metadata and TEST webhook destinations. Production is excluded. Do not reuse
   production account IDs, earnings or funds. Fail on any live-mode resource.
2. Record source SHA, fixture UID, project, run ID, amount/currency and zero baseline.
   Sign in as that Scaler. A different UID must fail ownership checks before Stripe.
3. Use Set up payouts once; record one TEST account ID. Repeated request recovers
   it. Complete hosted TEST onboarding with Stripe's documented test data only.
   Expired link requests a fresh link; return triggers status refresh, not success.
4. Verify requirements, transfer/payout capability and test mode. Test incomplete
   onboarding and disabled payouts deny cash-out without a reservation leak.
5. Seed only emulator/isolated TEST authoritative fixtures. Cash out a fixed amount;
   replay the same operation and concurrently request an overdraw. Exactly one
   permitted reservation and provider operation must result.
6. Deliver valid, duplicate, invalid-signature and out-of-order TEST webhooks.
   Record claim receipts and ledger deltas. Invalid signatures cause zero writes.
7. Simulate transfer failure, lost response, bank payout failure, retry, partial
   reversal and replay. Reconcile original IDs before any permitted retry.
   Assert reserved + available + paid/held amounts reconcile to the same earnings.
8. Record TEST transfer and payout statuses separately. TEST settlement is simulated,
   not a real bank deposit. Preserve receipts without bank/debit payloads.

Offline command: `node --test functions/stripe_environment_guard.test.js functions/marketplace_operations.test.js functions/marketplace_finance.test.js functions/marketplace_webhook.test.js functions/marketplace_checkout.test.js`.

Boundary: **READY FOR FOUNDER — STRIPE CONNECT TEST CERTIFICATION** procedure;
execution stays blocked until cash-out implementation and its offline tests exist.

Stripe references: [separate charges/transfers](https://docs.stripe.com/connect/separate-charges-and-transfers),
[idempotency retention](https://docs.stripe.com/api/idempotent_requests),
[raw-body signatures and event handling](https://docs.stripe.com/webhooks).
These support the distinction between transfers and bank payouts, finite provider
idempotency retention, and authenticated replay-safe webhook processing.
