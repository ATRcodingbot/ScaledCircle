"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const Stripe = require("stripe");
const core = require("./scaler_cashout");
const adapter = require("./scaler_cashout_stripe");
const {runtime, account, mockStripe} = require("./test_fixtures/cashout");

test("TEST runtime refuses live keys, unknown modes, production projects and disabled enablement", () => {
  core.assertTestRuntime(runtime());
  for (const patch of [{secretKey: "sk_live_offlinefixture"}, {secretKey: "pk_test_fixture"},
    {enabled: false}, {environment: "production", projectId: "scaled-circle"},
    {environment: "staging", projectId: "scaled-circle"}, {environment: "typo"}, {projectId: undefined}]) {
    assert.throws(() => core.assertTestRuntime({...runtime(), ...patch}));
  }
});
test("onboarding requires transfer capability, submitted details, manual schedule and payout eligibility", () => {
  assert.equal(core.eligibility(account(), "acct_fixture").ready, true);
  for (const patch of [{payouts_enabled: false}, {details_submitted: false}, {capabilities: {}},
    {requirements: {currently_due: ["field"]}}, {settings: {payouts: {schedule: {interval: "daily"}}}}]) {
    assert.equal(core.eligibility({...account(), ...patch}, "acct_fixture").ready, false);
  }
  assert.throws(() => core.eligibility({...account(), livemode: true}, "acct_fixture"));
  assert.throws(() => core.eligibility(account(), "acct_other"));
  assert.throws(() => core.assertAccount({scalerId: "other", mode: "test", stripeAccountId: "acct_fixture"}, "owner"));
  assert.throws(() => core.assertAccount({scalerId: "owner", mode: "live", stripeAccountId: "acct_fixture"}, "owner"));
});
test("adapter pins account destination and stable stage idempotency; never accepts raw bank details", async () => {
  const mock = mockStripe(); const provider = adapter.createStripeProvider({stripe: mock.stripe, runtime});
  const op = {id: "cashout_fixture", accountId: "acct_fixture", amountCents: 500, currency: "usd", payoutAttempt: 1};
  const first = await provider.createTransfer(op); const second = await provider.createTransfer(op);
  assert.equal(first.id, second.id);
  await provider.createPayout(op);
  assert.equal(mock.transfers.size, 1); assert.equal(mock.payouts.size, 1);
  assert.equal(mock.calls[0].data.destination, "acct_fixture");
  const payoutCall = mock.calls.find((x) => x.type === "payout");
  assert.equal(payoutCall.options.stripeAccount, "acct_fixture");
  assert.equal(payoutCall.data.destination, undefined);
  assert.equal(payoutCall.data.bank_account, undefined);
  assert.throws(() => adapter.verifyTransfer({...first, livemode: true}, op));
  assert.throws(() => adapter.verifyTransfer({...first, destination: "acct_other"}, op));
});
test("signature and event mode/account verification precede webhook processing", async () => {
  const stripe = new Stripe("sk_test_offlinefixture");
  const secret = "whsec_offlinefixture";
  const key = `cashout_${"a".repeat(64)}`;
  let processed = 0;
  const store = {lookup: async () => ({kind: "scaler_cashout_v1", mode: "test", accountId: "acct_fixture", ownerId: "owner"}),
    event: async (_, work) => {processed++; return work();}};
  const service = {run: async (_, __, options) => {assert.equal(options.readOnly, true); return {};}};
  const base = {id: "evt_fixture", type: "payout.paid", livemode: false, account: "acct_fixture",
    data: {object: {metadata: {cashoutId: key}}}};
  async function send(event, invalidSignature = false, endpointScope = "connected", scalerUid = "owner") {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({payload, secret});
    return adapter.handleWebhook({stripe, store, service, runtime: () => ({...runtime(), scalerUid}), secret,
      rawBody: Buffer.from(payload), endpointScope, signature: invalidSignature ? "invalid" : signature});
  }
  await assert.rejects(send(base, true));
  await assert.rejects(send(base, false, "platform"));
  await assert.rejects(send({...base, livemode: true}));
  await assert.rejects(send({...base, account: "acct_other"}));
  await assert.rejects(send(base, false, "connected", "other_scaler"));
  assert.equal(processed, 0);
  await send(base); assert.equal(processed, 1);
});
test("Business completion approval does not call the cash-out bridge or Stripe", () => {
  const source = fs.readFileSync(require.resolve("./index.js"), "utf8");
  const review = source.slice(source.indexOf("exports.finalizeZoneReview"), source.indexOf("exports.requestCampaignCancellationRefund"));
  assert.ok(review.length > 1000);
  assert.doesNotMatch(review, /cashoutServices|\.transfers\.create|\.payouts\.create|service\.request/);
  assert.match(review, /externalExecutionAuthorized: false/);
});

test("v1 account lacking livemode uses connected balance mode evidence and rejects LIVE balances", async () => {
  const mock = mockStripe(); delete mock.controls.account.livemode;
  const provider = adapter.createStripeProvider({stripe: mock.stripe, runtime});
  assert.equal((await provider.getAccount("acct_fixture")).livemode, false);
  mock.stripe.balance.retrieve = async () => ({livemode: true});
  await assert.rejects(provider.getAccount("acct_fixture"));
  assert.equal(mock.calls.length, 0);
});
