"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertHandoffTransition,
  assertZoneDuration,
  calculateBusinessNoShowAllocation,
  classifyCutoffAction,
  evaluateJobStart,
  evaluateWorkWindow,
  graceExpired,
  arrivalWasTimely,
  normalizeSupportCategory,
  assertSupportAction,
  safeDiscoveryProjection,
  zoneGeometryDigest,
  normalizeMaterialLogistics,
  readinessStatus,
  isJobRoomMember,
  canRewriteMaterialHandoff,
} = require("./operational_layer");

test("one-Scaler duration accepts 359/360 and rejects 361 minutes", () => {
  assert.equal(assertZoneDuration(359), 359);
  assert.equal(assertZoneDuration(360), 360);
  assert.throws(() => assertZoneDuration(361), /360/);
});

test("server zone analysis is bound to normalized geometry, not a client duration label", () => {
  const geometry = [
    {latitude: 39.2, longitude: -76.8},
    {latitude: 39.21, longitude: -76.79},
    {latitude: 39.2, longitude: -76.78},
  ];
  const analyzed = zoneGeometryDigest(geometry);
  assert.equal(zoneGeometryDigest(geometry.map((point) => ({...point}))), analyzed);
  assert.notEqual(zoneGeometryDigest([...geometry, {latitude: 39.22, longitude: -76.78}]), analyzed);
  assert.throws(() => zoneGeometryDigest([
    {latitude: 999, longitude: -76.8},
    {latitude: 39.21, longitude: -76.79},
    {latitude: 39.2, longitude: -76.78},
  ]), /geometry/i);
});

test("handoff state transitions are explicit and terminal states stay terminal", () => {
  assert.doesNotThrow(() => assertHandoffTransition("scheduled", "scaler_en_route"));
  assert.doesNotThrow(() => assertHandoffTransition("handoff_in_progress", "received"));
  assert.throws(() => assertHandoffTransition("received", "scheduled"), /Invalid/);
});

test("material and work-window gates are both server-policy inputs", () => {
  const open = {allowed: true, atOrAfterCutoff: false};
  assert.deepEqual(evaluateJobStart({materialRequired: true, handoffStatus: "scheduled", workWindow: open}), {
    allowed: false,
    reason: "material_not_received",
  });
  assert.equal(evaluateJobStart({materialRequired: true, handoffStatus: "received", workWindow: open}).allowed, true);
});

test("residential and commercial default windows enforce the 8pm cutoff", () => {
  const midday = new Date("2026-08-11T16:00:00.000Z");
  const cutoff = new Date("2026-08-12T00:00:00.000Z");
  assert.equal(evaluateWorkWindow({date: midday, timeZone: "America/New_York", propertyType: "residential"}).allowed, true);
  assert.equal(evaluateWorkWindow({date: cutoff, timeZone: "America/New_York", propertyType: "commercial"}).atOrAfterCutoff, true);
});

test("$100 worker allocation business no-show split is exact integer cents", () => {
  assert.deepEqual(calculateBusinessNoShowAllocation({workerAmountCents: 10000, platformFeeCents: 2000}), {
    scalerCompensationCents: 5000,
    workerRefundCents: 5000,
    platformRetainedCents: 2000,
  });
});

test("15-minute grace and timely-arrival evidence share the trusted boundary", () => {
  const scheduledAt = new Date("2026-08-11T12:00:00.000Z");
  assert.equal(graceExpired(scheduledAt, new Date("2026-08-11T12:14:59.999Z")), false);
  assert.equal(graceExpired(scheduledAt, new Date("2026-08-11T12:15:00.000Z")), true);
  assert.equal(arrivalWasTimely({scheduledAt, arrivedAt: new Date("2026-08-11T12:15:00.000Z")}), true);
  assert.equal(arrivalWasTimely({scheduledAt, arrivedAt: new Date("2026-08-11T12:15:00.001Z")}), false);
});

test("support categories and trusted actions are explicit allowlists", () => {
  assert.equal(normalizeSupportCategory("Payment / Refund"), "payment_refund");
  assert.equal(assertSupportAction("authorize_handoff_allocation"), "authorize_handoff_allocation");
  assert.throws(() => normalizeSupportCategory("erase-ledger"), /Unsupported/);
  assert.throws(() => assertSupportAction("pay_anything"), /Unsupported/);
});

test("cutoff policy warns then pauses without completing work", () => {
  const warningAt = new Date("2026-08-11T23:30:00.000Z");
  const cutoffAt = new Date("2026-08-12T00:00:00.000Z");
  assert.equal(classifyCutoffAction({status: "in_progress", now: new Date("2026-08-11T23:45:00.000Z"), warningAt, cutoffAt}), "warn");
  assert.equal(classifyCutoffAction({status: "in_progress", now: cutoffAt, warningAt, cutoffAt}), "pause");
  assert.equal(classifyCutoffAction({status: "completed", now: cutoffAt, warningAt, cutoffAt}), "none");
});

test("discovery projection excludes addresses, contacts, chat, and access details", () => {
  const safe = safeDiscoveryProjection({
    id: "campaign-1",
    name: "Flyers",
    workerAmountCents: 10000,
    privateAddress: "secret",
    businessPhone: "secret",
    accessInstructions: "secret",
  });
  assert.equal(safe.estimatedPayCents, 10000);
  assert.equal("privateAddress" in safe, false);
  assert.equal("businessPhone" in safe, false);
  assert.equal("accessInstructions" in safe, false);
  assert.equal("privateHandoffLocation" in safe, false);
  assert.equal("privateEmail" in safe, false);
  assert.equal("privateContactName" in safe, false);
});

test("discovery includes assignment material contract without contact fields", () => {
  const safe = safeDiscoveryProjection({
    id: "campaign-materials", name: "Group job", workerAmountCents: 40000,
    requiredScalerCount: 4, materialFulfillmentType: "business_delivery",
    materialHandoffAddress: "100 Staging Plaza",
    materialHandoffScheduledAt: "2030-09-03T12:30:00.000Z",
    materialHandoffInstructions: "Meet at the entrance",
    businessPhone: "private", businessEmail: "private@example.test",
  });
  assert.equal(safe.materialLogistics.location, "100 Staging Plaza");
  assert.equal(safe.materialLogistics.fulfillmentType, "business_delivery");
  assert.equal(typeof safe.materialLogistics.digest, "string");
  assert.equal("businessPhone" in safe.materialLogistics, false);
  assert.equal("businessEmail" in safe.materialLogistics, false);
});

test("material logistics support the three Business choices and no materials", () => {
  const base = {scheduledAt: "2026-09-03T12:30:00Z", location: "Staging location"};
  assert.equal(normalizeMaterialLogistics({...base, fulfillmentType: "scaler_pickup_print_shop",
    printingShopName: "Print Shop"}).fulfillmentType, "scaler_pickup_print_shop");
  assert.equal(normalizeMaterialLogistics({...base,
    fulfillmentType: "scaler_pickup_business"}).materialsRequired, true);
  assert.equal(normalizeMaterialLogistics({...base,
    fulfillmentType: "business_delivery"}).location, "Staging location");
  assert.deepEqual(normalizeMaterialLogistics({fulfillmentType: "no_materials_required"}), {
    fulfillmentType: "no_materials_required", materialsRequired: false,
    scheduledAt: null, windowEndAt: null, location: null, printingShopName: null,
    orderReference: null, instructions: null,
  });
  assert.equal(normalizeMaterialLogistics({...base, fulfillmentType: "business_pickup"})
    .fulfillmentType, "scaler_pickup_business");
  assert.throws(() => normalizeMaterialLogistics({...base,
    fulfillmentType: "scaler_pickup_print_shop"}), /Printing shop/);
});

test("only pre-receipt handoffs accept logistics rewrites", () => {
  assert.equal(canRewriteMaterialHandoff("scheduled"), true);
  assert.equal(canRewriteMaterialHandoff("scaler_en_route"), true);
  assert.equal(canRewriteMaterialHandoff("received"), false);
  assert.equal(canRewriteMaterialHandoff("handoff_in_progress"), false);
});

test("readiness acknowledgment remains separate from receipt", () => {
  assert.equal(readinessStatus({assignedCount: 4, requiredCount: 4,
    acknowledgedCount: 4, coordinationConfigured: true,
    materialsRequired: false, receivedCount: 0}).ready, true);
  assert.equal(readinessStatus({assignedCount: 4, requiredCount: 4,
    acknowledgedCount: 4, coordinationConfigured: true,
    materialsRequired: true, receivedCount: 3}).ready, false);
});

test("private Job Room membership excludes unassigned applicants", () => {
  const room = {businessId: "business", scalerIds: ["scaler-a", "scaler-b"]};
  assert.equal(isJobRoomMember({room, uid: "business"}), true);
  assert.equal(isJobRoomMember({room, uid: "scaler-a"}), true);
  assert.equal(isJobRoomMember({room, uid: "applicant"}), false);
  assert.equal(isJobRoomMember({room, uid: "support", isAdmin: true}), true);
});
