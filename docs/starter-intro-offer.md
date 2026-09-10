# Starter introductory offer

The normal subscription Checkout supports `starter_intro_1_dollar_v1`: the
existing $99/month Starter Price, a $98 first-invoice discount, and $1 due at
purchase. There is no $1 recurring Price or promotion code. Other plans,
bundles and add-ons are excluded. Public acquisition surfaces are unchanged.

`subscriptionOffers/starter_intro_1_dollar_v1` is server-only and disabled by
absence. Activation requires an exact Stripe account/Starter Price, an enabled
window of at most 30 days, a cap of at most 25 Businesses, and a rollout mode.
Pilot mode additionally requires an explicit Business-owner allowlist. Public
rollout requires a separate operational decision. No private identities belong
in source control. Turning the flag off prevents new requests; it does not
erase existing Checkout obligations or paid subscriptions.

Verified, approved Business owners need current legal consent, owner-only
workspace inventory, no membership or conflicting billing work, and clean
provider history. The ordinary maintained Customer helper binds the Customer.
Existing unmatched Customers cause a hold instead of another Customer create.
An immutable claim keyed to a normalized owner-email hash protects redemption
across account recreation; Gmail dot/plus aliases normalize to the same key.
Workspace/Customer/subscription history supplies additional checks. This does
not purport to identify a person who deliberately changes every identity.

A transaction reserves one cap slot and the workspace billing pointer before
provider creation. One Customer binding, one single-use coupon, and one
Checkout use durable server-owned identities. Uncertain provider outcomes
remain held. A retry can only read a known Checkout; it never issues another
create. Abandoned/held reservations are not automatically recycled.

Provider readback requires exactly $99 subtotal, $98 discount, $1 total, zero
tax/shipping, one Starter item, the bound Customer, and card collection. The
ordinary monthly billing cycle is retained. Stripe's invoice preview supplies
the expected renewal date; the final period is established when Checkout
completes. A future anchor is deliberately not used because it can defer the
initial payment. No preview is represented as an already-created subscription.

The authenticated pricing page shows the offer only after server eligibility.
It prepares and verifies Checkout before a separate button opens Stripe. No
payment is submitted by the client application. Signed webhook handling checks
the paid $1 initial invoice before consuming the claim and projecting Starter
entitlement. Existing invoice-ID receipt/notification deduplication records
actual $1 collections, not $99 revenue. Campaign balances are untouched.

Cancel-at-period-end remains the maintained Billing action. Introductory
discounts do not transfer through ordinary upgrade previews; special terms
require a separately verified upgrade preview and explicit customer approval.
After a terminal subscription event, only its own billing pointer is released;
the consumed introductory claim remains permanent.
