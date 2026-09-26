"use strict";

const planning = require('./smart_zone_planning');
const geography = require('./smart_zone_geography');

// Explicit preview input, never a saved campaign update. Preserve every vertex;
// the provider's 25 km² guard reports an oversized selection without shrinking it.
function normalizeAnalysisBoundary(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length < 3 || value.length > 1000) {
    throw Error('invalid_analysis_boundary');
  }
  const points = value.map(p => {
    const latitude = p?.latitude ?? p?.lat;
    const longitude = p?.longitude ?? p?.lng ?? p?.lon;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 85 || Math.abs(longitude) > 180) throw Error('invalid_analysis_boundary');
    return {latitude, longitude};
  });
  const same = (a, b) => a.latitude === b.latitude && a.longitude === b.longitude;
  const ring = same(points[0], points.at(-1)) ? points.slice(0, -1) : points;
  if (!planning.validateGeometry(ring).valid || !geography.simpleRing([...ring, ring[0]]) ||
      Math.max(...ring.map(p => p.longitude)) - Math.min(...ring.map(p => p.longitude)) > 180) {
    throw Error('invalid_analysis_boundary');
  }
  // Adjacent edges may meet, but may not double back over the same line.
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length];
    const cross = (a.longitude - b.longitude) * (c.latitude - b.latitude) -
      (a.latitude - b.latitude) * (c.longitude - b.longitude);
    const dot = (a.longitude - b.longitude) * (c.longitude - b.longitude) +
      (a.latitude - b.latitude) * (c.latitude - b.latitude);
    if (Math.abs(cross) <= 1e-16 && dot > 0) throw Error('invalid_analysis_boundary');
  }
  return points;
}

function text(value, maximum = 180) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function normalizeAreaSelection(value) {
  if (!value || typeof value !== "object") return null;
  const query = text(value.query);
  const resultId = text(value.resultId, 240);
  if (query.length < 2 || !resultId) throw new Error("invalid_area_selection");
  return {query, resultId};
}

function selectResolvedArea(selection, resolution) {
  const results = Array.isArray(resolution?.results) ? resolution.results : [];
  const match = results.find((result) => String(result?.id || "") === selection.resultId);
  if (!match) throw new Error("area_boundary_unavailable");
  const geometry = Array.isArray(match.geometry) ? match.geometry.filter((point) =>
    Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude))) : [];
  const latitude = Number(match.latitude); const longitude = Number(match.longitude);
  if (geometry.length < 3 && (!Number.isFinite(latitude) || !Number.isFinite(longitude))) {
    throw new Error("area_boundary_unavailable");
  }
  return {
    geometry: geometry.map((point) => ({
      latitude: Number(point.latitude), longitude: Number(point.longitude),
    })),
    name: text(match.fullAddress || match.primaryText, 240) || "Selected campaign area",
    resultId: String(match.id),
    resolutionSource: text(match.resolutionSource, 80),
    resolutionVersion: text(match.resolutionVersion, 80),
    geographyType: text(match.geographyType || match.placeType, 80),
    bounds: match.bounds || null,
    canUseAddressRadius: isExplicitStreetAddress(selection.query, match),
    center: {latitude, longitude},
  };
}

function isExplicitStreetAddress(query, match = {}) {
  const kind = text(match.geographyType || match.placeType, 80).toLowerCase();
  if (/^(zcta|postcode|postal_code|city|town|village|municipality|county|neighbourhood|neighborhood|quarter|suburb)$/.test(kind)) return false;
  // A five-digit ZIP label is a location context, not a street address. A
  // missing place boundary must never silently become an address-size square.
  if (/^\d{5}(?:-\d{4})?(?:\s*,|\s*$)/.test(text(query))) return false;
  return /^\d+[a-z]?(?:[-/]\d+[a-z]?)?\s+.+\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|way|circle|cir|boulevard|blvd|place|pl|terrace|ter|trail|trl|parkway|pkwy)\b/i.test(text(query));
}

function workloadHours(value = 5) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 192) throw Error('campaign_workload_invalid');
  return hours;
}
function planningFailure(error) {
  if (error?.message === 'manual_zone_review_required') return {code: 'failed-precondition',
    message: 'There is not enough reliable geographic evidence to apply practical Zones. Choose Adjust Area or Draw My Area to review it.'};
  if (error?.message === 'campaign_workload_invalid') return {code: 'invalid-argument',
    message: 'Choose estimated work from 30 minutes to 192 hours.'};
  if (error?.message === 'selected_area_cannot_fit_workload_boundary') return {code: 'failed-precondition',
    message: 'Choose or draw a smaller campaign territory inside your service area. Your saved area is unchanged.'};
  return {code: 'unavailable', message: 'We could not prepare workable Zones for this area. Keep your selection and try again, or draw a smaller territory.'};
}
module.exports = {normalizeAnalysisBoundary, normalizeAreaSelection, selectResolvedArea, isExplicitStreetAddress, workloadHours, planningFailure};
