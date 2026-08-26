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
