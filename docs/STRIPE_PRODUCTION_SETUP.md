# Stripe production setup

The application code supports recurring business subscriptions, one-time
campaign-credit purchases, exact campaign-funding payments, Stripe's hosted
billing portal, and webhook-driven entitlement updates. Checkout success pages
do not grant money or access; only a verified Stripe webhook does.

## Starter first-month promotion

After the Stripe secrets and Starter price are configured and Functions are
deployed, an administrator can open **Choose Your Plan** and select
**Create Promo Code**. The idempotent server action creates or returns:

- Customer-facing code: `SCALEDFREE99`
- Discount: 100% off the first month only
- Eligible plan: Starter ($99/month) only
- Eligibility: first Stripe transaction for that customer
- Renewal: automatically renews at $99/month unless canceled
- Exclusions: campaign funding, credits, platform fees, and Scaler pay

The code can be archived later from Stripe's Coupons/Promotion Codes page.

## 1. Create the recurring prices

Create three monthly recurring prices in Stripe:

- Starter — $99/month
- Growth — $299/month
- Scale — $499/month

Copy each `price_...` identifier. Admin accounts receive the Scale entitlement
without a Stripe subscription and are still responsible for Scaler pay.

## 2. Store secrets in Firebase

Run these commands locally. Paste secret values only into the Firebase CLI
prompt, never into source control or chat.

```powershell
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_STARTER_PRICE_ID
firebase functions:secrets:set STRIPE_GROWTH_PRICE_ID
firebase functions:secrets:set STRIPE_SCALE_PRICE_ID
```

Deploy the functions once so Stripe has a reachable webhook URL:

```powershell
firebase deploy --only functions
```

## 3. Register the webhook

In Stripe Workbench, register this endpoint:

```text
https://us-east1-scaled-circle.cloudfunctions.net/stripeWebhook
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the webhook signing secret (`whsec_...`) into Firebase:

```powershell
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions
```

## 4. Production verification

1. Use Stripe test mode first.
2. Purchase each subscription and verify the wallet entitlement updates only
   after the webhook arrives.
3. Purchase campaign credits and verify a single idempotent ledger deposit.
4. Fund a campaign with its exact checkout amount and verify Scaler funds move
   to reserved credits.
5. Confirm an admin receives the comped Scale plan, pays no platform fee, and
   still funds the full worker budget.
6. Repeat with live-mode products, prices, key, and webhook secret before
   accepting production payments.
