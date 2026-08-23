"use strict";

const crypto = require("node:crypto");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Coordinates a durable financial operation around a remote Stripe mutation.
 * The supplied store owns the atomic claim. Only the claimant invokes Stripe;
 * concurrent callers wait for and recover the same durable result.
 */
async function runFinancialOperation({
  store,
  operationId,
  kind,
  trustedInput,
  execute,
  reconcile,
  waitAttempts = 80,
  waitMs = 25,
}) {
  const inputDigest = digest(trustedInput);
  const claim = await store.claim({operationId, kind, inputDigest, trustedInput});
  if (claim.status === "succeeded") return {...claim.result, recovered: true};
  if (claim.status === "conflict") throw new Error("financial_operation_input_conflict");

  if (claim.execute !== true) {
    for (let attempt = 0; attempt < waitAttempts; attempt += 1) {
      const current = await store.get(operationId);
      if (current?.inputDigest !== inputDigest) {
        throw new Error("financial_operation_input_conflict");
      }
      if (current?.status === "succeeded") return {...current.result, recovered: true};
      if (["failed_terminal", "conflict"].includes(current?.status)) {
        throw new Error("financial_operation_failed_terminal");
      }
      if (current?.status === "failed_retryable") break;
      await delay(waitMs);
    }
    const reclaimed = await store.claim({operationId, kind, inputDigest, trustedInput});
    if (reclaimed.status === "succeeded") return {...reclaimed.result, recovered: true};
    if (reclaimed.execute !== true) throw new Error("financial_operation_in_progress");
  }

  try {
    if (typeof reconcile === "function") {
      const recovered = await reconcile({operationId, trustedInput, inputDigest});
      if (recovered) {
        await store.succeed(operationId, recovered);
        return {...recovered, recovered: true};
      }
    }
    const result = await execute({operationId, trustedInput, inputDigest});
    await store.succeed(operationId, result);
    return {...result, recovered: false};
  } catch (error) {
    await store.fail(operationId, {
      retryable: error?.retryable !== false,
      code: String(error?.code || "remote_operation_failed").slice(0, 80),
    });
    throw error;
  }
}

/** In-memory atomic store used only by deterministic backend tests. */
function createMemoryOperationStore() {
  const records = new Map();
  let gate = Promise.resolve();
  const atomic = (work) => {
    const next = gate.then(work, work);
    gate = next.catch(() => undefined);
    return next;
  };
  return {
    records,
    claim(input) {
      return atomic(() => {
        const current = records.get(input.operationId);
        if (current?.inputDigest && current.inputDigest !== input.inputDigest) {
          return {status: "conflict", execute: false};
        }
        if (current?.status === "succeeded") {
          return {status: "succeeded", execute: false, result: current.result};
        }
        if (current?.status === "processing") return {status: "processing", execute: false};
        const attempt = Number(current?.attempt || 0) + 1;
        records.set(input.operationId, {...current, ...input, status: "processing", attempt});
        return {status: "processing", execute: true, attempt};
      });
    },
    async get(operationId) {
      const value = records.get(operationId);
      return value ? structuredClone(value) : null;
    },
    succeed(operationId, result) {
      return atomic(() => {
        const current = records.get(operationId);
        records.set(operationId, {...current, status: "succeeded", result});
      });
    },
    fail(operationId, failure) {
      return atomic(() => {
        const current = records.get(operationId);
        records.set(operationId, {
          ...current,
          status: failure.retryable ? "failed_retryable" : "failed_terminal",
          lastErrorCode: failure.code,
        });
      });
    },
  };
}

function assertFinancialInvariants(payment) {
  const fields = [
    "workerFundedCents", "workerTransferredCents", "workerRefundedCents",
    "workerReservedCents", "platformFeeFundedCents", "platformFeeRefundedCents",
    "platformFeeRecognizedCents", "capturedTotalCents", "refundedTotalCents",
  ];
  for (const field of fields) {
    const value = payment[field] || 0;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field}_invalid`);
  }
  if (payment.workerTransferredCents + payment.workerRefundedCents +
      payment.workerReservedCents > payment.workerFundedCents) {
    throw new Error("worker_allocation_exceeded");
  }
  if (payment.platformFeeRefundedCents + payment.platformFeeRecognizedCents >
      payment.platformFeeFundedCents) {
    throw new Error("platform_fee_allocation_exceeded");
  }
  if (payment.refundedTotalCents > payment.capturedTotalCents) {
    throw new Error("customer_refund_exceeded");
  }
  if (payment.settlementFrozen === true && payment.requestedSettlementCents > 0) {
    throw new Error("settlement_frozen");
  }
  return true;
}

function assertReversalAvailable(transfer, requestedCents) {
  const amount = transfer.amountCents;
  const reversed = transfer.reversedAmountCents || 0;
  if (![amount, reversed, requestedCents].every(Number.isSafeInteger) ||
      amount < 0 || reversed < 0 || requestedCents <= 0 ||
      reversed + requestedCents > amount) {
    throw new Error("transfer_reversal_exceeded");
  }
  return true;
}

module.exports = {
  assertFinancialInvariants,
  assertReversalAvailable,
  createMemoryOperationStore,
  digest,
  runFinancialOperation,
  stableJson,
};
