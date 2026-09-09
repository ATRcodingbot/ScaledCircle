# Business membership catalog

Monthly USD prices for one Business workspace. The owner counts toward its seat limit.

| Item | Monthly price | Total seats | Product entitlement |
| --- | ---: | ---: | --- |
| Starter | $99 | 1 | Starter |
| Growth | $299 | 3 | Growth |
| Scale | $499 | 5 | Scale |
| Managed Growth | $999 | 10 | Managed Growth |
| Business Assistant — Beta | +$399 | No additional seats | Business Assistant |
| Lead Generation Research — Beta | +$699 | No additional seats | Lead Generation Research |
| Growth Department | $2,000 | 10 | Managed Growth, Business Assistant, Lead Generation Research |

A subscription contains one base plan and zero, one, or two distinct add-ons, or the single Growth Department bundle. It never contains the bundle and its individual components. Managed Growth alone does not grant either paid add-on. Research access does not authorize outreach.

Managed Growth with Assistant is $1,398; with Research is $1,698; with both separately is $2,097. Growth Department saves $97 per month, or $1,164 over twelve monthly payments. Included agent capabilities remain Beta; the bundle does not assert greater autonomy or proven outcomes.

## Authority and switching

The server resolves configured Price IDs, retrieves the actual Stripe Price and Product, and validates environment, identity, currency, amount, recurrence, quantity, catalog kind, entitlements, and seats. A client selection cannot confer access. Signed subscription reconciliation projects the confirmed items and billing status into workspace entitlements. Workspace membership and Billing permission remain required.

Adding or removing add-ons and entering or leaving the bundle use a server-owned invoice preview and an expiring quote. Standard active memberships change at the next renewal with no immediate proration charge. Current paid access remains intact. Stripe subscription schedules replace the items of the existing subscription; they do not create a second subscription. Special discounted, taxed, paused, or pending-update terms fail closed for review rather than being silently discarded.

The existing immediate, previewed proration path remains available for base-only plan changes. It rejects bundles and subscriptions containing add-ons. A scheduled selection can be removed before cancellation or another change. Cancel Membership and Reactivate Membership keep their existing period-end and paid-access rules. Campaign funding, accepted Scaler contracts, Wallet balances, and billing history are not changed by these operations.

Seat reservations include the owner and pending invitations. Concurrent changes cannot reserve multiple schedules; selected active members retain valid seats. A future reservation clears only when provider reconciliation confirms the intended selection, or confirms release of the schedule. Ambiguous provider outcomes remain held for read-only reconciliation without blind retries. Each confirmed operation has one audit event.

## Release boundary

Catalog and source preparation do not activate production billing. The coordinated production handler/client promotion and existing webhook event additions require release approval. No customer subscription, invoice, charge, or campaign payment is needed to create or verify the catalog. Catalog certification combines real read-only Price/Product validation with injected-provider emulator tests; it does not represent a real paid subscription lifecycle test.

Stripe contract: [subscription schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules), [updating schedules](https://docs.stripe.com/api/subscription_schedules/update).
