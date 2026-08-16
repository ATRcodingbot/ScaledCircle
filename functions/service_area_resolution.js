"use strict";

const crypto = require("node:crypto");

const CACHE_VERSION = "NominatimBoundaryCacheV1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1100;

function normalizeQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 180);
}

function cacheId(query) {
  return crypto.createHash("sha256").update(query.toLowerCase()).digest("hex");
}

function pointGeometry(rawGeoJson) {
  if (!rawGeoJson || typeof rawGeoJson !== "object") return [];
  const type = String(rawGeoJson.type || "");
  const coordinates = rawGeoJson.coordinates;
  let ring;
  if (type === "Polygon" && Array.isArray(coordinates)) ring = coordinates[0];
  if (type === "MultiPolygon" && Array.isArray(coordinates)) ring = coordinates[0]?.[0];
  if (!Array.isArray(ring)) return [];
  const points = ring.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? {latitude, longitude} : null;
  }).filter(Boolean);
  if (points.length < 3) return [];
  if (points.length <= 100) return points;
  const step = Math.ceil(points.length / 99);
  const reduced = points.filter((_, index) => index % step === 0);
  if (reduced.at(-1) !== points.at(-1)) reduced.push(points.at(-1));
  return reduced.slice(0, 100);
}

function parseResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const latitude = Number(raw.lat);
  const longitude = Number(raw.lon);
  const fullAddress = String(raw.display_name || "").trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !fullAddress) return null;
  const address = raw.address && typeof raw.address === "object" ? raw.address : {};
  const name = String(raw.name || fullAddress.split(",")[0]).trim();
  const boundingBox = Array.isArray(raw.boundingbox) ? raw.boundingbox.map(Number) : [];
  return {
    id: `${String(raw.osm_type || "place")}-${String(raw.osm_id || "unknown")}`,
    primaryText: name,
    secondaryText: fullAddress.startsWith(`${name}, `) ? fullAddress.slice(name.length + 2) : fullAddress,
    fullAddress, latitude, longitude,
    geometry: pointGeometry(raw.geojson),
    bounds: boundingBox.length >= 4 && boundingBox.every(Number.isFinite) ?
      {south: boundingBox[0], north: boundingBox[1], west: boundingBox[2], east: boundingBox[3]} : null,
    placeType: String(raw.type || ""),
    city: String(address.city || address.town || address.village || ""),
    county: String(address.county || ""), state: String(address.state || ""),
    postalCode: String(address.postcode || ""),
    resolutionSource: "openstreetmap_nominatim",
    resolutionVersion: "ServiceAreaResolutionV1",
  };
}

async function resolvePlace({query: rawQuery, db, fetchImpl = fetch, now = Date.now(), baseUrl}) {
  const query = normalizeQuery(rawQuery);
  if (query.length < 2) throw new Error("invalid_query");
  const cacheReference = db.collection("serviceAreaResolutionCache").doc(cacheId(query));
  const cached = await cacheReference.get();
  if (cached.exists && Number(cached.data()?.expiresAtMs || 0) > now) {
    return {results: cached.data().results || [], cached: true};
  }

  const throttleReference = db.collection("serviceAreaResolutionSystem").doc("publicNominatim");
  await db.runTransaction(async (transaction) => {
    const throttle = await transaction.get(throttleReference);
    if (Number(throttle.data()?.nextAllowedAtMs || 0) > now) throw new Error("rate_limited");
    transaction.set(throttleReference, {nextAllowedAtMs: now + MIN_REQUEST_INTERVAL_MS,
      updatedAtMs: now}, {merge: true});
  });

  const endpoint = new URL("/search", baseUrl || "https://nominatim.openstreetmap.org");
  for (const [key, value] of Object.entries({q: query, format: "jsonv2", limit: "6",
    countrycodes: "us", addressdetails: "1", polygon_geojson: "1"})) {
    endpoint.searchParams.set(key, value);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetchImpl(endpoint, {signal: controller.signal, headers: {
      "User-Agent": "ScaledCircle-Service-Area-Resolver/1.0 (+https://scaledcircle.com)",
      "Accept": "application/json",
    }});
    if (!response.ok) throw new Error("provider_unavailable");
    const payload = await response.json();
    const results = Array.isArray(payload) ? payload.map(parseResult).filter(Boolean) : [];
    await cacheReference.set({cacheVersion: CACHE_VERSION,
      results, createdAtMs: now, expiresAtMs: now + CACHE_TTL_MS});
    return {results, cached: false};
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {CACHE_TTL_MS, MIN_REQUEST_INTERVAL_MS, normalizeQuery, parseResult, resolvePlace};
