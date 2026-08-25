"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const smart = require("./smart_zone_planning");

const anchor = {latitude: 39.2904, longitude: -76.6122};

test("generated geometry is deterministic, distinct, and non-zero", () => {
  const first = smart.generatePlan({anchor, desiredHours: 5});
  const second = smart.generatePlan({anchor, desiredHours: 5});
  assert.deepEqual(first, second);
  assert.equal(first.zones.length, 1);
  assert.equal(first.zones[0].geometryValidation.valid, true);
  assert.equal(new Set(first.zones[0].geometry.map((item) =>
    `${item.latitude}:${item.longitude}`)).size, 4);
  assert.ok(first.zones[0].geometryValidation.areaSquareMeters > 0);
});

test("under-target and ideal workloads remain one Scaler recommendations", () => {
  assert.equal(smart.recommendedScalerCount(180), 1);
  assert.equal(smart.recommendedScalerCount(240), 1);
  assert.equal(smart.recommendedScalerCount(360), 1);
  assert.equal(smart.recommendedScalerCount(480), 2);
  assert.equal(smart.workabilityForMinutes(318), "excellent");
});

test("over eight hours automatically splits toward balanced five-hour Zones", () => {
  const nineHours = smart.generatePlan({anchor, desiredHours: 9.1});
  assert.equal(nineHours.requiresSplit, true);
  assert.equal(nineHours.recommendedScalerCount, 2);
  assert.equal(nineHours.zones.length, 2);
  assert.ok(nineHours.zones.every((zone) => zone.workload.estimatedMinutes <= 480));

  const eighteenHours = smart.generatePlan({anchor, desiredHours: 18});
  assert.equal(eighteenHours.recommendedScalerCount, 3);
  assert.equal(eighteenHours.zones.length, 3);
  const workloads = eighteenHours.zones.map((zone) => zone.workload.estimatedMinutes);
  assert.ok(Math.max(...workloads) - Math.min(...workloads) <= 2);
});

test("invalid and identical-point geometry is rejected", () => {
  const identical = Array.from({length: 4}, () => anchor);
  assert.equal(smart.validateGeometry(identical).valid, false);
  assert.equal(smart.validateGeometry(identical).reason, "distinct_points_required");
  assert.equal(smart.validateGeometry([anchor]).valid, false);
});

test("analysis and payment readiness fail closed", () => {
  const plan = smart.generatePlan({anchor, desiredHours: 5});
  const zone = {serviceArea: plan.zones[0].geometry, analysisStatus: "complete",
    estimatedHomes: plan.zones[0].workload.estimatedProperties,
    serverEstimatedWalkingMinutes: plan.zones[0].workload.estimatedMinutes};
  assert.equal(smart.paymentReadiness(zone).ready, true);
  assert.equal(smart.paymentReadiness({...zone, analysisStatus: "failed"}).reason,
    "analysis_required");
  assert.equal(smart.paymentReadiness({...zone, estimatedHomes: 0}).reason,
    "positive_home_estimate_required");
  assert.equal(smart.paymentReadiness({...zone, serverEstimatedWalkingMinutes: 900}).reason,
    "automatic_split_required");
});

test("manual valid Zones remain compatible after revalidation", () => {
  const geometry = smart.rectangleAround(anchor, 90, 120);
  assert.equal(smart.validateGeometry(geometry).valid, true);
  const workload = smart.estimateWorkload({estimatedProperties: 180,
    estimatedWalkingMeters: 2500});
  assert.ok(workload.estimatedMinutes > 0);
  assert.ok(["low", "medium"].includes(workload.confidence));
});

test("compensation guidance warns without guaranteeing acceptance", () => {
  const weak = smart.generatePlan({anchor, desiredHours: 5, totalWorkerPayCents: 500});
  assert.equal(weak.compensation.attractiveness, "low_acceptance_likelihood");
  assert.ok(weak.compensation.suggestions.includes("reduce_zone_size"));
  const competitive = smart.generatePlan({anchor, desiredHours: 5,
    totalWorkerPayCents: weak.compensation.recommendedWorkerPayCents});
  assert.equal(competitive.compensation.attractiveness, "competitive");
});
