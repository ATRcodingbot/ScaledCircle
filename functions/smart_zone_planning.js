"use strict";

const crypto = require("node:crypto");

const POLICY_VERSION = "SmartZonePlanningV2";
const GEOMETRY_VERSION = "smart_zone_rectangle_v1";
const IDEAL_MINUTES = 240;
const IDEAL_TARGET_MINUTES = 300;
// One product contract: every recommended or fundable single-Scaler Zone must
// fit the same six-hour ceiling enforced by authoritative assignment.
const SINGLE_SCALER_MAX_MINUTES = 360;
const MIN_PROPERTIES = 1;
const DEFAULT_PROPERTIES_PER_HOUR = 45;
const METERS_PER_DEGREE_LATITUDE = 111320;

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name}_invalid`);
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeAnchor(anchor) {
  const latitude = finite(anchor?.latitude, "anchor_latitude");
  const longitude = finite(anchor?.longitude, "anchor_longitude");
  if (latitude < -85 || latitude > 85 || longitude < -180 || longitude > 180) {
    throw new Error("anchor_out_of_range");
  }
  return {latitude, longitude};
}

function point(latitude, longitude) {
  return {latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7))};
}

function rectangleAround(anchorInput, widthMeters, heightMeters) {
  const anchor = normalizeAnchor(anchorInput);
  const width = clamp(finite(widthMeters, "width_meters"), 25, 10000);
  const height = clamp(finite(heightMeters, "height_meters"), 25, 10000);
  const latitudeDelta = height / METERS_PER_DEGREE_LATITUDE / 2;
  const longitudeMeters = METERS_PER_DEGREE_LATITUDE * Math.cos(anchor.latitude * Math.PI / 180);
  const longitudeDelta = width / longitudeMeters / 2;
  return [
    point(anchor.latitude - latitudeDelta, anchor.longitude - longitudeDelta),
    point(anchor.latitude - latitudeDelta, anchor.longitude + longitudeDelta),
    point(anchor.latitude + latitudeDelta, anchor.longitude + longitudeDelta),
    point(anchor.latitude + latitudeDelta, anchor.longitude - longitudeDelta),
  ];
}

function localMeters(points) {
  const normalized = points.map(normalizeAnchor);
  if (normalized.length < 3) throw new Error("geometry_requires_three_points");
  const centerLatitude = normalized.reduce((sum, item) => sum + item.latitude, 0) /
    normalized.length;
  const longitudeMeters = METERS_PER_DEGREE_LATITUDE *
    Math.cos(centerLatitude * Math.PI / 180);
  return normalized.map((item) => ({
    x: item.longitude * longitudeMeters,
    y: item.latitude * METERS_PER_DEGREE_LATITUDE,
  }));
}

function polygonAreaSquareMeters(points) {
  const local = localMeters(points);
  let twiceArea = 0;
  for (let index = 0; index < local.length; index += 1) {
    const current = local[index];
    const next = local[(index + 1) % local.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

function validateGeometry(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return {valid: false, reason: "at_least_three_points_required"};
  }
  let normalized;
  try {
    normalized = points.map(normalizeAnchor);
  } catch (error) {
    return {valid: false, reason: error.message};
  }
  const unique = new Set(normalized.map((item) =>
    `${item.latitude.toFixed(7)}:${item.longitude.toFixed(7)}`));
  if (unique.size < 3) return {valid: false, reason: "distinct_points_required"};
  const areaSquareMeters = polygonAreaSquareMeters(normalized);
  if (!Number.isFinite(areaSquareMeters) || areaSquareMeters < 100) {
    return {valid: false, reason: "non_zero_area_required", areaSquareMeters};
  }
  return {valid: true, areaSquareMeters, pointCount: normalized.length};
}

function estimateWorkload({estimatedProperties, estimatedWalkingMeters,
  propertiesPerHour = DEFAULT_PROPERTIES_PER_HOUR, workType = "field_distribution"} = {}) {
  const properties = Math.max(MIN_PROPERTIES, Math.round(finite(
    estimatedProperties, "estimated_properties")));
  const pace = clamp(finite(propertiesPerHour, "properties_per_hour"), 10, 120);
  const walkingMeters = Math.max(0, Number(estimatedWalkingMeters) || 0);
  const serviceMinutes = properties / pace * 60;
  const walkingMinutes = walkingMeters > 0 ? walkingMeters / 80 : 0;
  const evidenceFactor = new Set(["yard_cleanup", "yard_sign_installation"]).has(workType) ? 1.2 : 1;
  const estimatedMinutes = Math.max(15, Math.ceil((serviceMinutes + walkingMinutes) * evidenceFactor));
  const confidence = walkingMeters > 0 ? "medium" : "low";
  return Object.freeze({
    estimatedProperties: properties,
    estimatedWalkingMeters: walkingMeters || null,
    estimatedMinutes,
    estimatedHours: Number((estimatedMinutes / 60).toFixed(1)),
    confidence,
    reason: walkingMeters > 0 ? null : "Route distance is not available yet; a conservative property pace was used.",
    version: POLICY_VERSION,
  });
}

function recommendedScalerCount(estimatedMinutes) {
  const minutes = Math.ceil(finite(estimatedMinutes, "estimated_minutes"));
  if (minutes <= SINGLE_SCALER_MAX_MINUTES) return 1;
  return Math.max(2, Math.ceil(minutes / SINGLE_SCALER_MAX_MINUTES));
}

function workabilityForMinutes(minutes) {
  if (minutes <= IDEAL_TARGET_MINUTES + 60 && minutes >= IDEAL_MINUTES) return "excellent";
  if (minutes <= SINGLE_SCALER_MAX_MINUTES) return "good";
  return "too_large";
}

function splitRectangle(points, count) {
  const validation = validateGeometry(points);
  if (!validation.valid) throw new Error(validation.reason);
  const workerCount = Math.max(1, Math.min(12, Math.ceil(finite(count, "zone_count"))));
  const latitudes = points.map((item) => Number(item.latitude));
  const longitudes = points.map((item) => Number(item.longitude));
  const south = Math.min(...latitudes); const north = Math.max(...latitudes);
  const west = Math.min(...longitudes); const east = Math.max(...longitudes);
  const splitLongitude = east - west >= north - south;
  return Array.from({length: workerCount}, (_, index) => {
    const start = index / workerCount; const end = (index + 1) / workerCount;
    return splitLongitude ? [
      point(south, west + (east - west) * start),
      point(south, west + (east - west) * end),
      point(north, west + (east - west) * end),
      point(north, west + (east - west) * start),
    ] : [
      point(south + (north - south) * start, west),
      point(south + (north - south) * start, east),
      point(south + (north - south) * end, east),
      point(south + (north - south) * end, west),
    ];
  });
}

function planId(input) {
  return `smart-zone_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24)}`;
}

function generatePlan({anchor, desiredHours = 5, propertiesPerHour = DEFAULT_PROPERTIES_PER_HOUR,
  workType = "field_distribution", label = "Recommended Area",
  totalWorkerPayCents = null, sourceAreaDigest = null} = {}) {
  const normalizedAnchor = normalizeAnchor(anchor);
  const hours = clamp(finite(desiredHours, "desired_hours"), 0.5, 48);
  const totalProperties = Math.max(1, Math.round(hours * propertiesPerHour));
  // A conservative urban/suburban planning density. This is explicitly a low-confidence
  // pre-route planning estimate and is replaced when authoritative geography is available.
  const targetAreaSquareMeters = Math.max(2500, totalProperties * 800);
  const sideMeters = Math.sqrt(targetAreaSquareMeters);
  const boundary = rectangleAround(normalizedAnchor, sideMeters, sideMeters);
  const total = estimateWorkload({estimatedProperties: totalProperties,
    propertiesPerHour, workType});
  const count = recommendedScalerCount(total.estimatedMinutes);
  const payCents = Number(totalWorkerPayCents);
  const recommendedPayCents = Math.ceil(total.estimatedMinutes / 60 * 2500 / 500) * 500;
  const compensation = Number.isSafeInteger(payCents) && payCents >= 0 ? {
    workerPayCents: payCents,
    recommendedWorkerPayCents: recommendedPayCents,
    attractiveness: payCents >= recommendedPayCents ? "competitive" : "low_acceptance_likelihood",
    suggestions: payCents >= recommendedPayCents ? [] :
      ["increase_compensation", "add_completion_bonus", "reduce_zone_size"],
  } : {workerPayCents: null, recommendedWorkerPayCents: recommendedPayCents,
    attractiveness: "review_compensation", suggestions: ["review_compensation"]};
  const geometries = splitRectangle(boundary, count);
  const baseProperties = Math.floor(totalProperties / count);
  let remainder = totalProperties % count;
  const zones = geometries.map((geometry, index) => {
    const estimatedProperties = baseProperties + (remainder-- > 0 ? 1 : 0);
    const workload = estimateWorkload({estimatedProperties, propertiesPerHour, workType});
    return Object.freeze({
      zoneNumber: index + 1,
      name: `Zone ${String.fromCharCode(65 + index)}`,
      geometry,
      geometryValidation: validateGeometry(geometry),
      workload,
      recommendedScalers: 1,
      workability: workabilityForMinutes(workload.estimatedMinutes),
    });
  });
  const identity = {anchor: normalizedAnchor, desiredHours: hours, propertiesPerHour,
    workType, totalWorkerPayCents: compensation.workerPayCents,
    sourceAreaDigest: String(sourceAreaDigest || "anchor_only"), policyVersion: POLICY_VERSION};
  return Object.freeze({
    planId: planId(identity), label, anchor: normalizedAnchor, desiredHours: hours,
    totalEstimatedProperties: totalProperties,
    totalEstimatedMinutes: total.estimatedMinutes,
    totalEstimatedHours: total.estimatedHours,
    recommendedScalerCount: count,
    requiresSplit: count > 1,
    explanation: "Balanced around the selected service-area anchor using conservative property and workload defaults.",
    confidence: "low",
    unsupportedData: ["live_worker_availability", "historical_conversion_performance", "real_time_weather"],
    compensation,
    zones,
    policyVersion: POLICY_VERSION,
    geometryVersion: GEOMETRY_VERSION,
  });
}

function paymentReadiness(zone) {
  const geometry = validateGeometry(zone?.serviceArea || zone?.geometry || []);
  const estimatedHomes = Number(zone?.estimatedHomes || 0);
  const minutes = Number(zone?.serverEstimatedWalkingMinutes || zone?.estimatedWorkMinutes || 0);
  const ready = geometry.valid && zone?.analysisStatus === "complete" &&
    Number.isSafeInteger(estimatedHomes) && estimatedHomes > 0 &&
    Number.isFinite(minutes) && minutes > 0 && minutes <= SINGLE_SCALER_MAX_MINUTES;
  return {ready, geometry, estimatedHomes, estimatedMinutes: minutes,
    reason: !geometry.valid ? geometry.reason : zone?.analysisStatus !== "complete" ?
      "analysis_required" : estimatedHomes <= 0 ? "positive_home_estimate_required" :
      minutes <= 0 ? "workload_estimate_required" : minutes > SINGLE_SCALER_MAX_MINUTES ?
        "automatic_split_required" : null};
}

module.exports = {POLICY_VERSION, GEOMETRY_VERSION, IDEAL_MINUTES,
  IDEAL_TARGET_MINUTES, SINGLE_SCALER_MAX_MINUTES,
  rectangleAround, polygonAreaSquareMeters, validateGeometry, estimateWorkload,
  recommendedScalerCount, workabilityForMinutes, splitRectangle, generatePlan,
  paymentReadiness};
