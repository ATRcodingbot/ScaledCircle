"use strict";

const GEOMETRY_ENCODING = "map-parts-v1";
function point(value) {
  const latitude = Number(value?.latitude); const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 ||
      latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {latitude, longitude};
}
function points(value) { return Array.isArray(value) ? value.map(point).filter(Boolean) : []; }
function runtimeParts(area) {
  const geometry = points(area?.geometry?.points || area?.geometry);
  const parts = Array.isArray(area?.geometryParts) ? area.geometryParts.map((part) =>
    points(part?.points || part)).filter((part) => part.length >= 3) : [];
  return {geometry, geometryParts: parts.length ? parts : (geometry.length >= 3 ? [geometry] : [])};
}
function encodeServiceAreaGeometryForFirestore(area) {
  const normalized = runtimeParts(area);
  return {...area, geometryEncoding: GEOMETRY_ENCODING, geometry: {points: normalized.geometry},
    geometryParts: normalized.geometryParts.map((part) => ({points: part}))};
}
function decodeServiceAreaGeometryFromFirestore(area) {
  if (!area || typeof area !== "object") return area;
  const normalized = runtimeParts(area);
  const decoded = {...area, geometry: normalized.geometry, geometryParts: normalized.geometryParts};
  delete decoded.geometryEncoding;
  return decoded;
}
function encodeDiscoveryPreferencesForFirestore(preferences) {
  return {...preferences, geometryEncoding: GEOMETRY_ENCODING,
    areas: Array.isArray(preferences?.areas) ? preferences.areas
      .map(encodeServiceAreaGeometryForFirestore) : []};
}
function decodeDiscoveryPreferencesFromFirestore(preferences) {
  if (!preferences || typeof preferences !== "object") return preferences;
  const decoded = {...preferences, areas: Array.isArray(preferences.areas) ? preferences.areas
    .map(decodeServiceAreaGeometryFromFirestore) : []};
  delete decoded.geometryEncoding;
  return decoded;
}
function containsDirectNestedArray(value) {
  if (Array.isArray(value)) return value.some(Array.isArray) || value.some(containsDirectNestedArray);
  return value && typeof value === "object" ? Object.values(value).some(containsDirectNestedArray) : false;
}
module.exports = {GEOMETRY_ENCODING, encodeServiceAreaGeometryForFirestore,
  decodeServiceAreaGeometryFromFirestore, encodeDiscoveryPreferencesForFirestore,
  decodeDiscoveryPreferencesFromFirestore, containsDirectNestedArray};
