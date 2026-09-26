'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const parser = require('@babel/parser');
const contract = require('./smart_zone_entry_contract');
const planning = require('./smart_zone_planning');
const geography = require('./smart_zone_geography');
const operations = require('./operational_layer');
const fixture = require('./fixtures/21061-corkran-osm-public.json');
const code = fs.readFileSync(require.resolve('./index'), 'utf8');
const names = ['smartZoneAnchor', 'smartZoneSelectedArea', 'smartZoneCampaign', 'smartZonePlanArguments', 'generateSmartZonePlan'];
const helpers = parser.parse(code).program.body.filter(n => n.type === 'FunctionDeclaration' && names.includes(n.id.name))
  .map(n => code.slice(n.start, n.end)).join('\n');
assert.equal(names.length, parser.parse(helpers).program.body.length);
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const area = fixture.selectedBoundary;
function setup({uid = 'business-a', role = 'business', campaign = {}, paid = true, resolution,
  exists = true, providerPayload = {elements: fixture.elements, osm3s: {timestamp_osm_base: fixture.dataTimestamp}}} = {}) {
  const stored = {businessId: 'business-a', status: 'draft', executionMode: 'own_team',
    campaignType: 'flyer_distribution', serviceArea: area, ...campaign};
  const before = JSON.stringify(stored); let reads = 0, searches = 0, providerCalls = 0;
  const events = [];
  const db = {collection: name => ({doc: () => ({get: async () => {
    reads++; return {exists, data: () => name === 'campaigns' ? stored : {paid}};
  }})})}; // No write method: preview cannot accidentally pass a write in these tests.
  const env = {smartZoneEntryContract: contract, smartZonePlanning: planning,
    smartZoneGeography: {...geography, fetchSnapshot: options => geography.fetchSnapshot({...options,
      fetchImpl: async () => { providerCalls++; return {ok: true, status: 200,
        headers: {get: () => 'application/json'}, json: async () => providerPayload}; }})},
    operations, crypto: require('node:crypto'), db, HttpsError, require,
    authenticatedUserContext: async () => {if (!uid) throw new HttpsError('unauthenticated', 'Sign in'); return {uid, role};},
    subscriptionEntitlements: {hasActivePaidBusinessEntitlement: x => x?.paid === true},
    campaignExecution: {executionMode: c => c.executionMode},
    serviceAreaResolution: {resolvePlace: async () => {searches++; return resolution;}},
    readText: (x, max = 240) => String(x || '').trim().slice(0, max),
    process: {env: {}}, OVERPASS_URL: 'https://overpass.example.invalid/api/interpreter',
    logger: {info: (name, data) => events.push({name, data})}};
  const api = new Function(...Object.keys(env), `${helpers}; return {smartZoneCampaign, generateSmartZonePlan};`)(...Object.values(env));
  return {...api, request: (data = {}) => ({data: {campaignId: 'existing-draft', ...data}}), events,
    check: () => {assert.equal(JSON.stringify(stored), before); return {reads, searches, providerCalls};}};
}

test('drawn preview preserves exact vertices and saved campaign; source data yields real Corkran candidate', async () => {
  const s = setup(); const input = await s.smartZoneCampaign(s.request({analysisBoundary: area,
    areaSelection: {query: '21061', resultId: 'stale-result'}}));
  assert.deepEqual(input.selectedBoundary, area);
  assert.equal(input.selectedArea.source, 'explicit_drawn_analysis');
  const {plan} = await s.generateSmartZonePlan(input, 5);
  assert.equal(plan.totalEstimatedProperties, 19);
  assert.equal(plan.geographicAcquisition.rawElementCount, 341);
  assert.equal(plan.geographicAcquisition.status, 'success');
  assert.equal(plan.geographicAcquisition.landCountsByKind.school, 3);
  assert.equal(s.events.at(-1).data.planningExclusionCountsByKind.school, 3);
  assert.equal(plan.targetEvidence.dataTimestamp, fixture.dataTimestamp);
  assert.ok(plan.targetEvidence.fetchedAt);
  assert.equal(plan.targetEvidence.verifiedDeliveryPoints, false);
  assert.equal(s.check().searches, 0);
  assert.equal(s.check().providerCalls, 1);
});

test('signed-out, wrong role, foreign Business, inactive entitlement and funded campaign fail before provider', async () => {
  for (const [options, expected] of [[{uid: null}, 'unauthenticated'], [{role: 'admin'}, 'permission-denied'],
    [{uid: 'business-b'}, 'permission-denied'], [{campaign: {executionMode: 'marketplace'}, paid: false}, 'permission-denied'],
    [{campaign: {status: 'funded'}}, 'failed-precondition'], [{exists: false}, 'not-found']]) {
    const s = setup(options);
    await assert.rejects(s.smartZoneCampaign(s.request({analysisBoundary: area})), {code: expected});
    assert.equal(s.check().providerCalls, 0); assert.equal(s.check().searches, 0);
  }
});

test('explicit boundary rejects malformed, crossing, retraced, duplicate, out-of-range and coerced coordinates', () => {
  const p = (longitude, latitude) => ({latitude, longitude});
  const box = [p(-76, 39), p(-75.99, 39), p(-75.99, 39.01), p(-76, 39.01)];
  for (const invalid of [null, [], area.slice(0, 2), Array(1001).fill(area[0]),
    [box[0], box[2], box[1], box[3]], [box[0], box[1], p(-75.995, 39), box[2], box[3]],
    [box[0], box[1], box[0], box[2], box[3]], [{latitude: '39', longitude: -76}, ...box.slice(1)],
    [{latitude: 99, longitude: -76}, ...box.slice(1)]]) {
    assert.throws(() => contract.normalizeAnalysisBoundary(invalid), /invalid_analysis_boundary/);
  }
  assert.deepEqual(contract.normalizeAnalysisBoundary([...box, box[0]]), [...box, box[0]]);
  assert.deepEqual(contract.normalizeAnalysisBoundary(box.map(p => ({lat: p.latitude, lng: p.longitude}))), box);
});

test('oversized explicit selection remains exact and fails closed before any provider request', async () => {
  const s = setup(); const large = planning.rectangleAround({latitude: 39.15, longitude: -76.63}, 6000, 6000);
  const input = await s.smartZoneCampaign(s.request({analysisBoundary: large}));
  const {plan} = await s.generateSmartZonePlan(input, 5);
  assert.deepEqual(plan.selectedTerritory, large);
  assert.equal(plan.geographicAcquisition.reasonCode, 'area_limit_exceeded');
  assert.equal(plan.reasonCode, 'selected_area_exceeds_analysis_limit');
  assert.equal(plan.totalEstimatedProperties, null);
  assert.throws(() => planning.assertApplicablePlan(plan), /manual_zone_review_required/);
  assert.equal(s.check().providerCalls, 0);
});

test('unresolved ZIP keeps location context without an implicit square or digest exception', async () => {
  const s = setup({resolution: {results: [{id: 'place-unknown', latitude: 39.1550682,
    longitude: -76.6314933, geographyType: 'zcta', geometry: [], fullAddress: '21061, Maryland'}]}});
  const input = await s.smartZoneCampaign(s.request({areaSelection: {query: '21061', resultId: 'place-unknown'}}));
  assert.deepEqual(input.selectedBoundary, []); assert.match(input.sourceAreaDigest, /^[a-f0-9]{64}$/);
  const {plan} = await s.generateSmartZonePlan(input, 5);
  assert.equal(plan.reasonCode, 'selected_area_boundary_unavailable');
  assert.equal(plan.zones.length, 0); assert.equal(plan.geographicSource, null);
  assert.match(plan.explanation, /saved territory is unchanged/);
  assert.equal(s.check().providerCalls, 0);
});

test('provider partial response retains failure category/source time and cannot be applied', async () => {
  const s = setup({providerPayload: {elements: fixture.elements.slice(0, 4),
    osm3s: {timestamp_osm_base: fixture.dataTimestamp}, remark: 'SECRET provider diagnostic'}});
  const input = await s.smartZoneCampaign(s.request({analysisBoundary: area}));
  const {plan} = await s.generateSmartZonePlan(input, 5);
  assert.equal(plan.geographicAcquisition.reasonCode, 'provider_partial_response');
  assert.equal(plan.geographicAcquisition.rawElementCount, 4);
  assert.equal(plan.geographicSource, null); assert.equal(plan.totalEstimatedProperties, null);
  assert.equal(plan.targetEvidence.observedEligibleFeatureCount, null);
  assert.equal(plan.targetEvidence.roadSupportedTargetCount, null);
  assert.equal(s.events.at(-1).data.observedEligibleFeatureCount, null);
  assert.equal(plan.reasonCode, 'geographic_source_unavailable');
  assert.throws(() => planning.assertApplicablePlan(plan), /manual_zone_review_required/);
  assert.ok(!JSON.stringify(s.events).includes('SECRET')); s.check();
});

test('preview identity binds exact drawn geometry and server work type', async () => {
  const a = setup(), b = setup({campaign: {campaignType: 'business_outreach'}});
  const input = await a.smartZoneCampaign(a.request({analysisBoundary: area, workType: 'business_outreach'}));
  const first = (await a.generateSmartZonePlan(input, 5)).plan;
  assert.equal(first.targetEvidence.targetIntent, 'residential');
  const altered = area.map(p => ({...p, longitude: p.longitude + .000001}));
  const second = (await a.generateSmartZonePlan(await a.smartZoneCampaign(a.request({analysisBoundary: altered})), 5)).plan;
  assert.notEqual(first.planId, second.planId);
  const third = (await b.generateSmartZonePlan(await b.smartZoneCampaign(b.request({analysisBoundary: area})), 5)).plan;
  assert.notEqual(first.planId, third.planId); a.check(); b.check();
});
