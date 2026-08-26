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
  assert.equal(plan.policyVersion, "SmartZonePlanningV3");
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

function gridSnapshot({water = false, components = 1} = {}) {
  const serviceablePoints = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      serviceablePoints.push({
        latitude: 39.287 + row * 0.0008,
        longitude: -76.616 + column * 0.001,
        componentId: `road-${Math.min(components - 1, Math.floor(column / (8 / components)))}`,
        kind: column % 2 ? "property" : "local_road",
      });
    }
  }
  return {
    source: "openstreetmap_bounded_snapshot_v1",
    serviceablePoints,
    exclusionPolygons: water ? [[
      {latitude: 39.286, longitude: -76.6125},
      {latitude: 39.286, longitude: -76.6105},
      {latitude: 39.295, longitude: -76.6105},
      {latitude: 39.295, longitude: -76.6125},
    ]] : [],
    waterFeatureCount: water ? 1 : 0,
    barrierFeatureCount: components - 1,
  };
}

test("serviceable geography follows mapped points and excludes water", () => {
  const selectedBoundary = smart.rectangleAround(anchor, 1400, 1400);
  const snapshot = gridSnapshot({water: true, components: 2});
  const plan = smart.generatePlan({anchor, desiredHours: 12, selectedBoundary,
    geographicSnapshot: snapshot});
  assert.equal(plan.serviceabilityMode, "serviceable_geography");
  assert.equal(plan.geometryVersion, "serviceable_territory_v1");
  assert.equal(plan.zones.length, 2);
  assert.equal(plan.excludedWaterFeatureCount, 1);
  assert.ok(plan.zones.every((zone) => zone.geometryValidation.valid));
  assert.ok(plan.zones.every((zone) => zone.workload.estimatedMinutes <= 360));
  assert.ok(plan.zones.every((zone) => zone.geometry.some((point, index, geometry) =>
    index > 0 && point.latitude !== geometry[0].latitude &&
      point.longitude !== geometry[0].longitude)));
});

test("sparse geography fails honestly to Basic Area Estimate", () => {
  const plan = smart.generatePlan({anchor, desiredHours: 5,
    geographicSnapshot: {source: "openstreetmap_bounded_snapshot_v1",
      serviceablePoints: [anchor]}});
  assert.equal(plan.serviceabilityMode, "basic_area_estimate");
  assert.equal(plan.geometryVersion, "basic_area_estimate_v1");
  assert.match(plan.explanation, /Basic Area Estimate/);
});

test("mapped place boundary and park gap constrain serviceable shaping", () => {
  const snapshot = gridSnapshot();
  snapshot.serviceableBoundary = smart.rectangleAround(anchor, 900, 900);
  snapshot.serviceableBoundaryType = "mapped_place_boundary";
  snapshot.exclusionPolygons = [smart.rectangleAround(
    {latitude: 39.2898, longitude: -76.613}, 180, 180)];
  snapshot.parkFeatureCount = 1;
  const plan = smart.generatePlan({anchor, desiredHours: 5,
    selectedBoundary: smart.rectangleAround(anchor, 1400, 1400),
    geographicSnapshot: snapshot});
  assert.equal(plan.mappedBoundaryUsed, true);
  assert.equal(plan.mappedBoundaryType, "mapped_place_boundary");
  assert.equal(plan.excludedParkFeatureCount, 1);
  assert.equal(plan.serviceabilityMode, "serviceable_geography");
});

test("large territories scale to worker-sized Zones instead of one-worker rejection", () => {
  const expected = [[5, 1], [12, 2], [30, 5], [60, 10], [102, 17]];
  for (const [hours, zoneCount] of expected) {
    const plan = smart.generatePlan({anchor, desiredHours: hours});
    assert.equal(plan.zones.length, zoneCount, `${hours} hours`);
    assert.ok(plan.zones.every((zone) => zone.workload.estimatedMinutes <= 360));
    assert.equal(plan.fulfillment.campaignDesignLimitedBySupply, false);
  }
  assert.throws(() => smart.recommendedScalerCount(193 * 60), /campaign_capacity_exceeded/);
});

test("mapped place boundaries are workload-bounded before one-Scaler validation", () => {
  const cityBoundary = smart.rectangleAround(anchor, 4800, 4800);
  for (const [hours, zoneCount] of [[5, 1], [12, 2], [30, 5], [60, 10]]) {
    const plan = smart.generatePlan({anchor, selectedBoundary: cityBoundary,
      desiredHours: hours, sourceAreaDigest: "mapped-city"});
    assert.equal(plan.zones.length, zoneCount, `${hours} hours`);
    assert.ok(smart.polygonAreaSquareMeters(plan.selectedTerritory) >
      smart.polygonAreaSquareMeters(plan.plannedTerritory));
    for (const zone of plan.zones) {
      assert.equal(zone.geometryValidation.valid, true);
      assert.ok(zone.workload.estimatedMinutes <= smart.SINGLE_SCALER_MAX_MINUTES);
      const authoritative = operations.calculateGeometryWalkingEstimate(zone.geometry);
      assert.doesNotThrow(() => operations.assertZoneDuration(
        authoritative.estimatedWalkingMinutes));
    }
  }
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
