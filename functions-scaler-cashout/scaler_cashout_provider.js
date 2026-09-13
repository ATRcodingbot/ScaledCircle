"use strict";

const fail = code => {
  throw Object.assign(new Error(code), {
    code
  });
};
function verifyTransfer(resource, op, mode) {
  if (!["test", "live"].includes(mode)) fail("cashout_mode_required");
  if (!/^tr_[A-Za-z0-9]+$/.test(resource?.id || "") || resource.livemode !== (mode === "live") || resource.destination !== op.accountId || resource.amount !== op.amountCents || resource.currency !== op.currency || resource.metadata?.cashoutId !== op.id || resource.metadata?.mode !== mode || !Number.isSafeInteger(resource.amount_reversed) || resource.amount_reversed < 0 || resource.amount_reversed > op.amountCents) fail("cashout_transfer_mismatch");
}
function verifyPayout(resource, op, mode) {
  if (!["test", "live"].includes(mode)) fail("cashout_mode_required");
  if (!/^po_[A-Za-z0-9]+$/.test(resource?.id || "") || resource.livemode !== (mode === "live") || resource.amount !== op.amountCents || resource.currency !== op.currency || resource.metadata?.cashoutId !== op.id || resource.metadata?.mode !== mode || resource.metadata?.attempt !== String(op.payoutAttempt) || !["pending", "in_transit", "paid", "failed", "canceled"].includes(resource.status)) fail("cashout_payout_mismatch");
}
function createStripeProvider({
  stripe,
  runtime,
  assertRuntime,
  eligibility,
  mode
}) {
  if (!["test", "live"].includes(mode)) fail("cashout_mode_required");
  const guard = () => assertRuntime(runtime());
  const options = op => ({
    stripeAccount: op.accountId
  });
  async function unique(list, predicate) {
    if (list.has_more) fail("cashout_reconciliation_incomplete");
    const found = list.data.filter(predicate);
    if (found.length > 1) fail("cashout_multiple_receipts");
    return found[0] || null;
  }
  async function getAccount(accountId) {
    guard();
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include: ["configuration.recipient", "requirements"]
    });
    const balance = await stripe.balance.retrieve({}, {
      stripeAccount: accountId
    });
    const settings = await stripe.balanceSettings.retrieve({}, {
      stripeAccount: accountId
    });
    if (account.id !== accountId || account.livemode !== (mode === "live") || balance.livemode !== (mode === "live")) fail("cashout_account_mismatch");
    const capabilities = account.configuration?.recipient?.capabilities?.stripe_balance;
    return {
      id: account.id,
      livemode: account.livemode,
      scalerId: account.metadata?.scalerId,
      accountApi: "accounts_v2",
      transfersStatus: capabilities?.stripe_transfers?.status,
      payoutsStatus: capabilities?.payouts?.status,
      requirementsIncluded: account.requirements != null,
      deadlineStatus: account.requirements?.summary?.minimum_deadline?.status,
      payoutSchedule: settings.payments?.payouts?.schedule?.interval
    };
  }
  return {
    getAccount,
    avoidAmbiguousRetry: mode === "live",
    async transferAvailable(op) {
      guard();
      if (mode !== 'live') return true;
      const balance = await stripe.balance.retrieve();
      if (balance.livemode !== true || !Array.isArray(balance.available)) fail('cashout_balance_unconfirmed');
      const funds = balance.available.filter(x => x.currency === op.currency);
      if (funds.length !== 1 || !Number.isSafeInteger(funds[0].amount)) fail('cashout_balance_unconfirmed');
      return funds[0].amount >= op.amountCents;
    },
    verifyTransfer: (r, op) => verifyTransfer(r, op, mode),
    verifyPayout: (r, op) => verifyPayout(r, op, mode),
    async findTransfer(op) {
      guard();
      if (op.transferId) return stripe.transfers.retrieve(op.transferId);
      return unique(await stripe.transfers.list({
        transfer_group: op.id,
        limit: 100
      }), item => item.metadata?.cashoutId === op.id);
    },
    async createTransfer(op) {
      guard();
      const account = await getAccount(op.accountId);
      if (!eligibility(account, op.accountId).ready || mode === 'live' && account.scalerId !== op.ownerId) fail("cashout_not_ready");
      if (mode === 'live' && !(await this.transferAvailable(op))) return null;
      try {
        return await stripe.transfers.create({
          amount: op.amountCents,
          currency: op.currency,
          destination: op.accountId,
          transfer_group: op.id,
          metadata: {
            cashoutId: op.id,
            mode
          }
        }, {
          idempotencyKey: `${op.id}:transfer`
        });
      } catch (error) {
        if (error.type === "StripeInvalidRequestError" && error.code === "balance_insufficient") {
          if (mode === 'live') return null;
          throw Object.assign(new Error("cashout_transfer_declined"), {
            definitive: true
          });
        }
        // Only an authenticated provider's explicit 4xx rejection proves the
        // create was declined. Timeouts, 409 conflicts and 5xx stay ambiguous.
        if (mode === 'live' && error.type === 'StripeInvalidRequestError' && error.statusCode === 400 && error.requestId && ['account_invalid', 'amount_too_small', 'amount_too_large', 'transfers_not_allowed'].includes(error.code)) {
          throw Object.assign(new Error('cashout_transfer_declined'), {
            definitive: true
          });
        }
        throw new Error("cashout_transfer_unconfirmed");
      }
    },
    async findPayout(op) {
      guard();
      if (op.payoutId) return stripe.payouts.retrieve(op.payoutId, {}, options(op));
      return unique(await stripe.payouts.list({
        limit: 100,
        created: {
          gte: Math.floor(op.createdAt / 1000) - 60
        }
      }, options(op)), item => item.metadata?.cashoutId === op.id && item.metadata?.attempt === String(op.payoutAttempt));
    },
    async createPayout(op) {
      guard();
      const account = await getAccount(op.accountId);
      if (!eligibility(account, op.accountId).ready || mode === 'live' && account.scalerId !== op.ownerId) fail("cashout_not_ready");
      // A transfer receipt alone does not establish payout-available funds.
      // Re-read the exact connected balance immediately before payout creation.
      const balance = await stripe.balance.retrieve({}, options(op));
      if (balance.livemode !== (mode === "live") || !Array.isArray(balance.available)) fail("cashout_balance_unconfirmed");
      const amounts = balance.available.filter(entry => entry.currency === op.currency);
      if (amounts.length !== 1 || !Number.isSafeInteger(amounts[0].amount)) fail("cashout_balance_unconfirmed");
      if (amounts[0].amount < op.amountCents) return null;
      return stripe.payouts.create({
        amount: op.amountCents,
        currency: op.currency,
        method: "standard",
        metadata: {
          cashoutId: op.id,
          mode,
          attempt: String(op.payoutAttempt)
        }
      }, {
        ...options(op),
        idempotencyKey: `${op.id}:payout:${op.payoutAttempt}`
      });
    }
  };
}
module.exports = {
  createStripeProvider,
  verifyTransfer,
  verifyPayout
};
