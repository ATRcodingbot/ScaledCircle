"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const geography = require("./smart_zone_geography");
const smart = require("./smart_zone_planning");
const selectedBoundary = smart.rectangleAround(
  {latitude: 39.2904, longitude: -76.6122}, 1200, 1200);
const geometry = (latitude, longitude) => [
  {lat: latitude - .0005, lon: longitude - .0005},
  {lat: latitude - .0005, lon: longitude + .0005},
  {lat: latitude + .0005, lon: longitude + .0005},
  {lat: latitude + .0005, lon: longitude - .0005},
  {lat: latitude - .0005, lon: longitude - .0005},
];

test("OSM elements separate serviceability, water, parks, and barriers", () => {
  const result = geography.snapshotFromElements(selectedBoundary, [
    {id: 1, lat: 39.2904, lon: -76.6122, tags: {"addr:housenumber": "1"}},
    {id: 2, tags: {highway: "residential"}, geometry: geometry(39.291, -76.613)},
    {id: 3, tags: {highway: "motorway"}, geometry: geometry(39.292, -76.613)},
    {id: 4, tags: {natural: "water"}, geometry: geometry(39.289, -76.611)},
    {id: 5, tags: {leisure: "park"}, geometry: geometry(39.293, -76.611)},
    {id: 6, tags: {boundary: "place", place: "neighbourhood"},
      geometry: geometry(39.2904, -76.6122)},
  ]);
  assert.deepEqual([result.waterFeatureCount, result.parkFeatureCount,
    result.barrierFeatureCount, result.exclusionPolygons.length], [1, 1, 1, 2]);
  assert.equal(result.serviceableBoundaryType, "mapped_place_boundary");
  assert.ok(result.serviceablePoints.some((item) => item.kind === "property"));
  assert.ok(result.serviceablePoints.some((item) => item.kind === "local_road"));
});

test("provider failure and oversized territory return fallback input", async () => {
  assert.equal(await geography.fetchSnapshot({selectedBoundary, endpoint: "test",
    fetchImpl: async () => { throw new Error("provider unavailable"); }}), null);
  const huge = smart.rectangleAround({latitude: 39.2904, longitude: -76.6122}, 6000, 6000);
  let calls = 0;
  assert.equal(await geography.fetchSnapshot({selectedBoundary: huge, endpoint: "test",
    fetchImpl: async () => { calls += 1; }}), null);
  assert.equal(calls, 0);
});

test('partial provider timeout payload is rejected even with HTTP success and valid targets', async () => {
  const f = require('./smart_zone_geographic_fixtures');
  const boundary = smart.rectangleAround(f.anchor, 1000, 1000);
  const result = await geography.fetchSnapshot({selectedBoundary: boundary, endpoint: 'synthetic',
    fetchImpl: async () => ({ok: true, json: async () => ({elements: f.grid(), remark: 'runtime error: Query timed out'})})});
  assert.equal(result, null);
});

test('provider query includes campaign-aware hazards and retains actual provider freshness', async () => {
  let query;
  const result = await geography.fetchSnapshot({selectedBoundary, endpoint: 'synthetic', fetchImpl: async (_, options) => {
    query = new URLSearchParams(options.body).get('data');
    return {ok: true, json: async () => ({elements: [], osm3s: {timestamp_osm_base: '2026-09-26T00:00:00Z'}})};
  }});
  for (const kind of ['school', 'cemetery', 'industrial', 'shop', 'office', 'access']) assert.ok(query.includes(kind));
  assert.equal(result.dataTimestamp, '2026-09-26T00:00:00Z');
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test('multipolygon outer rings join exact endpoints; incomplete school footprints remain unresolved', () => {
  const f = require('./smart_zone_geographic_fixtures');
  const ring = f.ring(-100, -100, 100, 100);
  const school = {type: 'relation', id: 990, tags: {amenity: 'school'}, members: [
    {role: 'outer', geometry: ring.slice(0, 3)}, {role: 'outer', geometry: ring.slice(2)}]};
  assert.equal(geography.elementPolygons(school).length, 1);
  school.members.pop();
  const result = geography.snapshotFromElements(smart.rectangleAround(f.anchor, 1000, 1000), [school]);
  assert.equal(result.landFeatures.length, 0);
  assert.equal(result.unresolvedLandFeatures[0].kind, 'school');
});
test('self-intersecting school footprints cannot establish complete hazard evidence', () => {
  const f = require('./smart_zone_geographic_fixtures');
  const school = {type: 'way', id: 990, tags: {amenity: 'school'}, geometry:
    [[0, 0], [200, 200], [0, 200], [150, 0], [0, 0]].map(([x, y]) => f.osm(x, y))};
  const result = geography.snapshotFromElements(selectedBoundary, [school]);
  assert.equal(result.landFeatures.length, 0);
  assert.equal(result.unresolvedLandFeatures[0].kind, 'school');
});
