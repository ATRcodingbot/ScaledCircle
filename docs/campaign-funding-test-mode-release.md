# Campaign funding TEST-mode boundary

This candidate is intentionally not deployable with existing generic or live Stripe
credentials. Campaign Checkout uses only `STRIPE_TEST_SECRET_KEY` (`sk_test_...`) and
`STRIPE_TEST_WEBHOOK_SECRET` from a Stripe TEST-mode snapshot webhook. The runtime
rejects a non-test API key before constructing a Stripe client and rejects every
webhook whose signed event has `livemode != false`.

The isolated `campaign-funding` codebase owns exactly:

- `quoteCampaignFunding` (no secret)
- `createCampaignFundingCheckoutSession` (`STRIPE_TEST_SECRET_KEY`)
- `publishFundedCampaign` (no secret)
- `stripeWebhook` (`STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`)

`stripeThinWebhook` is not used. Subscription billing, Connect/payouts, wallet
credits, affiliate accounting, and the legacy `fundCampaign` callable are outside
this boundary.

## Future approved sandbox deployment

1. Create a dedicated Firebase QA/staging project, or explicitly approve the
   temporary TEST-mode campaign-funding codebase in production Firebase while
   accepting that records are test financial data.
2. Bind new test-only secrets; never overwrite generic/live Stripe secrets.
3. Configure one Stripe TEST-mode snapshot webhook for the deployed
   `campaign-funding:stripeWebhook` endpoint. Subscribe only to:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `payment_intent.payment_failed`, `charge.refunded`, `refund.updated`, and
   `charge.dispute.created|updated|closed`.
4. Deploy only the four campaign-funding exports and Hosting after a targeted
   discovery confirms the two test secret bindings.
5. Use Stripe Checkout's official TEST payment methods. Never store card data.

The Checkout success redirect shows processing only. A signed, reconciled webhook
is the sole authority that marks the payment paid/funded. Publishing independently
revalidates the paid record and at least one mapped campaign Zone.
