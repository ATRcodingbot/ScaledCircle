"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {MIN_REQUEST_INTERVAL_MS, parseResult, resolvePlace} = require("./service_area_resolution");

function fakeDb(seed = {}) {
  const values = new Map(Object.entries(seed));
  const reference = (collection, id) => ({
    key: `${collection}/${id}`,
    async get() { const data = values.get(this.key); return {exists: data != null, data: () => data}; },
    async set(data) { values.set(this.key, data); },
  });
  return {values, collection: (name) => ({doc: (id) => reference(name, id)}),
    async runTransaction(handler) { await handler({
      get: (ref) => ref.get(),
      set: (ref, data) => values.set(ref.key, {...values.get(ref.key), ...data}),
    }); }};
}

const county = {osm_type: "relation", osm_id: 1, name: "Anne Arundel County",
  display_name: "Anne Arundel County, Maryland", lat: "39.0", lon: "-76.6",
  type: "administrative", address: {county: "Anne Arundel County", state: "Maryland"},
  boundingbox: ["38.7", "39.3", "-76.9", "-76.3"],
  geojson: {type: "Polygon", coordinates: [[[-76.9, 38.7], [-76.3, 38.7], [-76.3, 39.3]]]}};

test("provider result retains normalized boundary without fabricating facts", () => {
  const parsed = parseResult(county);
  assert.equal(parsed.county, "Anne Arundel County");
  assert.equal(parsed.geometry.length, 3);
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
