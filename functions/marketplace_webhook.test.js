"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Stripe = require("stripe");
const {
  ACCOUNT_THIN_EVENTS, EVENT_LEASE_MS, SNAPSHOT_EVENTS,
  createMemoryEventStore, createSignedWebhookBoundary,
  createThinAccountReconciler, createWebhookProcessor,
  eventNeedsCurrentResource, parseSnapshotEvent, parseThinEvent,
} = require("./marketplace_webhook");

const stripe = new Stripe("sk_test_local_signature_verification_only");
const SNAPSHOT_SECRET = "whsec_snapshot_test_only";
const THIN_SECRET = "whsec_thin_test_only";

function signedPayload(payload, secret) {
  const rawBody = JSON.stringify(payload);
  return {
    rawBody,
    signature: Stripe.webhooks.generateTestHeaderString({payload: rawBody, secret}),
  };
}

function snapshotPayload(id = "evt_snapshot") {
  return {id, object: "event", type: "checkout.session.completed",
    created: 1000, livemode: false, data: {object: {id: "cs_test"}}};
}

function thinPayload(id = "evt_thin", type = "v2.core.account[requirements].updated") {
  return {id, object: "v2.core.event_notification", type, created: 1000,
    related_object: {id: "acct_owner", type: "v2.core.account"},
    data: {object: {account: "acct_attacker", payouts_enabled: true}}};
}

function fixture() {
  let clock = 1000;
  const calls = [];
  const store = createMemoryEventStore();
  const processor = createWebhookProcessor({
    eventStore: store, now: () => clock,
    handlers: {reconcile: async (event) => {
      calls.push(event.type);
      await new Promise((resolve) => setTimeout(resolve, 4));
      if (event.fail === "retryable") throw Object.assign(new Error("retry"), {code: "retry"});
      if (event.fail === "terminal") {
        throw Object.assign(new Error("terminal"), {code: "terminal", retryable: false});
      }
    }},
  });
  return {calls, store, processor, advance: (ms) => { clock += ms; }};
}

test("identical Stripe event delivered simultaneously has one side effect", async () => {
  const f = fixture();
  const event = {id: "evt_1", type: "checkout.session.completed"};
  const results = await Promise.all([f.processor(event), f.processor(event)]);
  assert.equal(f.calls.length, 1);
  assert.equal(results.filter((r) => r.status === "processed").length, 1);
  assert.equal((await f.processor(event)).duplicate, true);
});

test("expired processing lease recovers after worker crash", async () => {
  const f = fixture();
  await f.store.claim({id: "evt_crash", type: "refund.updated"}, 1000, EVENT_LEASE_MS);
  assert.equal((await f.processor({id: "evt_crash", type: "refund.updated"})).duplicate, true);
  f.advance(EVENT_LEASE_MS + 1);
  assert.equal((await f.processor({id: "evt_crash", type: "refund.updated"})).status, "processed");
});

test("failed_retryable retries while failed_terminal remains terminal", async () => {
  const f = fixture();
  await assert.rejects(f.processor({id: "evt_retry", type: "refund.updated", fail: "retryable"}));
  await f.processor({id: "evt_retry", type: "refund.updated"});
  assert.equal(f.store.records.get("evt_retry").status, "processed");
  await assert.rejects(f.processor({id: "evt_terminal", type: "refund.failed", fail: "terminal"}));
  assert.equal((await f.processor({id: "evt_terminal", type: "refund.failed"})).status, "failed_terminal");
});

test("out-of-order event families are marked for current-resource reconciliation", () => {
  for (const type of [
    "checkout.session.completed", "checkout.session.async_payment_succeeded",
    "payment_intent.payment_failed", "refund.updated", "charge.dispute.closed",
    "customer.subscription.updated", "transfer.reversed", "payout.failed",
  ]) assert.equal(eventNeedsCurrentResource(type), true, type);
  assert.equal(eventNeedsCurrentResource("transfer.updated"), false);
});

test("Accounts v2 recipient thin events are exact and require retrieval", () => {
  assert.deepEqual([...ACCOUNT_THIN_EVENTS].sort(), [
    "v2.core.account[configuration.recipient].capability_status_updated",
    "v2.core.account[requirements].updated",
  ]);
  for (const type of ACCOUNT_THIN_EVENTS) assert.equal(eventNeedsCurrentResource(type), true);
});

test("snapshot boundary accepts only its snapshot signing secret", async () => {
  const calls = [];
  const endpoint = createSignedWebhookBoundary({
    parseSignedEvent: (input) => parseSnapshotEvent({stripe, ...input}),
    processVerifiedEvent: async (event) => calls.push(event.id),
  });
  const valid = signedPayload(snapshotPayload(), SNAPSHOT_SECRET);
  await endpoint({...valid, secret: SNAPSHOT_SECRET});
  assert.deepEqual(calls, ["evt_snapshot"]);
  await assert.rejects(endpoint({...signedPayload(snapshotPayload("evt_wrong"), THIN_SECRET),
    secret: SNAPSHOT_SECRET}), /signature/i);
  await assert.rejects(endpoint({...valid, secret: "whsec_invalid"}), /signature/i);
});

test("thin boundary accepts only its thin signing secret and approved families", async () => {
  const calls = [];
  const endpoint = createSignedWebhookBoundary({
    parseSignedEvent: (input) => parseThinEvent({stripe, ...input}),
    processVerifiedEvent: async (event) => calls.push(event.id),
  });
  const valid = signedPayload(thinPayload(), THIN_SECRET);
  await endpoint({...valid, secret: THIN_SECRET});
  assert.deepEqual(calls, ["evt_thin"]);
  await assert.rejects(endpoint({...signedPayload(thinPayload("evt_wrong"), SNAPSHOT_SECRET),
    secret: THIN_SECRET}), /signature/i);
  await assert.rejects(endpoint({...valid, secret: "whsec_invalid"}), /signature/i);
  const unapproved = signedPayload(thinPayload("evt_bad", "v2.core.account.closed"), THIN_SECRET);
  await assert.rejects(endpoint({...unapproved, secret: THIN_SECRET}), /Unsupported Stripe webhook event/);
});

test("duplicate signed snapshot and thin deliveries are harmless", async () => {
  for (const entry of [
    {payload: snapshotPayload("evt_snapshot_duplicate"), secret: SNAPSHOT_SECRET,
      parse: (input) => parseSnapshotEvent({stripe, ...input})},
    {payload: thinPayload("evt_thin_duplicate"), secret: THIN_SECRET,
      parse: (input) => parseThinEvent({stripe, ...input})},
  ]) {
    const calls = [];
    const processor = createWebhookProcessor({eventStore: createMemoryEventStore(),
      handlers: {reconcile: async (event) => calls.push(event.id)}});
    const endpoint = createSignedWebhookBoundary({parseSignedEvent: entry.parse,
      processVerifiedEvent: processor});
    const signed = signedPayload(entry.payload, entry.secret);
    const results = await Promise.all([
      endpoint({...signed, secret: entry.secret}),
      endpoint({...signed, secret: entry.secret}),
    ]);
    assert.equal(calls.length, 1);
    assert.equal(results.filter((result) => result.duplicate).length, 1);
  }
});

test("thin reconciliation retrieves current account and ignores payload readiness/substitution", async () => {
  const fetched = [];
  const current = {stripeAccountId: "acct_owner", transfersStatus: "restricted",
    payoutsStatus: "pending", detailsSubmitted: false};
  const reconcile = createThinAccountReconciler({
    reconcileCurrentAccount: async (accountId) => {
      fetched.push(accountId);
      return current;
    },
  });
  const parsed = parseThinEvent({stripe,
    ...signedPayload(thinPayload("evt_current"), THIN_SECRET), secret: THIN_SECRET});
  const result = await reconcile(parsed);
  assert.deepEqual(fetched, ["acct_owner"]);
  assert.equal(result.transfersStatus, "restricted");
  assert.equal(result.detailsSubmitted, false);
  assert.notEqual(parsed.data?.object?.account, fetched[0]);
});

test("snapshot and thin allowlists do not overlap", () => {
  for (const type of ACCOUNT_THIN_EVENTS) assert.equal(SNAPSHOT_EVENTS.has(type), false);
});

test("different events for one PaymentIntent each reconcile current state once", async () => {
  const f = fixture();
  await Promise.all([
    f.processor({id: "evt_checkout", type: "checkout.session.completed"}),
    f.processor({id: "evt_async", type: "checkout.session.async_payment_succeeded"}),
  ]);
  assert.equal(f.calls.length, 2);
});

test("duplicate transfer reversal delivery is harmless", async () => {
  const f = fixture();
  const event = {id: "evt_reversal", type: "transfer.reversed"};
  await Promise.all([f.processor(event), f.processor(event)]);
  await f.processor(event);
  assert.equal(f.calls.length, 1);
});

function currentResourceFixture(initial) {
  const resources = structuredClone(initial);
  const applied = {};
  const retrievals = [];
  const store = createMemoryEventStore();
  const processor = createWebhookProcessor({
    eventStore: store,
    handlers: {reconcile: async (event) => {
      const family = event.family;
      retrievals.push(`${family}:${event.resourceId}`);
      applied[family] = structuredClone(resources[family][event.resourceId]);
    }},
  });
  return {resources, applied, retrievals, processor};
}

test("async checkout success wins over earlier checkout completion by retrieval", async () => {
  const f = currentResourceFixture({checkout: {cs_1: {payment_status: "paid"}}});
  await f.processor({id: "evt_checkout_1", type: "checkout.session.completed", family: "checkout", resourceId: "cs_1"});
  await f.processor({id: "evt_checkout_2", type: "checkout.session.async_payment_succeeded", family: "checkout", resourceId: "cs_1"});
  assert.equal(f.applied.checkout.payment_status, "paid");
  assert.equal(f.retrievals.length, 2);
});

test("late payment failure cannot override current paid resource", async () => {
  const f = currentResourceFixture({payment: {pi_1: {status: "succeeded"}}});
  await f.processor({id: "evt_payment_fail", type: "payment_intent.payment_failed", family: "payment", resourceId: "pi_1"});
  assert.equal(f.applied.payment.status, "succeeded");
});

test("refund, dispute, and subscription events converge despite delivery order", async () => {
  const f = currentResourceFixture({
    refund: {re_1: {status: "succeeded", amount: 5000}},
    dispute: {dp_1: {status: "won"}},
    subscription: {sub_1: {status: "active"}},
  });
  const events = [
    {id: "evt_refund_new", type: "refund.updated", family: "refund", resourceId: "re_1"},
    {id: "evt_refund_old", type: "refund.created", family: "refund", resourceId: "re_1"},
    {id: "evt_dispute_closed", type: "charge.dispute.closed", family: "dispute", resourceId: "dp_1"},
    {id: "evt_dispute_old", type: "charge.dispute.created", family: "dispute", resourceId: "dp_1"},
    {id: "evt_sub_new", type: "customer.subscription.updated", family: "subscription", resourceId: "sub_1"},
    {id: "evt_sub_old", type: "customer.subscription.created", family: "subscription", resourceId: "sub_1"},
  ];
  for (const event of events) await f.processor(event);
  assert.deepEqual(f.applied.refund, {status: "succeeded", amount: 5000});
  assert.deepEqual(f.applied.dispute, {status: "won"});
  assert.deepEqual(f.applied.subscription, {status: "active"});
});

test("payout failure and transfer reversal retrieve current resources only once per event", async () => {
  const f = currentResourceFixture({
    payout: {po_1: {status: "failed"}},
    transfer: {tr_1: {reversed: true, amount_reversed: 2500}},
  });
  await Promise.all([
    f.processor({id: "evt_payout", type: "payout.failed", family: "payout", resourceId: "po_1"}),
    f.processor({id: "evt_reversed", type: "transfer.reversed", family: "transfer", resourceId: "tr_1"}),
  ]);
  assert.equal(f.applied.payout.status, "failed");
  assert.equal(f.applied.transfer.amount_reversed, 2500);
  assert.equal(f.retrievals.length, 2);
});
