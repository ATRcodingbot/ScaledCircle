"use strict";
const crypto = require("node:crypto");
const cashout = require("./scaler_cashout");

function createEndpoints({db, stripe, provider, service, runtime, now = Date.now}) {
  const guard = (uid) => {
    cashout.assertTestRuntime(runtime());
    if (runtime().scalerUid && runtime().scalerUid !== uid) throw new Error("cashout_account_mismatch");
  };
  const ref = (uid) => db.collection("stripeConnectedAccounts").doc(uid);
  async function status(uid) {
    guard(uid);
    const record = (await ref(uid).get()).data();
    const balance = (await db.collection("scalerCashoutBalances").doc(uid).get()).data();
    const funds = balance?.ownerId === uid && balance.mode === "test" && balance.source === "bounded_test_fixture" ?
      {availableCents: balance.availableCents, pendingCents: balance.pendingCents, paidCents: balance.paidCents} :
      {availableCents: 0, pendingCents: 0, paidCents: 0};
    let operation = null;
    if (balance?.activeOperationId) {
      const op = await db.collection("financialOperations").doc(balance.activeOperationId).get();
      if (op.data()?.ownerId === uid && op.data()?.mode === "test") operation = cashout.projection(op.data());
    }
    if (!record?.stripeAccountId) return {mode: "test", status: "not_setup", ...funds, operation};
    cashout.assertAccount(record, uid);
    return {mode: "test", ...cashout.eligibility(await provider.getAccount(record.stripeAccountId), record.stripeAccountId),
      ...funds, operation};
  }
  return {status, async setup(uid, email) {
    guard(uid);
    const start = await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref(uid))).data();
      if (current) {
        if (current.stripeAccountId) {
          cashout.assertAccount(current, uid);
          if (current.accountApi !== "accounts_v2") throw new Error("cashout_historical_account_requires_review");
        }
        else if (current.scalerId !== uid || current.mode !== "test" || !Number.isSafeInteger(current.setupStartedAt)) {
          throw new Error("cashout_account_mismatch");
        }
        return current;
      }
      const record = {scalerId: uid, mode: "test", setupStartedAt: now()};
      tx.create(ref(uid), record); return record;
    });
    let accountId = start.stripeAccountId;
    if (!accountId) {
      if (now() - start.setupStartedAt > 20 * 60 * 60 * 1000) throw new Error("cashout_setup_reconcile_required");
      const key = crypto.createHash("sha256").update(JSON.stringify(["cashout-test-account", uid])).digest("hex");
      const account = await stripe.v2.core.accounts.create({contact_email: email,
        dashboard: "express", identity: {country: "us"},
        defaults: {currency: "usd", responsibilities: {fees_collector: "application", losses_collector: "application"}},
        configuration: {recipient: {capabilities: {stripe_balance: {stripe_transfers: {requested: true}}}}},
        metadata: {scalerId: uid, mode: "test"}, include: ["configuration.recipient"]},
      {idempotencyKey: `cashout-test-account-v2:${key}`});
      if (account.livemode !== false || account.metadata?.scalerId !== uid || account.metadata?.mode !== "test") {
        throw new Error("cashout_account_mismatch");
      }
      if (!/^acct_[A-Za-z0-9]+$/.test(account.id || "")) throw new Error("cashout_account_mismatch");
      accountId = account.id;
      cashout.eligibility(await provider.getAccount(accountId), accountId);
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref(uid))).data();
        if (current?.mode !== "test" || current.scalerId !== uid ||
            (current.stripeAccountId && current.stripeAccountId !== accountId)) throw new Error("cashout_account_mismatch");
        tx.update(ref(uid), {stripeAccountId: accountId, accountApi: "accounts_v2", createdAtMillis: now()});
      });
    }
    // Reuse only the server-bound v2 account; never modify historical accounts.
    cashout.eligibility(await provider.getAccount(accountId), accountId);
    await stripe.balanceSettings.update({payments: {payouts: {schedule: {interval: "manual"}}}},
      {stripeAccount: accountId, idempotencyKey: `cashout-test-manual:${accountId}`});
    const origin = runtime().environment === "staging" ? "https://scaledcircle-staging.web.app" : "http://127.0.0.1:5000";
    const link = await stripe.v2.core.accountLinks.create({account: accountId,
      use_case: {type: "account_onboarding", account_onboarding: {configurations: ["recipient"],
        refresh_url: `${origin}/?connect=refresh#/scaler`, return_url: `${origin}/?connect=return#/scaler`}}});
    const url = new URL(link.url);
    if (url.protocol !== "https:" || url.hostname !== "connect.stripe.com") throw new Error("cashout_onboarding_url_invalid");
    return {url: link.url, mode: "test"};
  }, async request(uid, data) {
    guard(uid);
    return service.request(uid, data, (await ref(uid).get()).data());
  }};
}

module.exports = {createEndpoints};
