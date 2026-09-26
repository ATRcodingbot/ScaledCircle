'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const geography = require('./smart_zone_geography');
const smart = require('./smart_zone_planning');
const fixture = require('./fixtures/21061-corkran-osm-public.json');
const endpoint = 'https://private.invalid/SECRET';
const response = (payload, options = {}) => ({ok: true, status: 200,
  headers: {get: () => 'application/json; charset=utf-8'}, json: async () => payload, ...options});
async function probe(fetchImpl, selectedBoundary = fixture.selectedBoundary) {
  const diagnostics = []; let calls = 0, query = null;
  const snapshot = await geography.fetchSnapshot({selectedBoundary, endpoint,
    fetchImpl: async (url, options) => {
      calls++; assert.equal(url, endpoint);
      assert.equal(options.method, 'POST');
      assert.ok(options.signal instanceof AbortSignal);
      query = new URLSearchParams(options.body).get('data');
      return fetchImpl(url, options);
    }, onDiagnostic: value => diagnostics.push(value)});
  assert.equal(diagnostics.length, 1, 'Exactly one bounded terminal diagnostic is emitted.');
  const record = diagnostics[0];
  assert.ok(record.elapsedMs >= 0 && Number.isFinite(Date.parse(record.startedAt)) && Number.isFinite(Date.parse(record.finishedAt)));
  assert.equal(record.schemaVersion, 1);
  assert.ok(!JSON.stringify(record).includes('SECRET'), 'Provider URL/error/response text must never be logged.');
  for (const key of ['url', 'endpoint', 'query', 'payload', 'elements', 'error', 'errorMessage']) assert.equal(key in record, false);
  if (calls) assert.match(record.queryDigest, /^[0-9a-f]{64}$/);
  return {snapshot, record, calls, query};
}

test('successful retained real geography reports parsed counts and safe provenance without altering the plan', async () => {
  const {snapshot, record, calls, query} = await probe(async () => response({elements: fixture.elements,
    osm3s: {timestamp_osm_base: fixture.dataTimestamp}}));
  assert.equal(calls, 1);
  assert.equal(record.status, 'success');
  assert.equal(record.stage, 'complete');
  assert.equal(record.reasonCode, 'snapshot_ready');
  assert.equal(record.httpStatus, 200);
  assert.equal(record.contentType, 'application/json');
  assert.equal(record.rawElementCount, 341);
  assert.equal(record.rawElementTypes.node + record.rawElementTypes.way + record.rawElementTypes.relation, 341);
  assert.equal(record.classifiedTargetCounts.residential, 32);
  assert.equal(record.targetFeatureCount, snapshot.targetFeatures.length);
  assert.equal(record.routeWayCount, snapshot.routeWays.length);
  assert.equal(record.landFeatureCount, snapshot.landFeatures.length);
  assert.equal(record.exclusionPolygonCount, snapshot.exclusionPolygons.length);
  assert.equal(record.barrierWayCount, snapshot.barrierWays.length);
  assert.equal(record.unresolvedLandFeatureCount, snapshot.unresolvedLandFeatures.length);
  assert.equal(Date.parse(record.sourceDataTimestamp), Date.parse(fixture.dataTimestamp));
  assert.equal(record.fetchedAt, snapshot.fetchedAt);
  assert.equal(record.vertexCount, 4);
  assert.ok(record.areaSquareMeters > 1100000 && record.areaSquareMeters < 1200000);
  assert.deepEqual(record.bounds, {south: 39.1505, north: 39.1597, west: -76.641, east: -76.628});
  assert.ok(query.includes('39.1505000 -76.6410000'));
  const plan = smart.generatePlan({anchor: fixture.anchor, selectedBoundary: fixture.selectedBoundary,
    geographicSnapshot: snapshot, workType: 'flyer_distribution', desiredHours: 5});
  assert.equal(plan.totalEstimatedProperties, 19);
  assert.equal(plan.totalEstimatedMinutes, 44);
});

test('successful empty provider data is distinct from unavailable data', async () => {
  const {snapshot, record} = await probe(async () => response({elements: [], osm3s: {timestamp_osm_base: fixture.dataTimestamp}}));
  assert.ok(snapshot);
  assert.equal(record.status, 'success');
  assert.equal(record.reasonCode, 'empty_response');
  assert.equal(record.rawElementCount, 0);
  assert.deepEqual(record.classifiedTargetCounts, {residential: 0, business: 0, event: 0, unclassified_address: 0});
  assert.equal(record.targetFeatureCount, 0);
  assert.equal(record.routeWayCount, 0);
  assert.ok(record.fetchedAt);
});

test('HTTP 504 keeps unknown counts null and never parses the error body', async () => {
  const {snapshot, record, calls} = await probe(async () => response(null, {ok: false, status: 504,
    headers: {get: () => 'text/html; token=SECRET'}, json: async () => { throw Error('SECRET body must not be parsed'); }}));
  assert.equal(snapshot, null);
  assert.equal(calls, 1);
  assert.equal(record.status, 'unavailable');
  assert.equal(record.stage, 'response');
  assert.equal(record.reasonCode, 'http_error');
  assert.equal(record.httpStatus, 504);
  assert.equal(record.contentType, 'text/html');
  assert.equal(record.rawElementCount, null);
  assert.equal(record.targetFeatureCount, null);
  assert.equal(record.classifiedTargetCounts, null);
  assert.equal(record.fetchedAt, null);
});

test('HTTP-success partial provider response is rejected with safe raw count only', async () => {
  const {snapshot, record} = await probe(async () => response({elements: fixture.elements,
    remark: 'runtime error SECRET', osm3s: {timestamp_osm_base: fixture.dataTimestamp}}));
  assert.equal(snapshot, null);
  assert.equal(record.status, 'unavailable');
  assert.equal(record.stage, 'parse');
  assert.equal(record.reasonCode, 'provider_partial_response');
  assert.equal(record.rawElementCount, 341);
  assert.equal(record.classifiedTargetCounts, null);
});

test('JSON parse failure and malformed payload remain separate safe diagnostic outcomes', async () => {
  const invalidJson = await probe(async () => response(null, {json: async () => { throw new SyntaxError('SECRET malformed content'); }}));
  assert.equal(invalidJson.snapshot, null);
  assert.equal(invalidJson.record.reasonCode, 'invalid_json');
  assert.equal(invalidJson.record.stage, 'parse');
  const invalidPayload = await probe(async () => response({SECRET: 'not an elements array'}));
  assert.equal(invalidPayload.snapshot, null);
  assert.equal(invalidPayload.record.reasonCode, 'invalid_payload');
});

test('aborted requests and network errors are unavailable without retry or raw error disclosure', async () => {
  const timeout = await probe(async () => { const error = Error('SECRET abort URL'); error.name = 'AbortError'; throw error; });
  assert.equal(timeout.snapshot, null);
  assert.equal(timeout.calls, 1);
  assert.equal(timeout.record.status, 'unavailable');
  assert.equal(timeout.record.stage, 'request');
  assert.equal(timeout.record.reasonCode, 'timeout');
  assert.equal(timeout.record.httpStatus, null);
  const network = await probe(async () => { throw Error('SECRET socket error'); });
  assert.equal(network.snapshot, null);
  assert.equal(network.calls, 1);
  assert.equal(network.record.reasonCode, 'network_error');
  assert.equal(geography.QUERY_TIMEOUT_MILLISECONDS, 12000);
});

test('input limits reject before provider work and preserve area/query diagnostics', async () => {
  const invalid = await probe(async () => { throw Error('must not fetch'); }, []);
  assert.equal(invalid.snapshot, null);
  assert.equal(invalid.calls, 0);
  assert.equal(invalid.record.status, 'rejected');
  assert.equal(invalid.record.reasonCode, 'invalid_geometry');
  assert.equal(invalid.record.queryDigest, null);
  const oversized = await probe(async () => { throw Error('must not fetch'); }, smart.rectangleAround(fixture.anchor, 6000, 6000));
  assert.equal(oversized.snapshot, null);
  assert.equal(oversized.calls, 0);
  assert.equal(oversized.record.reasonCode, 'area_limit_exceeded');
  assert.ok(oversized.record.areaSquareMeters > 25000000);
  assert.equal(geography.MAX_QUERY_AREA_SQUARE_METERS, 25000000);
});

test('element limits and parser failures never become a successful empty inventory', async () => {
  const limited = await probe(async () => response({elements: Array(20001).fill({type: 'node'})}));
  assert.equal(limited.snapshot, null);
  assert.equal(limited.record.reasonCode, 'element_limit_exceeded');
  assert.equal(limited.record.rawElementCount, 20001);
  assert.equal(limited.record.classifiedTargetCounts, null);
  const malformedFeature = await probe(async () => response({elements: [null]}));
  assert.equal(malformedFeature.snapshot, null);
  assert.equal(malformedFeature.record.stage, 'classify');
  assert.equal(malformedFeature.record.reasonCode, 'classification_error');
  assert.equal(malformedFeature.record.classifiedTargetCounts, null);
});

test('diagnostic observer failures cannot change snapshot availability', async () => {
  for (const onDiagnostic of [() => { throw Error('observer failed'); }, async () => { throw Error('async observer failed'); }]) {
    const result = await geography.fetchSnapshot({selectedBoundary: fixture.selectedBoundary, endpoint,
      fetchImpl: async () => response({elements: []}), onDiagnostic});
    assert.ok(result);
  }
  await new Promise(resolve => setImmediate(resolve));
});
