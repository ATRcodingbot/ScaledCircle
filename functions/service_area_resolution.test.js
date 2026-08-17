"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {CACHE_VERSION, CACHE_TTL_MS, MIN_REQUEST_INTERVAL_MS, normalizeGeoJson, parseResult,
  encodeCacheDocument, decodeCacheDocument, resolvePlace} = require("./service_area_resolution");

function fakeDb(seed = {}, {failCacheWrites = false} = {}) {
  const values = new Map(Object.entries(seed));
  const reference = (collection, id) => ({
    key: `${collection}/${id}`,
    async get() { const data = values.get(this.key); return {exists: data != null, data: () => data}; },
    async set(data) {
      if (failCacheWrites && collection === "serviceAreaResolutionCache") throw new Error("cache_write_failed");
      values.set(this.key, data);
    },
  });
  return {values, collection: (name) => ({doc: (id) => reference(name, id)}),
    async runTransaction(handler) { await handler({
      get: (ref) => ref.get(),
      set: (ref, data) => values.set(ref.key, {...values.get(ref.key), ...data}),
    }); }};
}

const county = {osm_type: "relation", osm_id: 1, name: "Anne Arundel County",
  display_name: "Anne Arundel County, Maryland", lat: "39.0", lon: "-76.6",
  type: "administrative", addresstype: "county",
  address: {county: "Anne Arundel County", state: "Maryland"},
  boundingbox: ["38.7", "39.3", "-76.9", "-76.3"],
  geojson: {type: "Polygon", coordinates: [[[-76.9, 38.7], [-76.3, 38.7], [-76.3, 39.3]]]}};

test("provider result retains normalized boundary without fabricating facts", () => {
  const parsed = parseResult(county);
  assert.equal(parsed.county, "Anne Arundel County");
  assert.equal(parsed.geometry.length, 3);
  assert.equal(parsed.geographyType, "county");
  assert.equal(parsed.geometryType, "Polygon");
});

test("MultiPolygon preserves disconnected exterior parts and selects a deterministic display ring", () => {
  const normalized = normalizeGeoJson({type: "MultiPolygon", coordinates: [
    [[[-76.9, 38.7], [-76.8, 38.7], [-76.8, 38.8]]],
    [[[-76.7, 38.7], [-76.3, 38.7], [-76.3, 39.3], [-76.7, 39.3]]],
  ]});
  assert.equal(normalized.geometryType, "MultiPolygon");
  assert.equal(normalized.geometryParts.length, 2);
  assert.equal(normalized.geometry.length, 4);
});

test("resolution is globally throttled and cached", async () => {
  const db = fakeDb();
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    assert.match(options.headers["User-Agent"], /scaledcircle\.com/);
    return {ok: true, json: async () => [county]};
  };
  const first = await resolvePlace({query: "Anne Arundel County, Maryland", db, fetchImpl, now: 1000});
  assert.equal(first.cached, false);
  const cached = await resolvePlace({query: "Anne Arundel County, Maryland", db, fetchImpl, now: 1001});
  assert.equal(cached.cached, true);
  await assert.rejects(resolvePlace({query: "Howard County, Maryland", db, fetchImpl,
    now: 1000 + MIN_REQUEST_INTERVAL_MS - 1}), /rate_limited/);
  assert.equal(calls, 1);
});

test("stale cache versions are bypassed and polygon_geojson is required", async () => {
  const db = fakeDb();
  let requestUrl;
  const fetchImpl = async (url) => { requestUrl = url; return {ok: true, json: async () => [county]}; };
  await resolvePlace({query: "Anne Arundel County, Maryland", db, fetchImpl, now: 5000});
  assert.equal(requestUrl.searchParams.get("polygon_geojson"), "1");
  const cache = [...db.values.values()].find((value) => value.cacheVersion === CACHE_VERSION);
  assert.equal(cache.results[0].geometry.points.length, 3);
  assert.equal(cache.results[0].geometryParts[0].points.length, 3);
  assert.equal(cache.results[0].resolutionVersion, "ServiceAreaResolutionV2");
});

test("V3 cache round-trip preserves Anne Arundel provider-neutral payload", () => {
  const parsed = parseResult(county);
  const encoded = encodeCacheDocument([parsed], 1000);
  assert.equal(encoded.cacheVersion, "USBoundaryCacheV3");
  assert.equal(encoded.results[0].canonicalName, "Anne Arundel County, Maryland");
  assert.equal(encoded.results[0].geometry.points.length, 3);
  const decoded = decodeCacheDocument(encoded);
  assert.equal(decoded[0].fullAddress, "Anne Arundel County, Maryland");
  assert.equal(decoded[0].geometry.length, 3);
  assert.equal(decoded[0].geometryParts.length, 1);
});

test("V3 cache round-trip retains every MultiPolygon exterior and deterministic primary", () => {
  const multi = parseResult({...county, geojson: {type: "MultiPolygon", coordinates: [
    [[[-76.9, 38.7], [-76.8, 38.7], [-76.8, 38.8]]],
    [[[-76.7, 38.7], [-76.3, 38.7], [-76.3, 39.3], [-76.7, 39.3]]],
  ]}});
  const decoded = decodeCacheDocument(encodeCacheDocument([multi], 1000));
  assert.equal(decoded[0].geometryType, "MultiPolygon");
  assert.equal(decoded[0].geometryParts.length, 2);
  assert.equal(decoded[0].geometry.length, 4);
});

test("V3 Firestore representation never contains an array directly inside an array", () => {
  const encoded = encodeCacheDocument([parseResult(county)], 1000);
  function inspect(value) {
    if (Array.isArray(value)) {
      assert.equal(value.some(Array.isArray), false);
      value.forEach(inspect);
    } else if (value && typeof value === "object") Object.values(value).forEach(inspect);
  }
  inspect(encoded);
});

test("successful provider resolution is returned when cache persistence fails", async () => {
  const db = fakeDb({}, {failCacheWrites: true});
  const diagnostics = [];
  const response = await resolvePlace({query: "anne arundel county maryland", db,
    fetchImpl: async () => ({ok: true, json: async () => [county]}), now: 1000,
    onCacheWriteError: (error) => diagnostics.push(error.message)});
  assert.equal(response.results[0].geometry.length, 3);
  assert.deepEqual(diagnostics, ["cache_write_failed"]);
});

test("valid unexpired V1 success is normalized and promoted without provider traffic", async () => {
  const crypto = require("node:crypto");
  const query = "anne arundel county maryland";
  const legacyId = crypto.createHash("sha256").update(query).digest("hex");
  const legacy = parseResult(county); delete legacy.geometryParts; delete legacy.geometryType;
  const db = fakeDb({[`serviceAreaResolutionCache/${legacyId}`]: {
    cacheVersion: "NominatimBoundaryCacheV1", results: [legacy], expiresAtMs: 5000,
  }});
  let calls = 0;
  const response = await resolvePlace({query, db, now: 1000,
    fetchImpl: async () => { calls += 1; throw new Error("unexpected_provider_call"); }});
  assert.equal(calls, 0);
  assert.equal(response.cached, true);
  assert.equal(response.results[0].geometry.length, 3);
  assert.equal(response.results[0].geometryParts.length, 1);
  assert.ok([...db.values.values()].some((value) => value.cacheVersion === CACHE_VERSION));
});

test("unresolved identities receive no long negative cache", async () => {
  const identityOnly = {...county}; delete identityOnly.geojson;
  const db = fakeDb();
  const fetchImpl = async (url) => String(url).includes("nominatim.test") ?
    {ok: true, json: async () => [identityOnly]} : {ok: true, json: async () => ({features: []})};
  const response = await resolvePlace({query: "unknown county maryland", db, fetchImpl,
    now: 1000, baseUrl: "https://nominatim.test", tigerBase: "https://tiger.test"});
  assert.equal(response.results[0].geometry.length, 0);
  assert.equal([...db.values.values()].some((value) => value.expiresAtMs === 1000 + CACHE_TTL_MS), false);
  const later = await resolvePlace({query: "unknown county maryland", db,
    fetchImpl: async () => ({ok: true, json: async () => [county]}),
    now: 1000 + MIN_REQUEST_INTERVAL_MS, baseUrl: "https://nominatim.test"});
  assert.equal(later.results[0].geometry.length, 3);
  assert.ok([...db.values.values()].some((value) => value.cacheVersion === CACHE_VERSION));
});

test("provider timeout and 5xx do not write negative cache entries", async () => {
  for (const fetchImpl of [
    async () => { throw new Error("network_timeout"); },
    async () => ({ok: false, status: 503}),
  ]) {
    const db = fakeDb();
    await assert.rejects(resolvePlace({query: "anne arundel county maryland", db, fetchImpl, now: 1000}));
    assert.equal([...db.values.values()].some((value) => value.cacheVersion === CACHE_VERSION), false);
  }
});

test("Census fallback supplies a missing county boundary without a provider loop", async () => {
  const db = fakeDb(); let calls = 0;
  const identityOnly = {...county}; delete identityOnly.geojson;
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).includes("nominatim.test")) return {ok: true, json: async () => [identityOnly]};
    assert.match(String(url), /State_County\/MapServer\/1\/query/);
    return {ok: true, json: async () => ({type: "FeatureCollection", features: [{
      properties: {GEOID: "24003"}, geometry: county.geojson,
    }]})};
  };
  const response = await resolvePlace({query: "anne arundel county maryland", db, fetchImpl,
    now: 8000, baseUrl: "https://nominatim.test", tigerBase: "https://tiger.test"});
  assert.equal(calls, 2);
  assert.equal(response.results[0].resolutionSource, "us_census_tigerweb");
  assert.equal(response.results[0].geographicId, "24003");
  assert.equal(response.results[0].geometry.length, 3);
});

test("Census fallback supports city and ZCTA identities with honest source metadata", async () => {
  for (const fixture of [
    {name: "Baltimore", addresstype: "city", type: "administrative", postcode: "",
      expected: /Places_CouSub_ConCity_SubMCD/, geographicId: "24510"},
    {name: "21401", addresstype: "postcode", type: "postcode", postcode: "21401",
      expected: /PUMA_TAD_TAZ_UGA_ZCTA/, geographicId: "21401"},
  ]) {
    const db = fakeDb();
    const raw = {...county, name: fixture.name, display_name: `${fixture.name}, Maryland`,
      addresstype: fixture.addresstype, type: fixture.type,
      address: {state: "Maryland", postcode: fixture.postcode}};
    delete raw.geojson;
    const fetchImpl = async (url) => String(url).includes("nominatim.test") ?
      {ok: true, json: async () => [raw]} :
      (assert.match(String(url), fixture.expected), {ok: true, json: async () => ({features: [{
        properties: {GEOID: fixture.geographicId, ZCTA5: fixture.postcode}, geometry: county.geojson,
      }]})});
    const response = await resolvePlace({query: fixture.name, db, fetchImpl, now: 12000,
      baseUrl: "https://nominatim.test", tigerBase: "https://tiger.test"});
    assert.equal(response.results[0].geographicId, fixture.geographicId);
    if (fixture.postcode) assert.match(response.results[0].sourceVintage, /ZCTA/);
  }
});
