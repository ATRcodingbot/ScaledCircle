# Business Stripe payment model audit

## Canonical separation

- Businesses pay dollar-denominated campaign charges and subscriptions through
  Stripe. Campaign payment authority remains the server quote, Checkout, and
  signed webhook lifecycle.
- Scalers retain wallets for pending/available earnings, settlement history,
  and later payout or withdrawal workflows.
- Historical Business wallet and credit records are preserved for accounting,
  reconciliation, and old-campaign compatibility. They are not an authority for
  new campaign funding.

## Classified maintained-source inventory

### A — retired Business payment model

- `business_dashboard.dart` previously initialized a Business wallet, displayed
  Available/Reserved/Paid Out credit cards, linked to a Business Wallet, and
  stated that one credit equaled one dollar. The dashboard now provides a
  non-interactive Campaign Payments explanation and directs funding through each
  campaign's authoritative Stripe flow.
- `business_wallet_screen.dart` provided the active Add Campaign Credits UI. It
  and the unused older `business_dashboard_screen.dart` were removed.
- `PlatformBillingService.purchaseCredits` was the maintained client caller of
  `createCreditCheckoutSession`. It was removed.
- `create_campaign_screen.dart` described the campaign review in credits. It now
  states that the final amount is paid securely through Stripe.
- The password-recovery security summary now says payments rather than credits.

### B — Scaler wallet and earnings (preserved)

- `scaler_wallet_screen.dart`, `scaler_dashboard_screen.dart`, and `wallet.dart`
  remain the Scaler wallet/earnings presentation and model.
- `campaign_zones_screen.dart` retains the truthful Scaler-wallet destination
  copy for verified worker earnings.
- Scaler payout, pending/available earnings, settlement, and withdrawal
  architecture were not changed.

### C — internal, compatibility, migration, and audit data (preserved)

- The `wallets/{businessId}` subscription fields remain a compatibility
  projection used by current subscription entitlement reads. Subscription
  checkout itself remains Stripe and dollar based.
- `availableCredits`, `reservedCredits`, `totalPaidOut`, and wallet transaction
  records remain in backend/client compatibility services for historical
  campaigns and the existing worker-settlement implementation. They are no
  longer displayed or purchasable by Businesses.
- `completion_payout_service.dart`, `wallet_service.dart`,
  `wallet_transaction_service.dart`, and the campaign completion reconciliation
  in `campaign_details_screen.dart` still reference Business reserve fields.
  Removing those fields requires a separately reviewed worker-settlement
  migration; this cleanup does not alter that authority.
- `ensureLegacyWalletProjection` remains an isolated, secret-free compatibility
  callable. It does not create purchased value for new campaign funding.

### D — retired/dead authority

- `fundCampaign` remains in historical canonical source and deployed production
  inventory, but generated deployable codebases exclude it and maintained Dart
  source has no callable reference to it.
- `createCreditCheckoutSession` is a controlled retired backend stub. Completed
  historical credit Checkout events are ignored rather than credited.
- Targeted production deletion of `fundCampaign` remains a separate operation
  after post-release monitoring and explicit approval.

### E — tests and documentation

- Wallet projection, internal-beta entitlement, codebase architecture, and
  campaign-funding hardening tests intentionally name historical credit fields
  or assert that new funding cannot use them.
- Test-only Stripe keys and webhook secrets are fixtures, not credentials.

## Product/payment classification

| Product or cost | Current authority | Classification | Follow-up |
| --- | --- | --- | --- |
| Scaler campaign funding | Stripe Checkout + signed webhook | Stripe direct charge; 20% fee on authoritative worker compensation | Proven; unchanged |
| Campaign refund | Stripe Refund API + signed webhook | Currency refund to original payment method | Proven; unchanged |
| Business subscriptions | Stripe subscription Checkout/portal | Dollar subscription | Existing plans preserved |
| Social advertising spend | Planning copy only; no charge implementation found | Pass-through ad spend; 0% percentage markup | Add an authoritative vendor/ad-spend billing contract before charging |
| Managed Growth service | Dollar subscription | Separate software/service fee | Existing entitlement and pricing preserved |
| Postcards/direct mail | `calculateDirectMailEstimate` only | Printing, postage, and fulfillment/vendor costs separated; 20% management fee | No payment/Checkout implementation exists; implement separately |
| Campaign materials/printing | Operational fulfillment fields only | Vendor/pass-through cost, not yet billed here | Requires authoritative quote and payment implementation |
| Postage/list/address services | Planning model only | Vendor/pass-through cost | Requires authoritative quote and payment implementation |
| Other vendor work | No general payment engine found | Not implemented | Do not infer pricing |

## Policy guards

- Social ad spend passes through at actual cost with no percentage markup. A
  subscription or service fee must remain a separate line item.
- Direct-mail estimates keep printing, postage, and fulfillment/vendor costs
  separate and apply the reviewed 20% management fee to the applicable service
  basis. There is no direct-mail payment implementation yet.
- Historical payment, wallet, campaignPayment, refund, and Stripe event records
  must not be deleted by this retirement.

## Cancel/refund production promotion lineage

Staging proof is complete for zero-assignment refund, applicant-only refund,
assigned-Scaler rejection, signed refund reconciliation, replay, and archive.
The production release candidate must include the staging-proven lineage rooted
at `d64bb0657682733038f7e1c2b01f47ec6b0330cd`, plus the reviewed discovery-core
Zone-analysis correction and this client cleanup.

Future targeted production Functions:

- `assignment-core:assignScalerToZone`
- `assignment-core:configureZoneGroupAssignment`
- `assignment-core:acceptZoneGroupSlot`
- `discovery-core:saveDiscoveryPreferences`
- `discovery-core:analyzeCampaignZone`
- `campaign-funding:cancelUnassignedFundedCampaign`
- `campaign-funding:archiveCanceledCampaign`
- `campaign-funding:stripeWebhook`

Hosting must include the cancel/refund/archive UI, Zone-analysis retry/correction,
and Business Stripe-first copy. Firestore and Storage Rules are unchanged. The
production codebase migration for the existing `saveDiscoveryPreferences`
resource requires its separately reviewed ownership transition from
`platform-core` to `discovery-core`.
