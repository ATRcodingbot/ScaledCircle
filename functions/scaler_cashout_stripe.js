"use strict";
const {assertTestRuntime, eligibility} = require("./scaler_cashout");
const fail = (code) => { throw Object.assign(new Error(code), {code}); };

function verifyTransfer(resource, op) {
  if (!/^tr_[A-Za-z0-9]+$/.test(resource?.id || "") || resource.livemode !== false ||
      resource.destination !== op.accountId || resource.amount !== op.amountCents ||
      resource.currency !== op.currency || resource.metadata?.cashoutId !== op.id ||
      resource.metadata?.mode !== "test" || !Number.isSafeInteger(resource.amount_reversed) ||
      resource.amount_reversed < 0 || resource.amount_reversed > op.amountCents) fail("cashout_transfer_mismatch");
}
function verifyPayout(resource, op) {
  if (!/^po_[A-Za-z0-9]+$/.test(resource?.id || "") || resource.livemode !== false ||
      resource.amount !== op.amountCents || resource.currency !== op.currency ||
      resource.metadata?.cashoutId !== op.id || resource.metadata?.mode !== "test" ||
      resource.metadata?.attempt !== String(op.payoutAttempt) ||
      !["pending", "in_transit", "paid", "failed", "canceled"].includes(resource.status)) fail("cashout_payout_mismatch");
}

function createStripeProvider({stripe, runtime}) {
  const guard = () => assertTestRuntime(runtime());
  const options = (op) => ({stripeAccount: op.accountId});
  async function unique(list, predicate) {
    if (list.has_more) fail("cashout_reconciliation_incomplete");
    const found = list.data.filter(predicate);
    if (found.length > 1) fail("cashout_multiple_receipts");
    return found[0] || null;
  }
  async function getAccount(accountId) {
    guard();
    const account = await stripe.v2.core.accounts.retrieve(accountId,
      {include: ["configuration.recipient", "requirements"]});
    const balance = await stripe.balance.retrieve({}, {stripeAccount: accountId});
    const settings = await stripe.balanceSettings.retrieve({}, {stripeAccount: accountId});
    if (account.id !== accountId || account.livemode !== false || balance.livemode !== false) fail("cashout_account_mismatch");
    const capabilities = account.configuration?.recipient?.capabilities?.stripe_balance;
    return {id: account.id, livemode: false, accountApi: "accounts_v2",
      transfersStatus: capabilities?.stripe_transfers?.status,
      payoutsStatus: capabilities?.payouts?.status,
      requirementsIncluded: account.requirements != null,
      deadlineStatus: account.requirements?.summary?.minimum_deadline?.status,
      payoutSchedule: settings.payments?.payouts?.schedule?.interval};
  }
  return {
    getAccount, verifyTransfer, verifyPayout,
    async findTransfer(op) {
      guard();
      if (op.transferId) return stripe.transfers.retrieve(op.transferId);
      return unique(await stripe.transfers.list({transfer_group: op.id, limit: 100}),
        (item) => item.metadata?.cashoutId === op.id);
    },
    async createTransfer(op) {
      guard();
      if (!eligibility(await getAccount(op.accountId), op.accountId).ready) fail("cashout_not_ready");
      try {
        return await stripe.transfers.create({amount: op.amountCents, currency: op.currency,
          destination: op.accountId, transfer_group: op.id,
          metadata: {cashoutId: op.id, mode: "test"}}, {idempotencyKey: `${op.id}:transfer`});
      } catch (error) {
        if (error.type === "StripeInvalidRequestError" && error.code === "balance_insufficient") {
          throw Object.assign(new Error("cashout_transfer_declined"), {definitive: true});
        }
        throw new Error("cashout_transfer_unconfirmed");
      }
    },
    async findPayout(op) {
      guard();
      if (op.payoutId) return stripe.payouts.retrieve(op.payoutId, options(op));
      return unique(await stripe.payouts.list({limit: 100,
        created: {gte: Math.floor(op.createdAt / 1000) - 60}}, options(op)),
      (item) => item.metadata?.cashoutId === op.id && item.metadata?.attempt === String(op.payoutAttempt));
    },
    async createPayout(op) {
      guard();
      if (!eligibility(await getAccount(op.accountId), op.accountId).ready) fail("cashout_not_ready");
      return stripe.payouts.create({amount: op.amountCents, currency: op.currency,
        method: "standard", metadata: {cashoutId: op.id, mode: "test", attempt: String(op.payoutAttempt)}},
      {...options(op), idempotencyKey: `${op.id}:payout:${op.payoutAttempt}`});
    },
  };
}

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
