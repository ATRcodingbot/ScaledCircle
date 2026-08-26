"use strict";

const crypto = require("node:crypto");
const POLICY_VERSION = "SmartZonePlanningV3";
const GEOMETRY_VERSION = "serviceable_territory_v1";
const FALLBACK_GEOMETRY_VERSION = "basic_area_estimate_v1";
const IDEAL_MINUTES = 240;
const IDEAL_TARGET_MINUTES = 300;
const SINGLE_SCALER_MAX_MINUTES = 360;
const MAX_ZONES_PER_CAMPAIGN = 32;
const MAX_CAMPAIGN_MINUTES = MAX_ZONES_PER_CAMPAIGN * SINGLE_SCALER_MAX_MINUTES;
const DEFAULT_PROPERTIES_PER_HOUR = 45;
const METERS_PER_DEGREE_LATITUDE = 111320;

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name}_invalid`);
  return number;
}
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function normalizeAnchor(value) {
  const latitude = finite(value?.latitude ?? value?.lat, "anchor_latitude");
  const longitude = finite(value?.longitude ?? value?.lon, "anchor_longitude");
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
  const width = clamp(finite(widthMeters, "width_meters"), 25, 25000);
  const height = clamp(finite(heightMeters, "height_meters"), 25, 25000);
  const latDelta = height / METERS_PER_DEGREE_LATITUDE / 2;
  const longitudeMeters = METERS_PER_DEGREE_LATITUDE * Math.cos(anchor.latitude * Math.PI / 180);
  const lonDelta = width / longitudeMeters / 2;
  return [point(anchor.latitude - latDelta, anchor.longitude - lonDelta),
    point(anchor.latitude - latDelta, anchor.longitude + lonDelta),
    point(anchor.latitude + latDelta, anchor.longitude + lonDelta),
    point(anchor.latitude + latDelta, anchor.longitude - lonDelta)];
}
function polygonAreaSquareMeters(points) {
  const normalized = points.map(normalizeAnchor);
  if (normalized.length < 3) throw new Error("geometry_requires_three_points");
  const centerLatitude = normalized.reduce((sum, item) => sum + item.latitude, 0) /
    normalized.length;
  const longitudeMeters = METERS_PER_DEGREE_LATITUDE * Math.cos(centerLatitude * Math.PI / 180);
  const local = normalized.map((item) => ({x: item.longitude * longitudeMeters,
    y: item.latitude * METERS_PER_DEGREE_LATITUDE}));
  let twiceArea = 0;
  for (let i = 0; i < local.length; i += 1) {
    const next = local[(i + 1) % local.length];
    twiceArea += local[i].x * next.y - next.x * local[i].y;
  }
  return Math.abs(twiceArea) / 2;
}
function validateGeometry(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return {valid: false, reason: "at_least_three_points_required"};
  }
  let normalized;
  try { normalized = points.map(normalizeAnchor); } catch (error) {
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
function pointInsidePolygon(candidate, polygon) {
  const p = normalizeAnchor(candidate); const boundary = polygon.map(normalizeAnchor);
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const a = boundary[i]; const b = boundary[j];
    const crosses = (a.latitude > p.latitude) !== (b.latitude > p.latitude);
    if (crosses && p.longitude < (b.longitude - a.longitude) *
      (p.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude) inside = !inside;
  }
  return inside;
}
function convexHull(points) {
  const unique = [...new Map(points.map(normalizeAnchor).map((item) =>
    [`${item.latitude.toFixed(7)}:${item.longitude.toFixed(7)}`, item])).values()];
  if (unique.length < 3) return unique;
  const sorted = unique.sort((a, b) => a.longitude - b.longitude || a.latitude - b.latitude);
  const cross = (o, a, b) => (a.longitude - o.longitude) * (b.latitude - o.latitude) -
    (a.latitude - o.latitude) * (b.longitude - o.longitude);
  const half = (items) => { const result = []; for (const item of items) {
    while (result.length >= 2 && cross(result.at(-2), result.at(-1), item) <= 0) result.pop();
    result.push(item);
  } return result; };
  return half(sorted).slice(0, -1).concat(half([...sorted].reverse()).slice(0, -1))
    .map((item) => point(item.latitude, item.longitude));
}
function bufferedHull(points, fallbackAnchor) {
  const normalized = points.map(normalizeAnchor); const hull = convexHull(normalized);
  if (hull.length < 3) {
    const center = normalized.length ? {latitude: normalized.reduce((s, p) => s + p.latitude, 0) /
      normalized.length, longitude: normalized.reduce((s, p) => s + p.longitude, 0) /
      normalized.length} : fallbackAnchor;
    return rectangleAround(center, 90, 90);
  }
  const center = {latitude: hull.reduce((s, p) => s + p.latitude, 0) / hull.length,
    longitude: hull.reduce((s, p) => s + p.longitude, 0) / hull.length};
  const lonMeters = METERS_PER_DEGREE_LATITUDE * Math.cos(center.latitude * Math.PI / 180);
  return hull.map((item) => { const dx = (item.longitude - center.longitude) * lonMeters;
    const dy = (item.latitude - center.latitude) * METERS_PER_DEGREE_LATITUDE;
    const distance = Math.max(1, Math.hypot(dx, dy));
    return point(item.latitude + dy / distance * 18 / METERS_PER_DEGREE_LATITUDE,
      item.longitude + dx / distance * 18 / lonMeters); });
}
function estimateWorkload({estimatedProperties, estimatedWalkingMeters,
  propertiesPerHour = DEFAULT_PROPERTIES_PER_HOUR, workType = "field_distribution"} = {}) {
  const properties = Math.max(1, Math.round(finite(estimatedProperties, "estimated_properties")));
  const pace = clamp(finite(propertiesPerHour, "properties_per_hour"), 10, 120);
  const walkingMeters = Math.max(0, Number(estimatedWalkingMeters) || 0);
  const factor = new Set(["yard_cleanup", "yard_sign_installation"]).has(workType) ? 1.2 : 1;
  const estimatedMinutes = Math.max(15, Math.ceil((properties / pace * 60 +
    (walkingMeters > 0 ? walkingMeters / 80 : 0)) * factor));
  return Object.freeze({estimatedProperties: properties, estimatedWalkingMeters: walkingMeters || null,
    estimatedMinutes, estimatedHours: Number((estimatedMinutes / 60).toFixed(1)),
    confidence: walkingMeters > 0 ? "medium" : "low",
    reason: walkingMeters > 0 ? null :
      "Route distance is not available yet; a conservative property pace was used.",
    version: POLICY_VERSION});
}
function recommendedScalerCount(minutesInput) {
  const minutes = Math.ceil(finite(minutesInput, "estimated_minutes"));
  if (minutes > MAX_CAMPAIGN_MINUTES) throw new Error("campaign_capacity_exceeded");
  return Math.max(1, Math.ceil(minutes / SINGLE_SCALER_MAX_MINUTES));
}
function workabilityForMinutes(minutes) {
  if (minutes >= IDEAL_MINUTES && minutes <= SINGLE_SCALER_MAX_MINUTES) return "excellent";
  return minutes <= SINGLE_SCALER_MAX_MINUTES ? "good" : "too_large";
}
function splitRectangle(points, count) {
  if (!validateGeometry(points).valid) throw new Error("invalid_geometry");
  const size = Math.max(1, Math.min(MAX_ZONES_PER_CAMPAIGN, Math.ceil(finite(count, "zone_count"))));
  const lat = points.map((p) => Number(p.latitude)); const lon = points.map((p) => Number(p.longitude));
  const south = Math.min(...lat); const north = Math.max(...lat);
  const west = Math.min(...lon); const east = Math.max(...lon);
  const vertical = east - west >= north - south;
  return Array.from({length: size}, (_, i) => { const a = i / size; const b = (i + 1) / size;
    return vertical ? [point(south, west + (east - west) * a), point(south, west + (east - west) * b),
      point(north, west + (east - west) * b), point(north, west + (east - west) * a)] :
      [point(south + (north - south) * a, west), point(south + (north - south) * a, east),
        point(south + (north - south) * b, east), point(south + (north - south) * b, west)]; });
}
function filteredServiceablePoints(snapshot, boundary) {
  const exclusions = Array.isArray(snapshot?.exclusionPolygons) ? snapshot.exclusionPolygons : [];
  const mappedBoundary = Array.isArray(snapshot?.serviceableBoundary) &&
    validateGeometry(snapshot.serviceableBoundary).valid ? snapshot.serviceableBoundary : null;
  return (Array.isArray(snapshot?.serviceablePoints) ? snapshot.serviceablePoints : [])
    .map((item) => ({...normalizeAnchor(item), componentId: String(item.componentId || "unknown"),
      kind: String(item.kind || "road")}))
    .filter((item) => pointInsidePolygon(item, boundary))
    .filter((item) => !mappedBoundary || pointInsidePolygon(item, mappedBoundary))
    .filter((item) => !exclusions.some((polygon) => Array.isArray(polygon) && polygon.length >= 3 &&
      pointInsidePolygon(item, polygon)))
    .sort((a, b) => a.componentId.localeCompare(b.componentId) ||
      a.longitude - b.longitude || a.latitude - b.latitude);
}
function splitServiceablePoints(points, count) {
  const groups = new Map();
  for (const item of points) { if (!groups.has(item.componentId)) groups.set(item.componentId, []);
    groups.get(item.componentId).push(item); }
  const flattened = [...groups.values()].sort((a, b) => b.length - a.length ||
    a[0].componentId.localeCompare(b[0].componentId)).flatMap((items) => {
    const lat = items.map((p) => p.latitude); const lon = items.map((p) => p.longitude);
    const horizontal = Math.max(...lon) - Math.min(...lon) >= Math.max(...lat) - Math.min(...lat);
    return [...items].sort((a, b) => horizontal ? a.longitude - b.longitude ||
      a.latitude - b.latitude : a.latitude - b.latitude || a.longitude - b.longitude);
  });
  return Array.from({length: count}, (_, i) => flattened.slice(
    Math.floor(i * flattened.length / count),
    Math.max(Math.floor(i * flattened.length / count) + 1,
      Math.floor((i + 1) * flattened.length / count))));
}
function planId(input) { return `smart-zone_${crypto.createHash("sha256")
  .update(JSON.stringify(input)).digest("hex").slice(0, 24)}`; }
function generatePlan({anchor, selectedBoundary = null, geographicSnapshot = null,
  desiredHours = 5, propertiesPerHour = DEFAULT_PROPERTIES_PER_HOUR,
  workType = "field_distribution", label = "Recommended Area",
  totalWorkerPayCents = null, sourceAreaDigest = null} = {}) {
  const normalizedAnchor = normalizeAnchor(anchor);
  const hours = clamp(finite(desiredHours, "desired_hours"), 0.5, MAX_CAMPAIGN_MINUTES / 60);
  const totalProperties = Math.max(1, Math.round(hours * propertiesPerHour));
  const total = estimateWorkload({estimatedProperties: totalProperties, propertiesPerHour, workType});
  const count = recommendedScalerCount(total.estimatedMinutes);
  const side = Math.sqrt(totalProperties * 800);
  const boundary = Array.isArray(selectedBoundary) && validateGeometry(selectedBoundary).valid ?
    selectedBoundary.map(normalizeAnchor) : rectangleAround(normalizedAnchor, side, side);
  const usable = filteredServiceablePoints(geographicSnapshot, boundary);
  const geographic = usable.length >= Math.max(6, count * 3);
  const groups = geographic ? splitServiceablePoints(usable, count) : [];
  const geometries = geographic ? groups.map((items) => bufferedHull(items, normalizedAnchor)) :
    splitRectangle(boundary, count);
  const pay = Number(totalWorkerPayCents);
  const recommendedPay = Math.ceil(total.estimatedMinutes / 60 * 2500 / 500) * 500;
  const compensation = Number.isSafeInteger(pay) && pay >= 0 ? {workerPayCents: pay,
    recommendedWorkerPayCents: recommendedPay,
    attractiveness: pay >= recommendedPay ? "competitive" : "low_acceptance_likelihood",
    suggestions: pay >= recommendedPay ? [] :
      ["increase_compensation", "add_completion_bonus", "reduce_zone_size"]} :
    {workerPayCents: null, recommendedWorkerPayCents: recommendedPay,
      attractiveness: "review_compensation", suggestions: ["review_compensation"]};
  const base = Math.floor(totalProperties / count); let remainder = totalProperties % count;
  const zones = geometries.map((geometry, index) => { const estimatedProperties = base +
    (remainder-- > 0 ? 1 : 0); const workload = estimateWorkload({estimatedProperties,
      propertiesPerHour, workType}); return Object.freeze({zoneNumber: index + 1,
      name: `Zone ${index + 1}`, geometry, geometryValidation: validateGeometry(geometry), workload,
      recommendedScalers: 1, workability: workabilityForMinutes(workload.estimatedMinutes),
      serviceability: geographic ? "serviceable_geography" : "basic_area_estimate",
      sourceComponentIds: geographic ? [...new Set(groups[index].map((p) => p.componentId))] : []}); });
  const snapshotDigest = geographic ? crypto.createHash("sha256").update(JSON.stringify({
    points: usable, exclusions: geographicSnapshot?.exclusionPolygons || [],
    source: geographicSnapshot?.source || null})).digest("hex") : "basic_area_estimate";
  const identity = {anchor: normalizedAnchor, desiredHours: hours, propertiesPerHour, workType,
    totalWorkerPayCents: compensation.workerPayCents,
    sourceAreaDigest: String(sourceAreaDigest || "anchor_only"), snapshotDigest,
    policyVersion: POLICY_VERSION};
  return Object.freeze({planId: planId(identity), label, anchor: normalizedAnchor,
    selectedTerritory: boundary, desiredHours: hours, totalEstimatedProperties: totalProperties,
    totalEstimatedMinutes: total.estimatedMinutes, totalEstimatedHours: total.estimatedHours,
    recommendedScalerCount: count, requiresSplit: count > 1,
    serviceabilityMode: geographic ? "serviceable_geography" : "basic_area_estimate",
    explanation: geographic ?
      "Shaped from bounded mapped properties and connected local-road geography, then balanced by workload." :
      "Geographic detail was insufficient, so this is a Basic Area Estimate. Review it with Advanced Edit.",
    confidence: geographic ? "medium" : "low",
    geographicSource: geographic ? String(geographicSnapshot?.source || "maintained_geography") : null,
    mappedBoundaryUsed: geographic && Array.isArray(geographicSnapshot?.serviceableBoundary),
    mappedBoundaryType: geographic ? geographicSnapshot?.serviceableBoundaryType || null : null,
    excludedWaterFeatureCount: geographic ? Number(geographicSnapshot?.waterFeatureCount || 0) : 0,
    excludedParkFeatureCount: geographic ? Number(geographicSnapshot?.parkFeatureCount || 0) : 0,
    barrierFeatureCount: geographic ? Number(geographicSnapshot?.barrierFeatureCount || 0) : 0,
    unsupportedData: ["pedestrian_route", "live_worker_availability",
      "historical_conversion_performance", "real_time_weather"],
    fulfillment: {recommendedZones: count, availableScalerCount: null,
      availabilityStatus: "not_evaluated", campaignDesignLimitedBySupply: false},
    compensation, zones, policyVersion: POLICY_VERSION,
    geometryVersion: geographic ? GEOMETRY_VERSION : FALLBACK_GEOMETRY_VERSION,
    practicalMaximumZones: MAX_ZONES_PER_CAMPAIGN});
}
function paymentReadiness(zone) {
  const geometry = validateGeometry(zone?.serviceArea || zone?.geometry || []);
  const homes = Number(zone?.estimatedHomes || 0);
  const minutes = Number(zone?.serverEstimatedWalkingMinutes || zone?.estimatedWorkMinutes || 0);
  const ready = geometry.valid && zone?.analysisStatus === "complete" &&
    Number.isSafeInteger(homes) && homes > 0 && Number.isFinite(minutes) &&
    minutes > 0 && minutes <= SINGLE_SCALER_MAX_MINUTES;
  return {ready, geometry, estimatedHomes: homes, estimatedMinutes: minutes,
    reason: !geometry.valid ? geometry.reason : zone?.analysisStatus !== "complete" ?
      "analysis_required" : homes <= 0 ? "positive_home_estimate_required" : minutes <= 0 ?
        "workload_estimate_required" : minutes > SINGLE_SCALER_MAX_MINUTES ?
          "automatic_split_required" : null};
}

module.exports = {POLICY_VERSION, GEOMETRY_VERSION, FALLBACK_GEOMETRY_VERSION,
  IDEAL_MINUTES, IDEAL_TARGET_MINUTES, SINGLE_SCALER_MAX_MINUTES,
  MAX_ZONES_PER_CAMPAIGN, MAX_CAMPAIGN_MINUTES, rectangleAround,
  polygonAreaSquareMeters, validateGeometry, pointInsidePolygon, convexHull,
  estimateWorkload, recommendedScalerCount, workabilityForMinutes, splitRectangle,
  splitServiceablePoints, generatePlan, paymentReadiness};
