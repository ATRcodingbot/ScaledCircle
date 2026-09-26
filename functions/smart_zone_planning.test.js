'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const smart = require('./smart_zone_planning');
const geography = require('./smart_zone_geography');
const serviceability = require('./smart_zone_serviceability');
const f = require('./smart_zone_geographic_fixtures');
const boundary = smart.rectangleAround(f.anchor, 2500, 2500);
const plan = (elements, options = {}) => smart.generatePlan({anchor: f.anchor,
  selectedBoundary: boundary, geographicSnapshot: geography.snapshotFromElements(boundary, elements,
    {dataTimestamp: '2026-09-26T12:00:00Z', fetchedAt: '2026-09-26T12:01:00Z'}), ...options});
const noOverlap = (result, area) => result.zones.forEach(zone =>
  assert.equal(serviceability.polygonsOverlap(zone.geometry, geography.elementPolygons(area)[0], smart), false));

test('dense residential blocks use classified features and connected streets, never requested-hours arithmetic', () => {
  const first = plan(f.grid());
  assert.deepEqual(first, plan(f.grid()));
  assert.equal(first.recommendationStatus, 'review_required');
  assert.equal(first.totalEstimatedProperties, 48);
  assert.notEqual(first.totalEstimatedProperties, 225);
  assert.equal(first.targetEvidence.measure, 'mapped_target_features');
  assert.equal(first.targetEvidence.verifiedDeliveryPoints, false);
  assert.equal(first.targetEvidence.dataTimestamp, '2026-09-26T12:00:00Z');
  assert.ok(first.zones.every(z => z.workability === 'review_recommended_area' && z.workload.estimatedMinutes <= 360));
  assert.doesNotThrow(() => smart.assertApplicablePlan(first));
});
test('school beside residences contributes no targets and no campus polygon space', () => {
  const campus = f.land({amenity: 'school', 'addr:housenumber': '1'}, 90, -260, 420, 280);
  const result = plan([...f.grid(), campus]);
  assert.ok(result.zones.length > 0);
  assert.ok(result.totalEstimatedProperties < 48);
  noOverlap(result, campus);
  assert.ok(result.zones.every(z => !smart.pointInsidePolygon(f.p(200, 0), z.geometry)));
});
test('neighborhood bordering a park excludes park land from proposed polygons', () => {
  const park = f.land({leisure: 'park'}, 90, -260, 420, 280);
  const result = plan([...f.grid(), park]);
  assert.ok(result.zones.length > 0);
  noOverlap(result, park);
});
test('central park that prevents a supported compact polygon fails to manual review', () => {
  const park = f.land({leisure: 'park'}, -60, -110, 60, 130);
  const result = plan([...f.grid(), park]);
  assert.equal(result.recommendationStatus, 'manual_review_required');
  assert.deepEqual(result.zones, []);
  assert.equal(result.compensation, null);
});
test('major highway separates recommendations without inferred crossings', () => {
  const highway = {type: 'way', id: 2000, tags: {highway: 'motorway'}, geometry: [f.osm(0, -1000), f.osm(0, 1000)]};
  const result = plan([...f.grid(), highway]);
  assert.ok(result.zones.length >= 2);
  for (const z of result.zones) {
    const longitudes = z.geometry.map(p => p.longitude);
    assert.ok(Math.max(...longitudes) < f.anchor.longitude || Math.min(...longitudes) > f.anchor.longitude);
    assert.equal(z.sourceComponentIds.length, 1);
  }
});
test('waterfront polygons and targets in water are excluded', () => {
  const water = f.land({natural: 'water'}, 80, -900, 900, 900);
  const result = plan([...f.grid(), water]);
  assert.ok(result.zones.length > 0);
  noOverlap(result, water);
});
test('mixed residential/commercial eligibility changes with campaign intent; event venues are not globally banned', () => {
  const elements = f.grid().map(e => e.tags.building && e.lon > f.anchor.longitude ?
    {...e, tags: {...e.tags, building: undefined, shop: 'convenience'}} : e);
  const commercial = f.land({landuse: 'commercial'}, 10, -270, 400, 270);
  const residential = plan([...elements, commercial]);
  const business = plan([...elements, commercial], {workType: 'business_card_distribution'});
  assert.ok(residential.totalEstimatedProperties > 0 && business.totalEstimatedProperties > 0);
  noOverlap(residential, commercial);
  assert.equal(business.targetEvidence.targetIntent, 'business');
  assert.ok(business.zones.some(z => z.geometry.some(p => p.longitude > f.anchor.longitude)));
  const event = plan([f.land({amenity: 'school'}, -100, -100, 100, 100)], {workType: 'event_marketing'});
  assert.equal(event.targetEvidence.observedEligibleFeatureCount, 1);
  assert.match(event.explanation, /venues can be relevant/);
  assert.equal(event.recommendationStatus, 'manual_review_required');
});
test('sparse suburban evidence cannot turn a long empty route into a recommendation', () => {
  const elements = [{type: 'way', id: 1, tags: {highway: 'residential'}, geometry: [f.osm(-1000, 0), f.osm(1000, 0)]}];
  for (let x = -900; x <= 900; x += 360) elements.push({type: 'node', id: x + 2000, ...f.osm(x, 20), tags: {building: 'house'}});
  const result = plan(elements);
  assert.equal(result.recommendationStatus, 'manual_review_required');
  assert.deepEqual(result.zones, []);
  assert.equal(result.plannedTerritory, null);
});
test('irregular network does not infer straight connectors through a restricted gap', () => {
  const elements = f.grid().filter(e => !e.tags.highway || e.geometry[0].lat !== f.osm(0, -60).lat);
  const gap = f.land({access: 'private'}, -90, -150, 90, 100);
  const result = plan([...elements, gap]);
  noOverlap(result, gap);
  for (const z of result.zones) {
    assert.equal(z.sourceComponentIds.length, 1);
    assert.ok(z.geometryValidation.areaSquareMeters / z.workload.estimatedProperties <= 6000);
    assert.ok(z.mappedRouteMeters / z.workload.estimatedProperties <= 150);
  }
});
test('roads, unclassified addresses and missing data never fabricate targets, rectangles or compensation', () => {
  const roads = f.grid().filter(e => e.tags.highway);
  roads.push({type: 'node', id: 9999, ...f.osm(20, 20), tags: {'addr:housenumber': '100'}});
  for (const result of [plan(roads), smart.generatePlan({anchor: f.anchor, desiredHours: 5})]) {
    assert.equal(result.recommendationStatus, 'manual_review_required');
    assert.equal(result.totalEstimatedProperties, null);
    assert.equal(result.totalEstimatedMinutes, null);
    assert.equal(result.compensation, null);
    assert.equal(result.plannedTerritory, null);
    assert.deepEqual(result.zones, []);
    assert.throws(() => smart.assertApplicablePlan(result), /manual_zone_review_required/);
  }
});
test('inaccessible roads and industrial/cemetery/institutional campuses do not support residential work', () => {
  assert.equal(plan(f.grid().map(e => e.tags.highway ? {...e, tags: {...e.tags, access: 'private'}} : e)).zones.length, 0);
  for (const tags of [{landuse: 'industrial'}, {landuse: 'cemetery'}, {amenity: 'hospital'}]) {
    const gap = f.land(tags, 90, -260, 420, 280);
    noOverlap(plan([...f.grid(), gap]), gap);
  }
});
test('duplicate mapped observations are not added into delivery-point counts', () => {
  const elements = f.grid(), duplicate = elements.find(e => e.tags.building);
  elements.push({...duplicate, id: 9900});
  const result = plan(elements);
  assert.equal(result.totalEstimatedProperties, 48);
  assert.equal(result.targetEvidence.verifiedDeliveryPoints, false);
});
test('distinct adjacent small building footprints are not merged merely because their centers are close', () => {
  const a = f.land({building: 'house'}, 283, -166, 287, -162, 10001);
  const b = f.land({building: 'house'}, 289, -166, 293, -162, 10002);
  const result = plan([...f.grid(), a, b]);
  assert.equal(result.targetEvidence.observedEligibleFeatureCount, 50);
  assert.ok(result.zones.flatMap(z => z.planningTargets.features).some(f => f.sourceId === 'way/10001'));
  assert.ok(result.zones.flatMap(z => z.planningTargets.features).some(f => f.sourceId === 'way/10002'));
});
test('larger requested hours cannot synthesize observed targets or Excellent ratings', () => {
  const first = plan(f.grid(), {desiredHours: 5}), larger = plan(f.grid(), {desiredHours: 60});
  assert.equal(first.totalEstimatedProperties, larger.totalEstimatedProperties);
  assert.ok(larger.zones.every(z => z.workload.estimatedMinutes <= 360 && z.workability !== 'excellent'));
  assert.equal(larger.fulfillment.campaignDesignLimitedBySupply, false);
  assert.throws(() => smart.recommendedScalerCount(193 * 60), /campaign_capacity_exceeded/);
});
test('selected geometry changes invalidate identity; compensation acceptance preserves it', () => {
  const first = plan(f.grid(), {sourceAreaDigest: 'a', workerBasePayCents: 5000});
  assert.notEqual(first.planId, plan(f.grid(), {sourceAreaDigest: 'b'}).planId);
  assert.equal(first.planId, plan(f.grid(), {sourceAreaDigest: 'a', workerBasePayCents: 10000}).planId);
});
test('manual geometry and payment-readiness contracts remain unchanged', () => {
  const geometry = smart.rectangleAround(f.anchor, 90, 120);
  assert.equal(smart.validateGeometry(geometry).valid, true);
  assert.equal(smart.validateGeometry([f.anchor, f.anchor, f.anchor]).valid, false);
  const zone = {serviceArea: geometry, analysisStatus: 'complete', estimatedHomes: 50, serverEstimatedWalkingMinutes: 100};
  assert.equal(smart.paymentReadiness(zone).ready, true);
  assert.equal(smart.paymentReadiness({...zone, analysisStatus: 'failed'}).reason, 'analysis_required');
  assert.equal(smart.paymentReadiness({...zone, estimatedHomes: 0}).reason, 'positive_home_estimate_required');
  assert.equal(smart.paymentReadiness({...zone, serverEstimatedWalkingMinutes: 900}).reason, 'automatic_split_required');
});
test('standalone compensation preserves fixed-price base-pay and optional-bonus policy', () => {
  const weak = smart.compensationRecommendation({estimatedMinutes: 300, workerBasePayCents: 5000, completionBonusCents: 5000, qualityBonusCents: 5000});
  assert.equal(weak.recommendedBasePayCents, 10000);
  assert.equal(weak.estimatedEffectiveCompensationCentsPerHour, 1000);
  assert.equal(weak.belowRecommendedFloor, true);
  assert.equal(weak.fixedPriceCampaignCompensation, true);
  assert.equal(weak.hourlyEmploymentRepresentation, false);
  assert.equal(weak.configuredPotentialPayoutCents, 15000);
});
test('large commercial building footprints cannot be swallowed by residential hulls', () => {
  const building = f.land({building: 'retail'}, 90, -260, 420, 280);
  const result = plan([...f.grid(), building]);
  assert.ok(result.zones.length > 0);
  noOverlap(result, building);
});
test('unresolved school footprint fails closed even when its point is outside the proposed target hull', () => {
  const result = plan([...f.grid(), {type: 'node', id: 9200, ...f.osm(800, 800), tags: {amenity: 'school'}}]);
  assert.equal(result.recommendationStatus, 'manual_review_required');
  assert.match(result.explanation, /no reliable footprint/);
});
test('mapped pace affects advisory duration but cannot change observed feature provenance', () => {
  const fast = plan(f.grid(), {propertiesPerHour: 90}), slow = plan(f.grid(), {propertiesPerHour: 30});
  assert.equal(fast.totalEstimatedProperties, slow.totalEstimatedProperties);
  assert.ok(fast.totalEstimatedMinutes < slow.totalEstimatedMinutes);
});
test('a closed outer ring cannot conceal an incomplete school-campus component', () => {
  const result = plan([...f.grid(), {type: 'relation', id: 9400, tags: {amenity: 'school'}, center: f.osm(0, 0),
    members: [{role: 'outer', geometry: f.ring(800, 800, 900, 900)},
      {role: 'outer', geometry: f.ring(-60, -100, 60, 100).slice(0, 3)}]}]);
  assert.equal(result.recommendationStatus, 'manual_review_required');
  assert.deepEqual(result.zones, []);
});
test('missing outer member geometry cannot be silently dropped beside a complete component', () => {
  const result = plan([...f.grid(), {type: 'relation', id: 9401, tags: {amenity: 'school'},
    members: [{role: 'outer', geometry: f.ring(800, 800, 900, 900)}, {role: 'outer', ref: 123}]}]);
  assert.equal(result.recommendationStatus, 'manual_review_required');
});
test('target candidates and mapped network remain distinct from territory and executable routes', () => {
  const result = plan(f.grid());
  for (const zone of result.zones) {
    assert.ok(zone.geometry.length >= 3);
    assert.equal(zone.planningTargets.features.length, zone.workload.estimatedProperties);
    assert.equal(zone.planningTargets.verifiedDeliveryPoints, false);
    assert.ok(zone.planningNetwork.segments.length > 0);
    assert.equal(zone.planningNetwork.kind, 'connected_mapped_road_network');
    assert.equal(zone.planningNetwork.isExecutionRoute, false);
    assert.equal(zone.planningNetwork.accessVerified, false);
    assert.equal(zone.planningNetwork.suggestedRoute, null);
  }
});
test('oversized resolved territory keeps its exact boundary and explains the analysis limit instead of shrinking', () => {
  const selectedBoundary = smart.rectangleAround(f.anchor, 6000, 6000);
  const result = plan(f.grid(), {selectedBoundary});
  assert.equal(result.recommendationStatus, 'manual_review_required');
  assert.equal(result.reasonCode, 'selected_area_exceeds_analysis_limit');
  assert.match(result.explanation, /25 km² geographic analysis limit/);
  assert.deepEqual(result.selectedTerritory, selectedBoundary);
  assert.equal(result.plannedTerritory, null);
  assert.equal(result.totalEstimatedProperties, null);
  assert.deepEqual(result.zones, []);
});
