"use strict";

// Shared TEST and LIVE reservation/transfer/payout state machine. Authority and
// storage are supplied explicitly by the environment-specific entrypoint.
const {
  projection,
  fail
} = require("./scaler_cashout_shared");
function createService({
  store,
  provider,
  runtime,
  now = Date.now,
  assertRecipient,
  assertRuntime,
  accountEligibility,
  validateLimit = () => {}
}) {
  const guard = () => assertRuntime(runtime());
  async function run(key, uid, {
    readOnly = false,
    retryPayout = false
  } = {}) {
    guard();
    if (runtime().reconcileOnly === true && (!readOnly || retryPayout || key !== runtime().operationId)) fail("cashout_reconciliation_only");
    let op = await store.claim(key, uid, readOnly);
    if (!op) {
      const current = await store.get(key, uid);
      if (readOnly && current.leaseUntil > now()) fail("cashout_operation_busy");
      return projection(current);
    }
    const save = async (patch, movement) => {
      op = await store.save(op, patch, movement);
    };
    try {
      let transfer = await provider.findTransfer(op);
      if (!transfer && op.transferId) fail("cashout_receipt_missing");
      if (!transfer && !readOnly && op.state !== "completed") {
        // A durable attempted marker is never treated as proof of absence.
        // LIVE retries only observe provider truth after a lost response/crash.
        if (provider.avoidAmbiguousRetry && op.transferStartedAt) {
          await save({
            state: 'confirming',
            leaseUntil: 0
          });
          return projection(op);
        }
        if (provider.transferAvailable && !(await provider.transferAvailable(op))) {
          await save({
            state: 'platform_balance_pending',
            leaseUntil: 0
          });
          return projection(op);
        }
        if (now() - (op.transferStartedAt || now()) > 20 * 60 * 60 * 1000) fail("cashout_reconciliation_required");
        await save({
          state: "transfer_pending",
          transferStartedAt: op.transferStartedAt || now()
        });
        try {
          transfer = await provider.createTransfer(op);
        } catch (error) {
          if (error.definitive === true) {
            await save({
              state: "failed",
              leaseUntil: 0
            }, "release");
            return projection(op);
          }
          throw error;
        }
        if (!transfer && provider.avoidAmbiguousRetry) {
          await save({
            state: 'platform_balance_pending',
            transferStartedAt: null,
            leaseUntil: 0
          });
          return projection(op);
        }
      }
      if (!transfer) {
        await save({
          leaseUntil: 0
        });
        return projection(op);
      }
      provider.verifyTransfer(transfer, op);
      await save({
        transferId: transfer.id
      });
      let payout = await provider.findPayout(op);
      if (op.payoutId && !payout) fail("cashout_receipt_missing");
      if (payout) provider.verifyPayout(payout, op);
      if (transfer.amount_reversed > 0) {
        if (transfer.amount_reversed === op.amountCents && op.settled !== true && (!payout || ["failed", "canceled"].includes(payout.status))) {
          await save({
            state: "reversed",
            leaseUntil: 0
          }, "release");
        } else await save({
          state: "attention",
          leaseUntil: 0
        });
        return projection(op);
      }
      if (payout && ["failed", "canceled"].includes(payout.status) && retryPayout && !readOnly && op.settled !== true) {
        if (op.payoutAttempt >= 3) fail("cashout_retry_limit");
        await save({
          payoutId: null,
          payoutAttempt: op.payoutAttempt + 1,
          payoutStartedAt: null,
          payoutFailureCode: null
        });
        payout = null;
      }
      if (!payout && !readOnly && op.settled !== true) {
        if (provider.avoidAmbiguousRetry && op.payoutStartedAt) {
          await save({
            state: 'confirming',
            leaseUntil: 0
          });
          return projection(op);
        }
        if (now() - (op.payoutStartedAt || now()) > 20 * 60 * 60 * 1000) fail("cashout_reconciliation_required");
        await save({
          state: "payout_pending",
          payoutStartedAt: op.payoutStartedAt || now()
        });
        payout = await provider.createPayout(op);
        if (!payout) {
          await save({
            state: "balance_pending",
            payoutStartedAt: null,
            leaseUntil: 0
          });
          return projection(op);
        }
      }
      if (payout) {
        provider.verifyPayout(payout, op);
        // A bank may reject a payout after reporting it paid. Put that same
        // obligation back into processing; never credit a second earning.
        if (provider.avoidAmbiguousRetry && op.settled === true && op.state === 'completed' && ['failed', 'canceled'].includes(payout.status)) {
          await save({
            state: 'payout_failed',
            payoutFailureCode: payout.failure_code || 'unspecified',
            leaseUntil: 0
          }, 'reopen');
          return projection(op);
        }
        const state = payout.status === "paid" ? "completed" : ["failed", "canceled"].includes(payout.status) ? "payout_failed" : "payout_pending";
        await save({
          state,
          payoutId: payout.id,
          leaseUntil: 0,
          payoutFailureCode: state === "payout_failed" ? payout.failure_code || "unspecified" : null
        }, state === "completed" && op.settled !== true ? "paid" : "none");
      } else await save({
        leaseUntil: 0,
        ...(provider.avoidAmbiguousRetry && !op.payoutStartedAt && op.settled !== true ? {
          state: 'balance_pending'
        } : {})
      });
      return projection(op);
    } catch (error) {
      if (error.code === "cashout_stale_claim") throw error;
      await save({
        state: provider.avoidAmbiguousRetry && (op.transferStartedAt || op.payoutStartedAt) ? 'confirming' : 'attention',
        leaseUntil: 0
      });
      if (readOnly) throw error;
      return projection(op);
    }
  }
  return {
    run,
    async request(uid, data, account) {
      guard();
      if (Object.keys(data || {}).some(key => !["requestId", "amountCents"].includes(key))) fail("cashout_request_invalid");
      assertRecipient(account, uid);
      const current = await provider.getAccount(account.stripeAccountId);
      if (!accountEligibility(current, account.stripeAccountId).ready) fail("cashout_not_ready");
      const limit = runtime().certificationLimit;
      validateLimit(limit);
      const op = await store.request(uid, data.requestId, data.amountCents, account.stripeAccountId, limit);
      return run(op.id, uid);
    }
  };
}
module.exports = {
  createService
};
