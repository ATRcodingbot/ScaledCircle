"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const contract = require("./smart_zone_entry_contract");

test("explicit selected area is an opaque query/result reference, never client geometry", () => {
  assert.deepEqual(contract.normalizeAreaSelection({
    query: "  Federal   Hill, Baltimore ", resultId: "relation-123",
    geometry: [{latitude: 0, longitude: 0}],
  }), {query: "Federal Hill, Baltimore", resultId: "relation-123"});
  assert.throws(() => contract.normalizeAreaSelection({query: "x", resultId: ""}),
    /invalid_area_selection/);
});

test("server resolution must reproduce the selected result with a usable boundary", () => {
  const selection = {query: "Federal Hill", resultId: "relation-123"};
  const selected = contract.selectResolvedArea(selection, {results: [{
    id: "relation-123", fullAddress: "Federal Hill, Baltimore, Maryland",
    geometry: [{latitude: 39.27, longitude: -76.61},
      {latitude: 39.28, longitude: -76.61}, {latitude: 39.28, longitude: -76.60}],
    resolutionSource: "openstreetmap_nominatim", resolutionVersion: "ServiceAreaResolutionV2",
  }]});
  assert.equal(selected.geometry.length, 3);
  assert.equal(selected.name, "Federal Hill, Baltimore, Maryland");
  assert.throws(() => contract.selectResolvedArea({...selection, resultId: "other"}, {results: []}),
    /area_boundary_unavailable/);
});

test("a resolved street address may use its server point for an around-address boundary", () => {
  const selected = contract.selectResolvedArea(
    {query: "100 Main Street", resultId: "node-1"},
    {results: [{id: "node-1", fullAddress: "100 Main Street, Baltimore, Maryland",
      latitude: 39.29, longitude: -76.61, geometry: []}]},
  );
  assert.deepEqual(selected.center, {latitude: 39.29, longitude: -76.61});
  assert.deepEqual(selected.geometry, []);
});
