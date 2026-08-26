"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const smart = require("./smart_zone_planning");
const operations = require("./operational_layer");

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

test("public Baltimore demo is an exact maintained planner output", () => {
  const plan = smart.generatePlan({
    anchor: {latitude: 39.2949221, longitude: -76.68799185},
    desiredHours: 5,
    propertiesPerHour: 45,
    workType: "field_distribution",
    label: "Baltimore neighborhood demo",
    totalWorkerPayCents: 0,
  });
  assert.equal(plan.planId, "smart-zone_542b54c1fb1388f0f13740d7");
  assert.equal(plan.policyVersion, "SmartZonePlanningV2");
  assert.equal(plan.totalEstimatedProperties, 225);
  assert.equal(plan.totalEstimatedMinutes, 300);
  assert.equal(plan.recommendedScalerCount, 1);
  assert.equal(plan.zones[0].geometryValidation.valid, true);
  assert.deepEqual(plan.zones[0].geometry, [
    {latitude: 39.2930165, longitude: -76.6904542},
    {latitude: 39.2930165, longitude: -76.6855295},
    {latitude: 39.2968277, longitude: -76.6855295},
    {latitude: 39.2968277, longitude: -76.6904542},
  ]);
});

test("the six-hour assignment ceiling is the one planner and funding contract", () => {
  const cases = [
    [4, 1], [5.5, 1], [6, 1], [6.1, 2], [7, 2], [8, 2], [8.1, 2], [12, 2],
  ];
  for (const [hours, count] of cases) {
    const plan = smart.generatePlan({anchor, desiredHours: hours});
    assert.equal(plan.recommendedScalerCount, count, `${hours} hours`);
    assert.equal(plan.requiresSplit, count > 1, `${hours} hours split`);
    assert.ok(plan.zones.every((zone) =>
      zone.workload.estimatedMinutes <= smart.SINGLE_SCALER_MAX_MINUTES));
    assert.ok(plan.zones.every((zone) => zone.workability !== "too_large"));
    for (const zone of plan.zones) {
      const authoritative = operations.calculateGeometryWalkingEstimate(zone.geometry);
      assert.doesNotThrow(() => operations.assertZoneDuration(
        authoritative.estimatedWalkingMinutes));
      assert.equal(smart.paymentReadiness({
        serviceArea: zone.geometry,
        analysisStatus: "complete",
        estimatedHomes: zone.workload.estimatedProperties,
        serverEstimatedWalkingMinutes: authoritative.estimatedWalkingMinutes,
      }).ready, true);
    }
  }
  assert.equal(smart.workabilityForMinutes(318), "excellent");
  assert.equal(smart.workabilityForMinutes(361), "too_large");
});

test("work above six hours automatically splits before funding", () => {
  const nineHours = smart.generatePlan({anchor, desiredHours: 9.1});
  assert.equal(nineHours.requiresSplit, true);
  assert.equal(nineHours.recommendedScalerCount, 2);
  assert.equal(nineHours.zones.length, 2);
  assert.ok(nineHours.zones.every((zone) =>
    zone.workload.estimatedMinutes <= smart.SINGLE_SCALER_MAX_MINUTES));

  const eighteenHours = smart.generatePlan({anchor, desiredHours: 18});
  assert.equal(eighteenHours.recommendedScalerCount, 3);
  assert.equal(eighteenHours.zones.length, 3);
  const workloads = eighteenHours.zones.map((zone) => zone.workload.estimatedMinutes);
  assert.ok(Math.max(...workloads) - Math.min(...workloads) <= 2);
});

test("selected-area changes invalidate an otherwise identical plan", () => {
  const first = smart.generatePlan({anchor, desiredHours: 5, sourceAreaDigest: "area-a"});
  const changed = smart.generatePlan({anchor, desiredHours: 5, sourceAreaDigest: "area-b"});
  assert.notEqual(first.planId, changed.planId);
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
