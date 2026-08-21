# Campaign funding LIVE migration runbook

This runbook is preparation only. Never store Stripe credentials in source or
Flutter. Staging remains on `scaledcircle-staging` with Stripe TEST mode.

## Secure configuration

1. In Stripe LIVE mode, the account owner retrieves the restricted production
   secret key and enters it directly into Firebase Secret Manager as
   `STRIPE_LIVE_SECRET_KEY`. Do not paste it into chat or a shell transcript.
2. Deploy the four `campaign-funding` exports to `scaled-circle` only after the
   secret exists. Checkout binds only `STRIPE_LIVE_SECRET_KEY`; quote and publish
   bind no Stripe secrets.
3. Resolve the deployed Gen 2 `stripeWebhook` URL, then create one Stripe LIVE
   snapshot webhook for only:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `payment_intent.payment_failed`, `charge.refunded`, `refund.updated`,
   `charge.dispute.created`, `charge.dispute.updated`, and
   `charge.dispute.closed`.
4. Enter that endpoint's signing secret directly into Firebase Secret Manager
   as `STRIPE_LIVE_WEBHOOK_SECRET`, then deploy `stripeWebhook`. It binds the
   LIVE API and webhook secrets only.

## Release order

1. Record current Hosting version and all four current Function revisions.
2. Deploy exactly `campaign-funding:quoteCampaignFunding`,
   `campaign-funding:createCampaignFundingCheckoutSession`,
   `campaign-funding:publishFundedCampaign`, and
   `campaign-funding:stripeWebhook`.
3. Confirm Node.js 24, `us-east1`, ACTIVE state, codebase, environment, and
   minimum secret bindings.
4. Deploy the certified production Hosting build; deploy no Rules.
5. Use the approved Business QA account to create the smallest operationally
   valid campaign. Stop at the hosted Checkout URL with
   `LIVE STRIPE CHECKOUT READY — USER APPROVAL REQUIRED`.
6. After explicit approval, the user completes the charge manually. Verify the
   signed LIVE event, one payment, funded state, Zone revalidation, publish,
   and zero payout/wallet/affiliate side effects.
7. Monitor Checkout, webhook, idempotency, payment, funding, publish, refund,
   and dispute logs without logging secrets or payment-method data.
8. Keep legacy `fundCampaign` deployed until its recent production traffic has
   aged out and a separately approved log audit confirms no caller. Delete it
   only by exact Function target, never by bulk default deployment.

## Rollback

- If Checkout creation fails before payment, restore the prior Hosting version
  and prior campaign-funding Function revisions or disable the funding CTA.
- If webhook processing fails after payment, keep the new payment records and
  Stripe history immutable, disable new Checkout creation, and reconcile the
  affected event before any publish.
- If funding state diverges, freeze the campaign in review-required state. Do
  not mark it paid/open from the client and do not erase Stripe events.
- If Hosting regresses, roll Hosting back independently; keep healthy backend
  payment authority in place.
- Never reopen refunded/disputed campaigns automatically during rollback.
