# Internal subscription certification

`FounderSubscriptionCertificationV1` is a bounded, default-disabled extension
of `createSubscriptionCheckoutSession`, not a promotion API. Ordinary selection
and Checkout behavior is retained. No public promotion code is created.

Activation requires all of the following: production environment/project,
`INTERNAL_SUBSCRIPTION_CERTIFICATION_ENABLED=true`, `RELEASE_SOURCE_SHA`, and
`RELEASE_PACKAGE_SEAL`, plus a matching enabled server-only configuration at
`internalSubscriptionCertification/config`. Missing values fail closed. The
release source and package seal are runtime deployment bindings injected from
the signed promotion record after artifact sealing; they must not be invented
or used to create a circular package hash. Gate configuration remains disabled
in prepared packages. Ordinary subscription webhooks stay enabled independently.

The private configuration references one `activeIntentId` and binds the exact
Starter Price/account/source/package. Its document in
`internalSubscriptionCertificationIntents` binds version, purpose
`INTERNAL_LIVE_CERTIFICATION`, production owner UID, Business workspace, existing
Stripe Customer, account, Price, quantity one, Starter plan, USD 9,900-cent
subtotal, zero initial total, source/package, created/expiry milliseconds and
`unused` state. The owner must be the authenticated actor; delegated Billing
access is insufficient. No public source contains actual private identities or
intent/coupon values. There is no client-readable/writable intent model or
intent-provisioning callable. Provisioning requires a separately authorized
attended server operation and a reviewed exact record.

The window is at most two hours, with at least 35 minutes remaining to begin.
An enabled, verified owner must hold current Terms/Privacy consent, an owner-only
workspace and the exact Customer binding. Existing saved payment methods,
balances, outstanding invoice items/invoices, subscriptions and pending
Checkouts cause a hold instead of an unexpected charge.

The service certifies the normal LIVE Starter Price/Product. A transaction
reserves the intent and maintained wallet Checkout pointer before provider
creation. A deterministic opaque coupon ID, fresh attempt ID and stable
idempotency keys are persisted first. The coupon is 100% off, duration once,
max redemption one, with short expiry and the known Product. Because base plans
share a Product, the server independently rejects every non-Starter selection,
bundle, add-on and client-supplied discount/quantity.

Exactly one subscription Checkout uses that server-set discount,
`allow_promotion_codes=false`, `payment_method_collection=if_required`, and a
31-minute expiry. Provider readback must show one Starter item, $99 subtotal,
$99 discount and $0 total before a link is returned. Unknown outcomes retain
the reserved/held attempt. Repeated requests may retrieve a known Checkout,
but never issue another coupon/Checkout create. A signed Checkout event may
recover a lost response's ID after exact identity/amount validation. Unknown
coupon-only outcomes remain held for attended review; no replacement is made.

The maintained signed webhook retrieves provider objects before certification
reconciliation. The exact Subscription, Customer, Checkout, one-use exhausted
coupon and initial zero invoice are checked before entitlement projection.
Consumption disables the private configuration gate. Invoice receipts identify
zero collected revenue and `positiveAmountCollected=false`. No campaign or
Wallet balance field is changed. Billing cancel/reactivate remains the normal
server workflow. The terminal subscription event releases its own Checkout
reservation, never another request's reservation.

After the attended smoke, provider-confirmed `cancel_at_period_end=true` is
mandatory; a once-only coupon does not prevent next month's renewal. Optional
reactivation must be followed by verified re-cancellation. Coupon exhaustion,
disabled gate and consumed intent must be recorded. Do not test reuse through
another LIVE Checkout. Preserve all audit/economic evidence. A zero invoice is
not proof of positive collection or subsequent renewal.

Source preparation and local tests create no LIVE objects. Production
promotion, private intent provisioning, coupon/Checkout execution, payment and
webhook configuration are separately authorized actions.
