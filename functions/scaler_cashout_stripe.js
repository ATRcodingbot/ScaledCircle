"use strict";
const {assertTestRuntime, eligibility} = require("./scaler_cashout");
const shared = require("./scaler_cashout_provider");
const fail = code => { throw Object.assign(new Error(code), {code}); };
const verifyTransfer = (r,op) => shared.verifyTransfer(r,op,"test");
const verifyPayout = (r,op) => shared.verifyPayout(r,op,"test");
const createStripeProvider = options => shared.createStripeProvider({...options, mode:"test", assertRuntime:assertTestRuntime, eligibility});
function verifyWebhookEvent({stripe, runtime, secret, rawBody, signature, endpointScope}) {
  // Authentication remains available while execution is paused. Preserve every
  // environment/key guard; only the financial execution flag is irrelevant here.
  assertTestRuntime({...runtime(), enabled: true});
  if (!/^whsec_[A-Za-z0-9]+$/.test(secret || "")) fail("cashout_webhook_not_configured");
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  if (event.livemode !== false) fail("cashout_webhook_mode_mismatch");
  if ((endpointScope === "platform" && event.account) ||
      (endpointScope === "connected" && !event.account)) fail("cashout_webhook_scope_mismatch");
  return event;
}

async function handleWebhook({stripe, store, service, runtime, secret, rawBody, signature, endpointScope}) {
  const event = verifyWebhookEvent({stripe, runtime, secret, rawBody, signature, endpointScope});
  assertTestRuntime(runtime());
  if (!["transfer.created", "transfer.reversed", "payout.created", "payout.updated",
    "payout.paid", "payout.failed", "payout.canceled"].includes(event.type)) return {ignored: true};
  const key = event.data?.object?.metadata?.cashoutId;
  if (!/^cashout_[a-f0-9]{64}$/.test(key || "")) return {ignored: true};
  const op = await store.lookup(key);
  if (runtime().scalerUid && op.ownerId !== runtime().scalerUid) fail("cashout_webhook_owner_mismatch");
  if (op.mode !== "test" || op.kind !== "scaler_cashout_v1" ||
      (event.type.startsWith("payout.") && event.account !== op.accountId) ||
      (event.type.startsWith("transfer.") && event.account)) fail("cashout_webhook_account_mismatch");
  return store.event(event.id, () => service.run(key, op.ownerId, {readOnly: true}));
}

module.exports = {createStripeProvider, handleWebhook, verifyWebhookEvent, verifyTransfer, verifyPayout};
