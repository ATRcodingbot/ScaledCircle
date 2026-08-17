"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const codec = require("./service_area_geometry_codec");
const ring = (offset = 0) => [{latitude: 38 + offset, longitude: -77},
  {latitude: 39 + offset, longitude: -77}, {latitude: 39 + offset, longitude: -76}];
test("encodes discovery geometry without arrays directly inside arrays", () => {
  const encoded = codec.encodeDiscoveryPreferencesForFirestore({areas: [
    {id: "anne", geometry: ring(), geometryParts: [ring()]},
    {id: "howard", geometry: ring(1), geometryParts: [ring(1), ring(2)]},
  ]});
  assert.equal(encoded.geometryEncoding, codec.GEOMETRY_ENCODING);
  assert.equal(encoded.areas[0].geometry.points.length, 3);
  assert.equal(encoded.areas[1].geometryParts.length, 2);
  assert.equal(codec.containsDirectNestedArray(encoded), false);
});
test("round trips multipart and legacy single polygon geometry", () => {
  const runtime = {areas: [{id: "multipart", geometry: ring(1), geometryParts: [ring(), ring(1)]}]};
  const decoded = codec.decodeDiscoveryPreferencesFromFirestore(
    codec.encodeDiscoveryPreferencesForFirestore(runtime));
  assert.deepEqual(decoded.areas[0].geometryParts, [ring(), ring(1)]);
  assert.deepEqual(codec.decodeServiceAreaGeometryFromFirestore({geometry: ring()}).geometryParts, [ring()]);
});
test("storage encoding and callable representation remain distinct", () => {
  const stored = codec.encodeServiceAreaGeometryForFirestore({geometry: ring(), geometryParts: [ring()]});
  assert.ok(stored.geometryParts[0].points);
  const callable = codec.decodeServiceAreaGeometryFromFirestore(stored);
  assert.ok(Array.isArray(callable.geometryParts[0]));
  assert.equal(callable.geometryEncoding, undefined);
});
