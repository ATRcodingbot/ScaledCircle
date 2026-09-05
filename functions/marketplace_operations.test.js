"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const marketplace = require("./marketplace_finance");
const {
  assertFinancialInvariants,
  assertReversalAvailable,
  createMemoryOperationStore,
  runFinancialOperation,
} = require("./marketplace_operations");

function mockStripeBoundary() {
  const calls = [];
  return {
    calls,
    async create(kind, idempotencyKey, result) {
      calls.push({kind, idempotencyKey});
      await new Promise((resolve) => setTimeout(resolve, 5));
      return result;
    },
  };
}

async function concurrentOperation(kind, parts, trustedInput) {
  const store = createMemoryOperationStore();
  const stripe = mockStripeBoundary();
  const operationId = marketplace.operationId(kind, ...parts);
  const invoke = () => runFinancialOperation({
    store, operationId, kind, trustedInput,
    execute: () => stripe.create(
      kind,
      marketplace.stripeIdempotencyKey(kind, operationId),
      {objectId: `${kind}_object`, operationId},
    ),
  });
  const results = await Promise.all([invoke(), invoke()]);
  assert.equal(stripe.calls.length, 1);
  assert.deepEqual(stripe.calls[0], {
    kind,
    idempotencyKey: marketplace.stripeIdempotencyKey(kind, operationId),
  });
  assert.deepEqual(results.map((item) => item.objectId), [`${kind}_object`, `${kind}_object`]);
  return {store, stripe, operationId, invoke};
}

test("simultaneous customer requests create one customer operation", async () => {
  await concurrentOperation("customer", ["business_a"], {businessId: "business_a"});
});

test("simultaneous campaign checkout and successful retry share one session", async () => {
  const fixture = await concurrentOperation(
    "campaign-checkout", ["campaign_a", 3],
    {campaignId: "campaign_a", businessId: "business_a", fundingVersion: 3, amountCents: 12000},
  );
  const retry = await fixture.invoke();
  assert.equal(retry.objectId, "campaign-checkout_object");
  assert.equal(retry.recovered, true);
  assert.equal(fixture.stripe.calls.length, 1);
});

test("retry after uncertain timeout reclaims same deterministic operation", async () => {
  const store = createMemoryOperationStore();
  const operationId = marketplace.operationId("campaign-checkout", "campaign_timeout", 1);
  let attempts = 0;
  const invoke = () => runFinancialOperation({
    store, operationId, kind: "campaign-checkout",
    trustedInput: {campaignId: "campaign_timeout", fundingVersion: 1},
    waitAttempts: 1, waitMs: 1,
    execute: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("timeout");
        error.code = "ETIMEDOUT";
        throw error;
      }
      return {objectId: "cs_reconciled", operationId};
    },
  });
  await assert.rejects(invoke(), /timeout/);
  const recovered = await invoke();
  assert.equal(recovered.objectId, "cs_reconciled");
  assert.equal(attempts, 2);
  assert.equal((await store.get(operationId)).attempt, 2);
});

test("simultaneous connected-account requests use authenticated scaler identity", async () => {
  const result = await concurrentOperation(
    "account-v2", ["scaler_a"], {authenticatedScalerId: "scaler_a"},
  );
  await assert.rejects(runFinancialOperation({
    store: result.store,
    operationId: result.operationId,
    kind: "account-v2",
    trustedInput: {authenticatedScalerId: "scaler_b"},
    execute: async () => ({objectId: "acct_bad"}),
  }), /input_conflict/);
});

test("simultaneous transfer requests reserve and submit one transfer", async () => {
  await concurrentOperation(
    "scaler-transfer", ["zone_a", 2, 1],
    {zoneId: "zone_a", completionVersion: 2, payoutVersion: 1, amountCents: 5000},
  );
});

test("identical refunds are idempotent while aggregate refund is bounded", async () => {
  await concurrentOperation(
    "campaign-refund", ["payment_a", "full"],
    {paymentId: "payment_a", amountCents: 12000},
  );
  assert.throws(() => assertFinancialInvariants({
    workerFundedCents: 10000, workerTransferredCents: 6000,
    workerRefundedCents: 3000, workerReservedCents: 2000,
    platformFeeFundedCents: 2000, platformFeeRefundedCents: 0,
    platformFeeRecognizedCents: 0, capturedTotalCents: 12000,
    refundedTotalCents: 3000,
  }), /worker_allocation_exceeded/);
});

test("concurrent different refund reservations cannot exceed captured amount", async () => {
  let reservedCents = 0;
  let gate = Promise.resolve();
  const reserve = (amountCents) => {
    const work = gate.then(() => {
      assertFinancialInvariants({
        workerFundedCents: 10000,
        workerTransferredCents: 0,
        workerRefundedCents: 0,
        workerReservedCents: reservedCents + amountCents,
        platformFeeFundedCents: 2000,
        platformFeeRefundedCents: 0,
        platformFeeRecognizedCents: 0,
        capturedTotalCents: 12000,
        refundedTotalCents: reservedCents + amountCents,
      });
      reservedCents += amountCents;
      return reservedCents;
    });
    gate = work.catch(() => undefined);
    return work;
  };
  const results = await Promise.allSettled([reserve(7000), reserve(6000)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.ok(reservedCents <= 12000);
});

test("transfer reversals are idempotent and cannot exceed transfer", async () => {
  await concurrentOperation(
    "transfer-reversal", ["transfer_a", 1],
    {transferId: "transfer_a", reversalVersion: 1, amountCents: 2500},
  );
  assert.equal(assertReversalAvailable({amountCents: 5000, reversedAmountCents: 2500}, 2500), true);
  assert.throws(
    () => assertReversalAvailable({amountCents: 5000, reversedAmountCents: 2500}, 2501),
    /reversal_exceeded/,
  );
});

test("financial invariants accept exact bounded allocation", () => {
  assert.equal(assertFinancialInvariants({
    workerFundedCents: 10000, workerTransferredCents: 4000,
    workerRefundedCents: 3000, workerReservedCents: 3000,
    platformFeeFundedCents: 2000, platformFeeRefundedCents: 500,
    platformFeeRecognizedCents: 1500, capturedTotalCents: 12000,
    refundedTotalCents: 3500,
  }), true);
});

test("financial invariants reject non-integer, negative, excess, and frozen settlement", () => {
  const base = {
    workerFundedCents: 10000, workerTransferredCents: 0,
    workerRefundedCents: 0, workerReservedCents: 10000,
    platformFeeFundedCents: 2000, platformFeeRefundedCents: 0,
    platformFeeRecognizedCents: 0, capturedTotalCents: 12000,
    refundedTotalCents: 0,
  };
  assert.throws(() => assertFinancialInvariants({...base, workerReservedCents: -1}), /invalid/);
  assert.throws(() => assertFinancialInvariants({...base, workerReservedCents: 1.5}), /invalid/);
  assert.throws(() => assertFinancialInvariants({...base, refundedTotalCents: 12001}), /refund_exceeded/);
  assert.throws(() => assertFinancialInvariants({
    ...base, settlementFrozen: true, requestedSettlementCents: 1,
  }), /settlement_frozen/);
});

test("terminal failure cannot be reclaimed or execute a second financial mutation", async () => {
  const store = createMemoryOperationStore();
  let calls = 0;
  const input = {store, operationId: "terminal-test", kind: "transfer",
    trustedInput: {amountCents: 100}, waitAttempts: 1, waitMs: 0,
    execute: async () => {
      calls += 1;
      throw Object.assign(new Error("declined"), {retryable: false});
    }};
  await assert.rejects(runFinancialOperation(input), /declined/);
  await assert.rejects(runFinancialOperation(input), /failed_terminal/);
  assert.equal(calls, 1);
  assert.equal((await store.get(input.operationId)).attempt, 1);
});

