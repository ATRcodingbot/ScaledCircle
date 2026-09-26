'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/21061-corkran-osm-public.json');
const geography = require('./smart_zone_geography');
const smart = require('./smart_zone_planning');
const serviceability = require('./smart_zone_serviceability');

function snapshot() {
  return geography.snapshotFromElements(fixture.selectedBoundary, fixture.elements, {
    dataTimestamp: fixture.dataTimestamp, fetchedAt: fixture.retrievedAt,
  });
}
const schools = fixture.elements.filter(e => e.tags?.amenity === 'school');
const residential = fixture.elements.filter(e => geography.targetKind(e.tags || {}) === 'residential');
function onSegment(p, a, b) {
  const meters = 111320, lonMeters = meters * Math.cos(p.latitude * Math.PI / 180);
  const dx = (b.longitude - a.longitude) * lonMeters, dy = (b.latitude - a.latitude) * meters;
  const px = (p.longitude - a.longitude) * lonMeters, py = (p.latitude - a.latitude) * meters;
  const t = (px * dx + py * dy) / (dx * dx + dy * dy);
  return t >= -1e-8 && t <= 1 + 1e-8 && Math.hypot(px - t * dx, py - t * dy) < 0.05;
}

test('actual Corkran public footprint and surrounding roads are retained as distinct planning evidence', () => {
  const campus = fixture.elements.find(e => e.type === 'way' && e.id === fixture.schoolFeature.id);
  assert.equal(campus.tags.name, 'Corkran Middle School');
  const campusGeometry = geography.elementPolygons(campus)[0];
  assert.ok(smart.polygonAreaSquareMeters(campusGeometry) > 100000);
  const observed = snapshot();
  assert.ok(observed.landFeatures.some(f => f.kind === 'school' && f.id === String(campus.id)));
  assert.equal(observed.routeWays.filter(r => r.highway === 'residential').length, 55);
  assert.equal(observed.dataTimestamp, fixture.dataTimestamp);
  assert.equal(observed.fetchedAt, fixture.retrievedAt);
  assert.notEqual(observed.dataTimestamp, observed.fetchedAt);
  assert.equal(fixture.elements.length, 341);
});

test('actual geometry-only residential buildings survive absent provider centers and small footprints', () => {
  assert.equal(residential.length, 32);
  assert.ok(residential.every(e => e.type === 'way' && !e.center && e.geometry.length >= 4));
  const observed = snapshot();
  const targets = observed.targetFeatures.filter(f => f.kind === 'residential');
  assert.equal(targets.length, 32, 'Do not drop geometry-only buildings or invent requested-hour targets.');
  assert.deepEqual(new Set(targets.map(f => f.id)), new Set(residential.map(e => `way/${e.id}`)));
  const small = residential.filter(e => smart.polygonAreaSquareMeters(e.geometry.map(p =>
    ({latitude: p.lat, longitude: p.lon}))) < 100);
  assert.equal(small.length, 15, 'The real snapshot contains houses smaller than the minimum useful Zone.');
  for (const target of targets) {
    assert.ok(target.footprint?.length >= 4);
    assert.ok(smart.pointInsidePolygon(target, target.footprint), 'A derived representative point must stay in its actual footprint.');
  }
});

test('actual 21061 school surroundings cannot become assumed 225-house residential work', () => {
  for (const workType of ['flyer_distribution', 'door_hanger_distribution']) {
    const observed = snapshot();
    const result = smart.generatePlan({anchor: fixture.anchor, selectedBoundary: fixture.selectedBoundary,
      geographicSnapshot: observed, desiredHours: 5, workType});
    assert.equal(result.targetEvidence.targetIntent, 'residential');
    assert.equal(result.targetEvidence.verifiedDeliveryPoints, false);
    assert.equal(result.targetEvidence.dataTimestamp, fixture.dataTimestamp);
    assert.ok(result.targetEvidence.observedEligibleFeatureCount > 0);
    assert.ok(result.totalEstimatedProperties === null || result.totalEstimatedProperties <= residential.length);
    assert.notEqual(result.totalEstimatedProperties, 225);
    assert.notEqual(result.quality.label, 'Excellent');
    assert.equal(result.recommendationStatus, 'review_required');
    assert.ok(result.zones.length > 0, 'The repaired parser can use the real surrounding residential evidence.');
    const campusPolygons = schools.flatMap(e => geography.elementPolygons(e));
    assert.ok(campusPolygons.length >= 3, 'The fixture must exercise actual known school footprints.');
    const sourceSegments = observed.routeWays.filter(serviceability.permitted).flatMap(way =>
      way.geometry.slice(1).map((to, i) => ({from: way.geometry[i], to})));
    for (const zone of result.zones) {
      assert.ok(zone.workload.estimatedMinutes <= smart.SINGLE_SCALER_MAX_MINUTES);
      assert.equal(zone.targetEvidence.verifiedDeliveryPoints, false);
      for (const campus of campusPolygons) {
        assert.equal(serviceability.polygonsOverlap(zone.geometry, campus, smart), false,
          'Neither school property nor crossing it may support a proposed residential territory.');
      }
      assert.equal(zone.planningTargets.kind, 'mapped_target_candidates');
      assert.equal(zone.planningTargets.verifiedDeliveryPoints, false);
      assert.ok(zone.planningTargets.features.length > 0);
      assert.equal(zone.planningNetwork.kind, 'connected_mapped_road_network');
      assert.equal(zone.planningNetwork.isExecutionRoute, false);
      assert.equal(zone.planningNetwork.accessVerified, false);
      assert.equal(zone.planningNetwork.suggestedRoute, null);
      assert.ok(zone.planningNetwork.segments.length > 0);
      for (const segment of zone.planningNetwork.segments) {
        assert.ok(smart.pointInsidePolygon(segment.from, zone.geometry));
        assert.ok(smart.pointInsidePolygon(segment.to, zone.geometry));
        // The convex candidate excludes all school footprints. Endpoints
        // inside it ensure the connecting network segment cannot cross campus.
        assert.ok(sourceSegments.some(source => onSegment(segment.from, source.from, source.to) &&
          onSegment(segment.to, source.from, source.to)), 'Network segments must follow actual permitted provider linework.');
      }
    }
    assert.ok(result.totalEstimatedProperties > 0);
  }
});

test('actual 21061 targets without road evidence require manual review rather than a fabricated area', () => {
  const observed = snapshot();
  observed.routeWays = [];
  const result = smart.generatePlan({anchor: fixture.anchor, selectedBoundary: fixture.selectedBoundary,
    geographicSnapshot: observed, desiredHours: 5, workType: 'flyer_distribution'});
  assert.ok(result.targetEvidence.observedEligibleFeatureCount > 0);
  assert.equal(result.recommendationStatus, 'manual_review_required');
  assert.deepEqual(result.zones, []);
  assert.equal(result.totalEstimatedProperties, null);
  assert.equal(result.totalEstimatedMinutes, null);
  assert.equal(result.compensation, null);
  assert.throws(() => smart.assertApplicablePlan(result), /manual_zone_review_required/);
});
