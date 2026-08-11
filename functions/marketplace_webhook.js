"use strict";

const ACCOUNT_THIN_EVENTS = new Set([
  "v2.core.account[requirements].updated",
  "v2.core.account[configuration.recipient].capability_status_updated",
]);

const EVENT_LEASE_MS = 5 * 60 * 1000;

/**
 * Durable, replay-safe webhook boundary. The event store must implement an
 * atomic claim. Event payloads are hints; handlers retrieve current Stripe
 * resources before applying financial or Accounts v2 state.
 */
function createWebhookProcessor({eventStore, handlers, now = () => Date.now()}) {
  return async function process(event) {
    const claim = await eventStore.claim(event, now(), EVENT_LEASE_MS);
    if (!claim.claimed) return {duplicate: true, status: claim.status};
    try {
      await handlers.reconcile(event);
      await eventStore.processed(event.id, now());
      return {duplicate: false, status: "processed"};
    } catch (error) {
      const terminal = error?.retryable === false;
      await eventStore.failed(event.id, terminal, String(error?.code || "processing_failed"));
      throw error;
    }
  };
}

function createMemoryEventStore() {
  const records = new Map();
  let gate = Promise.resolve();
  const atomic = (work) => {
    const next = gate.then(work, work);
    gate = next.catch(() => undefined);
    return next;
  };
  return {
    records,
    claim(event, nowMs, leaseMs) {
      return atomic(() => {
        const current = records.get(event.id);
        if (["processed", "failed_terminal"].includes(current?.status)) {
          return {claimed: false, status: current.status};
        }
        if (current?.status === "processing" && nowMs - current.updatedAtMs < leaseMs) {
          return {claimed: false, status: "processing"};
        }
        records.set(event.id, {
          ...current, id: event.id, type: event.type, status: "processing",
          attempts: Number(current?.attempts || 0) + 1, updatedAtMs: nowMs,
        });
        return {claimed: true, status: "processing"};
      });
    },
    processed(id, nowMs) {
      return atomic(() => records.set(id, {...records.get(id), status: "processed", updatedAtMs: nowMs}));
    },
    failed(id, terminal, code) {
      return atomic(() => records.set(id, {
        ...records.get(id), status: terminal ? "failed_terminal" : "failed_retryable",
        lastErrorCode: code,
      }));
    },
  };
}

function eventNeedsCurrentResource(type) {
  return ACCOUNT_THIN_EVENTS.has(type) || [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "payment_intent.payment_failed",
    "refund.created", "refund.updated", "refund.failed",
    "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
    "customer.subscription.created", "customer.subscription.updated",
    "customer.subscription.deleted", "payout.failed", "transfer.reversed",
  ].includes(type);
}

module.exports = {
  ACCOUNT_THIN_EVENTS,
  EVENT_LEASE_MS,
  createMemoryEventStore,
  createWebhookProcessor,
  eventNeedsCurrentResource,
};
