"use strict";

const crypto = require("node:crypto");
const id = (...parts) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const fail = (code) => { throw Object.assign(new Error(code), {code}); };
const cents = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail("cashout_amount_invalid");
  return value;
};

function assertTestRuntime({environment, projectId, enabled, secretKey}) {
  if (enabled !== true || !({local: "demo-scaledcircle", staging: "scaledcircle-staging"})[environment] ||
      ({local: "demo-scaledcircle", staging: "scaledcircle-staging"})[environment] !== projectId) {
    fail("cashout_test_only");
  }
  if (typeof secretKey !== "string" || !/^sk_test_[A-Za-z0-9]+$/.test(secretKey)) {
    fail("cashout_test_credentials_required");
  }
}

function assertAccount(record, uid) {
  if (record?.scalerId !== uid || record.mode !== "test" ||
      !/^acct_[A-Za-z0-9]+$/.test(record.stripeAccountId || "")) fail("cashout_account_mismatch");
}

function eligibility(account, expectedId) {
  if (account?.id !== expectedId || account.livemode !== false) fail("cashout_account_mismatch");
  if (account.accountApi === "accounts_v2") {
    const ready = account.transfersStatus === "active" && account.payoutsStatus === "active" &&
      account.requirementsIncluded === true && !["currently_due", "past_due"].includes(account.deadlineStatus) &&
      account.payoutSchedule === "manual";
    return {ready, status: ready ? "ready" : "needs_attention"};
  }
  const ready = account.capabilities?.transfers === "active" && account.payouts_enabled === true &&
    account.details_submitted === true && !account.requirements?.disabled_reason &&
    (account.requirements?.currently_due || []).length === 0 &&
    (account.requirements?.past_due || []).length === 0 &&
    account.settings?.payouts?.schedule?.interval === "manual";
  return {ready, status: ready ? "ready" : "needs_attention"};
}

function projection(op) {
  return {operationId: op.id, amountCents: op.amountCents, mode: op.mode,
    payoutFailed: op.state === "payout_failed",
    status: op.state === "completed" ? "completed" :
      ["failed", "reversed"].includes(op.state) ? "failed" :
        op.state === "payout_failed" || op.state === "attention" ? "needs_attention" : "pending"};
}

function createStore(db, now = Date.now) {
  const opRef = (key) => db.collection("financialOperations").doc(key);
  const balanceRef = (uid) => db.collection("scalerCashoutBalances").doc(uid);
  function checkBalance(balance, uid) {
    if (balance?.ownerId !== uid || balance.mode !== "test" || balance.currency !== "usd" ||
        balance.source !== "bounded_test_fixture") fail("cashout_balance_unverified");
    cents(balance.availableCents); cents(balance.pendingCents); cents(balance.paidCents);
    if (cents(balance.fundedCents) > 10000 || balance.availableCents + balance.pendingCents + balance.paidCents !== balance.fundedCents) {
      fail("cashout_balance_unverified");
    }
  }
  async function owner(transaction, uid) {
    const user = (await transaction.get(db.collection("users").doc(uid))).data();
    if (user?.role !== "scaler" || user.disabled === true) fail("cashout_scaler_required");
  }
  function audit(transaction, op, action) {
    transaction.create(opRef(op.id).collection("audit").doc(String(op.version)), {
      action, version: op.version, mode: "test", state: op.state,
      amountCents: op.amountCents, at: now(),
    });
  }
  function wallet(transaction, uid, balance, op) {
    // Cash-out TEST balances are separate from production earning authority.
    const ref = db.collection("wallets").doc(uid);
    transaction.set(ref, {cashoutAvailableCents: balance.availableCents,
      cashoutPendingCents: balance.pendingCents, cashoutPaidCents: balance.paidCents,
      cashoutMode: "test"}, {merge: true});
    transaction.set(ref.collection("transactions").doc(op.id), {
      type: "withdrawal", walletSide: "scaler", amount: op.amountCents / 100,
      amountCents: op.amountCents, currency: "usd", mode: "test",
      description: "Cash out", status: projection(op).status,
      createdAtMillis: op.createdAt,
    });
  }
  return {
    async lookup(key) {
      const op = (await opRef(key).get()).data();
      if (!op || op.kind !== "scaler_cashout_v1" || op.mode !== "test") fail("cashout_operation_mismatch");
      return op;
    },
    async get(key, uid) {
      const op = (await opRef(key).get()).data();
      if (!op || op.kind !== "scaler_cashout_v1" || op.ownerId !== uid || op.mode !== "test") {
        fail("cashout_operation_mismatch");
      }
      return op;
    },
    async request(uid, requestId, amountCents, accountId, limit = null) {
      if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId || "") || cents(amountCents) === 0 || amountCents > 10000) {
        fail("cashout_request_invalid");
      }
      const key = `cashout_${id("v1", "test", uid, requestId)}`;
      return db.runTransaction(async (tx) => {
        await owner(tx, uid);
        const account = (await tx.get(db.collection("stripeConnectedAccounts").doc(uid))).data();
        assertAccount(account, uid);
        if (account.stripeAccountId !== accountId) fail("cashout_account_mismatch");
        const existing = (await tx.get(opRef(key))).data();
        if (existing) {
          if (existing.mode !== "test" || existing.ownerId !== uid || existing.accountId !== accountId ||
              existing.amountCents !== amountCents || existing.kind !== "scaler_cashout_v1") {
            fail("cashout_input_conflict");
          }
          return existing;
        }
        const balance = (await tx.get(balanceRef(uid))).data();
        const walletData = (await tx.get(db.collection("wallets").doc(uid))).data();
        checkBalance(balance, uid);
        if (limit && (amountCents !== limit.amountCents || balance.activeOperationId !== limit.previousOperationId)) {
          fail("cashout_certification_limit");
        }
        if (walletData?.ownerId !== uid || walletData.ownerType !== "scaler") fail("cashout_wallet_mismatch");
        if (balance.settlementFrozen !== false || walletData.settlementFrozen === true) fail("cashout_settlement_held");
        if (balance.pendingCents > 0) fail("cashout_already_pending");
        if (amountCents > balance.availableCents) fail("cashout_insufficient_balance");
        const next = {...balance, availableCents: balance.availableCents - amountCents,
          pendingCents: balance.pendingCents + amountCents, activeOperationId: key};
        const op = {id: key, kind: "scaler_cashout_v1", ownerId: uid, mode: "test", currency: "usd",
          accountId, amountCents, state: "reserved", version: 1, createdAt: now(),
          transferId: null, payoutId: null, payoutAttempt: 1, leaseUntil: 0};
        tx.create(opRef(key), op); tx.set(balanceRef(uid), next);
        wallet(tx, uid, next, op); audit(tx, op, "reserved");
        return op;
      });
    },
    async claim(key, uid, readOnly = false) {
      return db.runTransaction(async (tx) => {
        await owner(tx, uid);
        const op = (await tx.get(opRef(key))).data();
        if (op?.ownerId !== uid || op.mode !== "test" || op.kind !== "scaler_cashout_v1") fail("cashout_operation_mismatch");
        const account = (await tx.get(db.collection("stripeConnectedAccounts").doc(uid))).data();
        assertAccount(account, uid);
        if (account.stripeAccountId !== op.accountId) fail("cashout_account_mismatch");
        const balance = (await tx.get(balanceRef(uid))).data();
        checkBalance(balance, uid);
        const walletData = (await tx.get(db.collection("wallets").doc(uid))).data();
        if (walletData?.ownerId !== uid || walletData.ownerType !== "scaler") fail("cashout_wallet_mismatch");
        if (!readOnly && (balance.settlementFrozen !== false || walletData.settlementFrozen === true)) fail("cashout_settlement_held");
        if (["failed", "reversed"].includes(op.state) ||
            (op.state === "completed" && op.settled === true) || op.leaseUntil > now()) return null;
        const claimed = {...op, version: op.version + 1, leaseUntil: now() + 120000};
        tx.set(opRef(key), claimed); audit(tx, claimed, "claimed");
        return claimed;
      });
    },
    async save(claim, patch, movement = "none") {
      return db.runTransaction(async (tx) => {
        const current = (await tx.get(opRef(claim.id))).data();
        if (current?.version !== claim.version || current.mode !== "test" || current.ownerId !== claim.ownerId) {
          fail("cashout_stale_claim");
        }
        const balance = (await tx.get(balanceRef(claim.ownerId))).data();
        checkBalance(balance, claim.ownerId);
        const next = {...balance};
        if (movement !== "none") {
          if (current.settled === true || next.pendingCents < current.amountCents) fail("cashout_settlement_conflict");
          next.pendingCents -= current.amountCents;
          if (movement === "release") next.availableCents += current.amountCents;
          else if (movement === "paid") next.paidCents += current.amountCents;
          else fail("cashout_movement_invalid");
        }
        const updated = {...current, ...patch, id: current.id, ownerId: current.ownerId,
          mode: current.mode, accountId: current.accountId, amountCents: current.amountCents,
          kind: current.kind, currency: current.currency, createdAt: current.createdAt,
          version: current.version + 1, ...(movement !== "none" ? {settled: true} : {})};
        tx.set(opRef(claim.id), updated); tx.set(balanceRef(claim.ownerId), next);
        wallet(tx, claim.ownerId, next, updated); audit(tx, updated, "updated");
        return updated;
      });
    },
    async event(eventId, action) {
      if (!/^evt_[A-Za-z0-9]+$/.test(eventId || "")) fail("cashout_event_invalid");
      const ref = db.collection("scalerCashoutEvents").doc(eventId);
      const lease = crypto.randomUUID();
      const claimed = await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (current?.done || current?.until > now()) return false;
        tx.set(ref, {lease, until: now() + 120000, done: false}); return true;
      });
      if (!claimed) return {duplicate: true};
      try {
        await action();
        await db.runTransaction(async (tx) => {
          if ((await tx.get(ref)).data()?.lease === lease) tx.update(ref, {done: true, until: 0});
        });
      } catch (error) {
        await db.runTransaction(async (tx) => {
          if ((await tx.get(ref)).data()?.lease === lease) tx.update(ref, {until: 0});
        });
        throw error;
      }
      return {received: true};
    },
  };
}

function createService(options) {
  return require("./scaler_cashout_engine").createService({...options,
    assertRuntime: assertTestRuntime, accountEligibility: eligibility,
    assertRecipient: options.assertRecipient || assertAccount,
    validateLimit(limit) {
      if (limit && (!/^cashout_[a-f0-9]{64}$/.test(limit.previousOperationId || "") || limit.amountCents !== 500)) fail("cashout_certification_limit");
    }});
}

module.exports = {assertTestRuntime, assertAccount, eligibility, createStore, createService, projection};
