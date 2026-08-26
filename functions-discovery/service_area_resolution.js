"use strict";

const crypto = require("node:crypto");
const geometryCodec = require("./service_area_geometry_codec");
const CACHE_VERSION = "USBoundaryCacheV3";
const LEGACY_CACHE_VERSION = "NominatimBoundaryCacheV1";
const RESOLUTION_VERSION = "ServiceAreaResolutionV2";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1100;
const PROVIDER_TIMEOUT_MS = 7000;
const TIGER_BASE = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";

function normalizeQuery(value) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, 180); }
function cacheId(query) { return crypto.createHash("sha256").update(`${CACHE_VERSION}:${query.toLowerCase()}`).digest("hex"); }
function legacyCacheId(query) { return crypto.createHash("sha256").update(query.toLowerCase()).digest("hex"); }
function simplifyRing(ring, maximum = 100) {
  if (!Array.isArray(ring)) return [];
  const points = ring.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const longitude = Number(coordinate[0]); const latitude = Number(coordinate[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? {latitude, longitude} : null;
  }).filter(Boolean);
  if (points.length < 3 || points.length <= maximum) return points.length < 3 ? [] : points;
  const step = Math.ceil(points.length / (maximum - 1));
  const reduced = points.filter((_, index) => index % step === 0);
  if (reduced.at(-1)?.latitude !== points.at(-1)?.latitude || reduced.at(-1)?.longitude !== points.at(-1)?.longitude) reduced.push(points.at(-1));
  return reduced.slice(0, maximum);
}
function ringArea(points) { return points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.longitude * next.latitude - next.longitude * point.latitude;
}, 0) / 2; }
function normalizeGeoJson(rawGeoJson) {
  if (!rawGeoJson || typeof rawGeoJson !== "object") return {geometry: [], geometryParts: [], geometryType: ""};
  const type = String(rawGeoJson.type || ""); const coordinates = rawGeoJson.coordinates;
  let rings = [];
  if (type === "Polygon" && Array.isArray(coordinates)) rings = [coordinates[0]];
  if (type === "MultiPolygon" && Array.isArray(coordinates)) rings = coordinates.map((polygon) => polygon?.[0]);
  const geometryParts = rings.map((ring) => simplifyRing(ring)).filter((ring) => ring.length >= 3);
  const geometry = geometryParts.reduce((largest, ring) => Math.abs(ringArea(ring)) > Math.abs(ringArea(largest)) ? ring : largest, []);
  return {geometry, geometryParts, geometryType: geometryParts.length ? type : ""};
}
function validPoint(point) {
  return point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
}
function normalizePoints(value) {
  return Array.isArray(value) ? value.filter(validPoint).map((point) => ({
    latitude: Number(point.latitude), longitude: Number(point.longitude),
  })) : [];
}
function encodeCacheResult(result) {
  const encodedGeometry = geometryCodec.encodeServiceAreaGeometryForFirestore(result);
  return {id: String(result.id || ""), primaryText: String(result.primaryText || ""),
    secondaryText: String(result.secondaryText || ""), fullAddress: String(result.fullAddress || ""),
    canonicalName: String(result.fullAddress || result.primaryText || ""),
    latitude: Number(result.latitude), longitude: Number(result.longitude),
    center: {latitude: Number(result.latitude), longitude: Number(result.longitude)},
    bounds: result.bounds || null, placeType: String(result.placeType || ""),
    areaType: String(result.geographyType || result.placeType || ""),
    geographyType: String(result.geographyType || ""), geometryType: String(result.geometryType || ""),
    city: String(result.city || ""), county: String(result.county || ""), state: String(result.state || ""),
    country: String(result.country || "United States"), postalCode: String(result.postalCode || ""),
    geographicId: String(result.geographicId || ""), sourceVintage: String(result.sourceVintage || ""),
    provider: String(result.resolutionSource || ""), resolutionSource: String(result.resolutionSource || ""),
    resolutionVersion: String(result.resolutionVersion || RESOLUTION_VERSION),
    geometryEncoding: geometryCodec.GEOMETRY_ENCODING,
    geometry: encodedGeometry.geometry, geometryParts: encodedGeometry.geometryParts};
}
function decodeCacheResult(stored) {
  if (!stored || typeof stored !== "object") return null;
  return geometryCodec.decodeServiceAreaGeometryFromFirestore(stored);
}
function encodeCacheDocument(results, now) {
  return {cacheVersion: CACHE_VERSION, resolutionVersion: RESOLUTION_VERSION,
    status: "success", results: results.map(encodeCacheResult), createdAtMs: now,
    resolvedAtMs: now, expiresAtMs: now + CACHE_TTL_MS};
}
function decodeCacheDocument(value) {
  if (!value || value.cacheVersion !== CACHE_VERSION || value.status !== "success") return [];
  return Array.isArray(value.results) ? value.results.map(decodeCacheResult).filter(Boolean) : [];
}
function decodeLegacyCacheDocument(value) {
  if (!value || value.cacheVersion !== LEGACY_CACHE_VERSION) return [];
  return Array.isArray(value.results) ? value.results.map((result) => {
    const decoded = decodeCacheResult(result); if (!decoded || decoded.geometry.length < 3) return null;
    const label = `${decoded.primaryText || ""} ${decoded.fullAddress || ""}`.toLowerCase();
    const legacyGeographyType = label.includes(" county") ? "county" :
      (/\b\d{5}(?:-\d{4})?\b/.test(label) ? "zcta" : "city");
    return {...decoded, geometryType: decoded.geometryType || "Polygon",
      geographyType: decoded.geographyType || legacyGeographyType,
      resolutionVersion: RESOLUTION_VERSION};
  }).filter(Boolean) : [];
}
function geographyType(raw, address) {
  const kind = String(raw.addresstype || "").toLowerCase();
  if (kind === "county") return "county";
  if (["city", "town", "village", "municipality"].includes(kind)) return "city";
  if (["postcode", "postal_code"].includes(kind)) return "zcta";
  return String(raw.type || "place");
}
function parseResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const latitude = Number(raw.lat); const longitude = Number(raw.lon);
  const fullAddress = String(raw.display_name || "").trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !fullAddress) return null;
  const address = raw.address && typeof raw.address === "object" ? raw.address : {};
  const name = String(raw.name || fullAddress.split(",")[0]).trim();
  const boundingBox = Array.isArray(raw.boundingbox) ? raw.boundingbox.map(Number) : [];
  return {id: `${String(raw.osm_type || "place")}-${String(raw.osm_id || "unknown")}`,
    primaryText: name, secondaryText: fullAddress.startsWith(`${name}, `) ? fullAddress.slice(name.length + 2) : fullAddress,
    fullAddress, latitude, longitude, ...normalizeGeoJson(raw.geojson),
    bounds: boundingBox.length >= 4 && boundingBox.every(Number.isFinite) ? {south: boundingBox[0], north: boundingBox[1], west: boundingBox[2], east: boundingBox[3]} : null,
    placeType: String(raw.type || ""), geographyType: geographyType(raw, address),
    city: String(address.city || address.town || address.village || ""), county: String(address.county || ""),
    state: String(address.state || ""), country: String(address.country || "United States"),
    postalCode: String(address.postcode || ""), geographicId: "", sourceVintage: "",
    resolutionSource: "openstreetmap_nominatim", resolutionVersion: RESOLUTION_VERSION};
}
function tigerLayer(result) {
  if (result.geographyType === "county") return {service: "State_County", layers: [1]};
  if (result.geographyType === "city") return {service: "Places_CouSub_ConCity_SubMCD", layers: [4, 5, 3]};
  if (result.geographyType === "zcta") return {service: "PUMA_TAD_TAZ_UGA_ZCTA", layers: [1]};
  return null;
}
async function fetchJson(url, fetchImpl, headers = {}) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try { const response = await fetchImpl(url, {signal: controller.signal, headers});
    if (!response.ok) throw new Error("provider_unavailable"); return await response.json();
  } finally { clearTimeout(timeout); }
}
async function censusBoundary(result, {fetchImpl, tigerBase = TIGER_BASE}) {
  const target = tigerLayer(result); if (!target) return null;
  for (const layer of target.layers) {
    const endpoint = new URL(`${tigerBase}/${target.service}/MapServer/${layer}/query`);
    const parameters = {where: "1=1", geometry: `${result.longitude},${result.latitude}`,
      geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
      outFields: "GEOID,NAME,BASENAME,STATE,COUNTY,ZCTA5", returnGeometry: "true", outSR: "4326", f: "geojson"};
    Object.entries(parameters).forEach(([key, value]) => endpoint.searchParams.set(key, value));
    let payload; try { payload = await fetchJson(endpoint, fetchImpl, {Accept: "application/geo+json, application/json"}); } catch (_) { continue; }
    const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
    const normalized = normalizeGeoJson(feature?.geometry); if (normalized.geometry.length < 3) continue;
    const properties = feature.properties || {};
    return {...result, ...normalized, geographicId: String(properties.GEOID || properties.ZCTA5 || ""),
      sourceVintage: result.geographyType === "zcta" ? "2020 Census ZCTA" : "January 1, 2025",
      resolutionSource: "us_census_tigerweb", resolutionVersion: RESOLUTION_VERSION};
  }
  return null;
}
async function writeCacheFailSoft(reference, results, now, onCacheWriteError) {
  try { await reference.set(encodeCacheDocument(results, now)); }
  catch (error) { if (onCacheWriteError) onCacheWriteError(error); }
}
async function resolvePlace({query: rawQuery, db, fetchImpl = fetch, now = Date.now(), baseUrl, tigerBase,
  onCacheWriteError}) {
  const query = normalizeQuery(rawQuery); if (query.length < 2) throw new Error("invalid_query");
  const cacheReference = db.collection("serviceAreaResolutionCache").doc(cacheId(query));
  const cached = await cacheReference.get();
  if (cached.exists && Number(cached.data()?.expiresAtMs || 0) > now) {
    const results = decodeCacheDocument(cached.data());
    if (results.some((result) => result.geometry.length >= 3)) return {results, cached: true};
  }
  const legacyReference = db.collection("serviceAreaResolutionCache").doc(legacyCacheId(query));
  const legacy = await legacyReference.get();
  if (legacy.exists && Number(legacy.data()?.expiresAtMs || 0) > now) {
    const results = decodeLegacyCacheDocument(legacy.data());
    if (results.length) {
      await writeCacheFailSoft(cacheReference, results, now, onCacheWriteError);
      return {results, cached: true};
    }
  }
  const throttleReference = db.collection("serviceAreaResolutionSystem").doc("publicNominatim");
  await db.runTransaction(async (transaction) => {
    const throttle = await transaction.get(throttleReference);
    if (Number(throttle.data()?.nextAllowedAtMs || 0) > now) throw new Error("rate_limited");
    transaction.set(throttleReference, {nextAllowedAtMs: now + MIN_REQUEST_INTERVAL_MS, updatedAtMs: now}, {merge: true});
  });
  const endpoint = new URL("/search", baseUrl || "https://nominatim.openstreetmap.org");
  Object.entries({q: query, format: "jsonv2", limit: "6", countrycodes: "us", addressdetails: "1", polygon_geojson: "1"})
    .forEach(([key, value]) => endpoint.searchParams.set(key, value));
  const payload = await fetchJson(endpoint, fetchImpl, {"User-Agent": "ScaledCircle-Service-Area-Resolver/1.0 (+https://scaledcircle.com)", Accept: "application/json"});
  const parsed = Array.isArray(payload) ? payload.map(parseResult).filter(Boolean) : [];
  const results = [];
  for (const result of parsed) results.push(result.geometry.length >= 3 ? result : await censusBoundary(result, {fetchImpl, tigerBase}) || result);
  // Only usable boundaries receive the 30-day cache. Provider/network failures throw
  // before this point, and unresolved identities are deliberately not cached.
  if (results.some((result) => result.geometry.length >= 3)) {
    await writeCacheFailSoft(cacheReference, results, now, onCacheWriteError);
  }
  return {results, cached: false};
}
module.exports = {CACHE_VERSION, RESOLUTION_VERSION, CACHE_TTL_MS, MIN_REQUEST_INTERVAL_MS,
  PROVIDER_TIMEOUT_MS, normalizeQuery, normalizeGeoJson, parseResult, censusBoundary,
  encodeCacheResult, decodeCacheResult, encodeCacheDocument, decodeCacheDocument,
  decodeLegacyCacheDocument, resolvePlace};
