# ScaledCircle Stripe marketplace

Status: sandbox/staging implementation only. Nothing in this document authorizes a production deployment or live-mode transaction.

## Architecture and trust boundary

ScaledCircle uses Stripe Connect **separate charges and transfers**. A Business pays a platform-owned Checkout charge. A successful, reconciled webhook funds the campaign. Only later, after ScaledCircle's server-authoritative assignment, tracking, completion, verification, and review checks pass, may the backend transfer approved Scaler earnings to that Scaler's connected account. This is not described as escrow.

Stripe does not determine whether field work was completed. Flutter is an untrusted display and command client. It cannot set authoritative prices, funding, refunds, earnings, transfers, Stripe IDs, settlement, or platform revenue.

New Scaler accounts use Stripe Accounts v2 with the `recipient` configuration and Stripe-hosted onboarding. Stripe collects identity and bank/payout details. ScaledCircle stores only the account ID and sanitized onboarding, requirement, transfer, and payout status. Onboarding links open in the system browser; returning from the link is not proof of completion, so the backend retrieves current Stripe state.

## Pricing

`functions/marketplace_finance.js` owns `PLATFORM_FEE_BASIS_POINTS = 2000` (20%). All ledger amounts are integer USD cents. The fee uses safe integer basis-point arithmetic with half-up rounding:

`platformFeeCents = floor((workerAmountCents * 2000 + 5000) / 10000)`

The fee is added on top of worker compensation. A $100 worker allocation therefore produces a $20 **ScaledCircle Platform Fee** and a $120 Business charge. It is not represented as a tax or card-processing surcharge. Any future legally required tax is a separate product and accounting concern.

Cash received is distinct from recognized platform revenue. Payments track pending, recognized, and refunded platform-fee amounts so cancellation, refunds, processing costs, disputes, chargebacks, reserves, and operating expenses remain visible. Internal estimates are not collected taxes.

## Authoritative records

- `stripeCustomers/{businessId}`: server-owned Stripe customer mapping.
- `stripeConnectedAccounts/{scalerId}`: sanitized Accounts v2 status.
- `campaignPayments/{paymentId}`: immutable quote plus current funding/refund/dispute allocation.
- `assignmentCompensations/{zoneId}`: immutable assigned base/bonus/counteroffer contract.
- `scalerTransfers/{operationId}`: Connect transfer operation and state.
- `financialOperations/{operationId}`: durable refund/dispute/recovery claims.
- `stripeEvents/{eventId}`: durable webhook processing state.

These collections are server-write-only under Firestore rules. Owners receive only the read access needed by their role; unrelated users receive none. Historical wallet and credit data is retained for compatibility but is not authoritative money. Promotional/test credits are non-cash, non-transferable, non-withdrawable, and cannot fund Scaler pay. Historical UI records labelled paid are not Stripe transfers.

## Funding state machine

`draft -> payment_pending -> funded -> available -> assigned -> in_progress -> verification_pending -> transfer_pending -> transferred_to_connected_account`

Failure and review paths include `payment_failed`, `cancelled`, `refund_pending`, `refunded`, `disputed`, `redo_required`, `transfer_failed`, and `transfer_reversed`. Existing campaign workflow state remains separate from the authoritative `campaignPayments` and `scalerTransfers` records. A campaign cannot publish until Checkout is confirmed by a signed webhook and the payment record matches the Business, campaign, Customer, currency, and exact backend-calculated amount.

## Earnings and review

Assignment creates an immutable compensation snapshot. Backend settlement is:

- under 10% completion: no base earnings;
- 10% through 94.99%: proportional base earnings;
- 95% or more: full agreed base plus automatic bonus;
- below 95%: the Business may explicitly release the optional bonus.

The Business has 48 hours to approve, dispute, or request one redo. A trusted scheduled reconciler may finalize verified, undisputed work after that deadline. A Connect transfer requires funded and undisputed allocation, final review, no unresolved redo, completed tracking and route evidence where required, a matching compensation contract, a matching payout-capable connected account, sufficient allocation, and no prior successful earnings-version transfer.

The 48-hour reconciler calls the same deterministic transfer-queue operation used by explicit Business approval. It does not contain a second payout algorithm. If the connected account is not ready, the earned amount remains reserved in `waiting_for_account`; an Accounts v2 status refresh moves it back to `transfer_pending` when eligible. Temporary Stripe/platform-balance failures retain the same retryable operation and idempotency identity.

`transferred_to_connected_account` means platform Stripe balance to connected-account balance. It does not mean Stripe has paid the external bank. Bank payout state remains separate.

## Allocation, cancellation, refunds, and disputes

One campaign payment can fund multiple zones and transfers. Transactional counters prevent worker transfers plus worker refunds from exceeding `workerAmountCents`; platform-fee refunds are tracked separately.

Before authoritative Start Job, cancellation or expiry without work is eligible for a full unused worker allocation and associated platform-fee refund. After work starts, Flutter cannot calculate or issue a refund; trusted review determines payable work and refundable allocations. Refunds have durable operation IDs and Stripe idempotency keys. A refund does not automatically reverse a prior Connect transfer.

A dispute freezes unresolved settlement, links the Stripe dispute to the campaign payment, and preserves GPS/checkpoint/completion evidence. Already-transferred funds create an admin-reviewed recovery case; the system does not silently create a negative Scaler balance.

## Idempotency and webhooks

Customer, connected-account, Checkout, refund, transfer, reversal, and event operations use deterministic Firestore operation IDs plus Stripe idempotency keys. Stripe timeouts are reconciled rather than retried with a new identity.

`exports.stripeWebhook` in `functions/index.js` is the canonical snapshot/v1 webhook and verifies raw-body signatures only with `STRIPE_WEBHOOK_SECRET`. `exports.stripeThinWebhook` is the narrowly scoped Accounts v2 thin-event endpoint and verifies only with the separate `STRIPE_THIN_WEBHOOK_SECRET`. They share durable replay claiming and current-resource reconciliation, not signature secrets or duplicated financial business logic. `stripeEvents` records move through received/processing/processed/failure states, making duplicate delivery harmless. Redirect URLs never confirm payment. Handlers reconcile current Stripe objects when ordering matters and reject amount, currency, Customer, Business, or campaign mismatches.

Accounts v2 uses thin events. The canonical endpoint supports exactly `v2.core.account[requirements].updated` and `v2.core.account[configuration.recipient].capability_status_updated` for recipient status. Their event payload is only a notification: the handler retrieves the current Accounts v2 resource with recipient/identity/requirements includes, then stores sanitized current status.

Implemented/reconciled event families cover campaign Checkout success and async failure, PaymentIntent failure, refunds, disputes, subscriptions/invoices, connected-account status, and transfer visibility. `transfers.create` returning a Transfer is authoritative for Connect-transfer creation. `transfer.created` is audit/reconciliation visibility, `transfer.reversed` retrieves the current Transfer to reconcile reversals, and `transfer.updated` is deliberately not treated as settlement. `payout.failed` means the connected account later failed to pay its external bank/debit destination; it marks payout attention and refreshes account state without erasing earnings or creating another Connect transfer.

The final funding UI consumes the backend quote (`workerAmountCents`, `platformFeeRateBasisPoints`, `platformFeeCents`, `businessChargeCents`, `currency`, and quote/funding version). Flutter does not calculate the 20% policy.

Before staging, validate actual delivery with Stripe CLI and sandbox only: configure the sandbox event destination for the exact supported events, verify thin Accounts v2 event delivery/API-version behavior, replay duplicates and out-of-order events, and inspect retrieved current resources. No live-mode endpoint or object is part of this phase.

## Environments and secrets

- Local: Firebase emulators, Stripe sandbox key in Firebase Functions secret handling, Stripe CLI forwarding to the local webhook.
- Staging: separate Firebase project and data, Stripe sandbox, staging-only webhook secret/products/prices.
- Production: separate Firebase project and live secrets only after explicit approval.

There is no staging-to-production fallback. Secret and webhook-signing keys remain server-side; Flutter contains no Stripe secret. No sandbox or live object should be created without explicit approval.

## Legal, tax, and policy review

Stripe-hosted onboarding can collect KYC and payout information, but Scaled Circle LLC still needs qualified legal, tax, accounting, insurance, marketplace terms, independent-contractor, refund, dispute, abandoned-funds, information-reporting, and state tax advice. Stripe does not eliminate the platform's possible reporting obligations. Actual tax collection and Stripe Tax are intentionally outside this implementation.

## Manual sandbox checklist

1. Create/select the isolated Firebase staging project and Stripe sandbox.
2. Configure staging-only Stripe secret, webhook secret, subscription Price IDs, return URLs, and allowed domains.
3. Start Firebase emulators and forward Stripe CLI sandbox events to the local webhook.
4. Create separate test Business and Scaler users in staging only.
5. Confirm the backend quote is 20% on top and client amount fields are ignored.
6. Complete hosted onboarding in the system browser and refresh backend status.
7. Fund a test campaign with a Stripe test payment method; verify only the webhook marks it funded.
8. Exercise assignment, immutable compensation, tracking, completion, 48-hour/manual review, transfer eligibility, and Connect transfer.
9. Test duplicate calls/events, async failure, cancellation before/after start, partial completion, redo, refund, dispute, transfer failure, and reconciliation.
10. Verify staging credentials and Firebase configuration cannot access production data.
