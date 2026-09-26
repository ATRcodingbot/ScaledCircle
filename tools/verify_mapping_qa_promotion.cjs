'use strict';
// Executes prepared exports only against explicit localhost emulators. Providers
// are stubbed; no cloud data, geography API, funding or deployment is accessed.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/);
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.firebase/mapping-qa/promotion-manifest.private.json'), 'utf8'));
async function verify(name) {
  process.env.GCLOUD_PROJECT = 'scaled-circle';
  process.env.GOOGLE_CLOUD_PROJECT = 'scaled-circle';
  process.env.APP_ENV = 'production';
  const entry = manifest.entries.find(e => e.name === name);
  assert.ok(entry);
  assert.deepEqual(require('./prepare_mapping_qa_promotion.cjs').inventory(entry.output), entry.files);
  const functions = require(path.join(entry.output, 'index.js'));
  if (name === 'businessOperationsV1') {
    assert.equal(typeof functions.businessOperationsV1.run, 'function');
    const {intelligence} = require(path.join(entry.output, 'campaign_planning'));
    const operations = require(path.join(entry.output, 'shared/operational_layer'));
    const serviceArea = [{latitude: 39, longitude: -76}, {latitude: 39, longitude: -75.99},
      {latitude: 39.01, longitude: -75.99}, {latitude: 39.01, longitude: -76}];
    const digest = operations.zoneGeometryDigest(serviceArea);
    const legacy = {id: 'synthetic', serviceArea, analysisStatus: 'complete', estimatedHomes: 225,
      serverZoneGeometryDigest: digest, homeCountMethod: 'smart_zone_conservative_density_v1'};
    assert.equal(intelligence([legacy]).zones[0].status, 'unavailable');
    const observed = {...legacy, estimatedHomes: 999, homeCountMethod: 'osm_classified_mapped_features_v2',
      smartZoneTargetEvidence: {geometryDigest: digest, measure: 'mapped_target_features',
        eligibleMappedFeatureCount: 12, source: 'OpenStreetMap', verifiedDeliveryPoints: false,
        targetIntent: 'residential', dataTimestamp: '2026-09-26T00:00:00Z', fetchedAt: '2026-09-26T01:00:00Z'}};
    const out = intelligence([observed]);
    assert.equal(out.zones[0].residentialProperties, 12);
    assert.equal(out.zones[0].metric, 'Mapped residential target features');
    assert.equal(out.zones[0].dataDate, observed.smartZoneTargetEvidence.dataTimestamp);
    assert.equal(out.zones[0].retrievedAt, observed.smartZoneTargetEvidence.fetchedAt);
    assert.equal(out.suggestedQuantity, null);
    assert.equal(out.eligibleDistributionPoints, null);
    assert.equal(intelligence([{...observed, smartZoneTargetEvidence: {...observed.smartZoneTargetEvidence, geometryDigest: 'stale'}}]).zones[0].status, 'unavailable');
    assert.equal(intelligence([{...observed, smartZoneTargetEvidence: {...observed.smartZoneTargetEvidence, dataTimestamp: null}}]).zones[0].dataDate, null);
    await Promise.all(require('firebase-admin/app').getApps().map(app => app.delete()));
    return;
  }
  const geography = require(path.join(entry.output, 'smart_zone_geography'));
  const planner = require(path.join(entry.output, 'smart_zone_planning'));
  const operations = require(path.join(entry.output, 'operational_layer'));
  const f = require(path.join(root, 'functions/smart_zone_geographic_fixtures'));
  const {getFirestore} = require('firebase-admin/firestore'), {getAuth} = require('firebase-admin/auth');
  const {getApps} = require('firebase-admin/app');
  const db = getFirestore(), owner = 'mapping_qa_business', campaignId = 'mapping_qa_' + name;
  await getAuth().createUser({uid: owner, email: `${owner}@example.test`, emailVerified: true}).catch(e => {if (e.code !== 'auth/uid-already-exists') throw e;});
  await db.doc('users/' + owner).set({role: 'business', active: true});
  const boundary = planner.rectangleAround(f.anchor, 1000, 1000);
  await db.doc('campaigns/' + campaignId).set({businessId: owner, executionMode: 'own_team', campaignType: 'flyerDistribution',
    status: 'draft', serviceArea: boundary, serviceAreaTemplateName: 'Synthetic serviceable neighborhood'});
  const prior = await db.collection('campaignZones').where('campaignId', '==', campaignId).get();
  for (const doc of prior.docs) await doc.ref.delete();
  const fixture = geography.snapshotFromElements(boundary, f.grid(), {dataTimestamp: '2026-09-26T00:00:00Z', fetchedAt: '2026-09-26T00:01:00Z'});
  geography.fetchSnapshot = async input => {assert.deepEqual(input.selectedBoundary, boundary); return fixture;};
  const request = {auth: {uid: owner, token: {email_verified: true}}, data: {campaignId, desiredHours: 5}};
  const proposed = await functions.getSmartZonePlan.run(request);
  assert.equal(proposed.totalEstimatedProperties, 48);
  assert.equal(proposed.recommendationStatus, 'review_required');
  assert.ok(proposed.zones.every(z => z.workability !== 'excellent' && z.planningNetwork.isExecutionRoute === false));
  assert.equal((await db.collection('campaignZones').where('campaignId', '==', campaignId).get()).size, 0);
  if (name === 'applySmartZonePlan') {
  const applied = await functions.applySmartZonePlan.run({...request, data: {...request.data, planId: proposed.planId}});
  assert.equal(applied.success, true);
  const saved = await db.collection('campaignZones').where('campaignId', '==', campaignId).get();
  assert.equal(saved.size, proposed.zones.length);
  for (const doc of saved.docs) {
    const zone = doc.data();
    assert.equal(zone.homeCountMethod, 'osm_classified_mapped_features_v2');
    assert.equal(zone.smartZoneTargetEvidence.geometryDigest, operations.zoneGeometryDigest(zone.serviceArea));
    assert.equal(zone.smartZoneTargetEvidence.verifiedDeliveryPoints, false);
    assert.equal(zone.smartZonePlanningTargets.features.length, zone.estimatedHomes);
    assert.equal(zone.smartZonePlanningNetwork.isExecutionRoute, false);
    assert.equal(zone.smartZonePlanningNetwork.suggestedRoute, null);
    assert.equal(zone.executionRoute, undefined);
  }
  await assert.rejects(functions.applySmartZonePlan.run({...request, data: {...request.data, planId: proposed.planId, useRecommendedPay: true}}),
    e => e.code === 'failed-precondition' && /compensation/.test(e.message));
  }
  geography.fetchSnapshot = async () => null;
  const manual = await functions.getSmartZonePlan.run(request);
  assert.equal(manual.recommendationStatus, 'manual_review_required');
  assert.equal(manual.compensation, null);
  const campaignBefore = (await db.doc('campaigns/' + campaignId).get()).data();
  const savedBefore = (await db.collection('campaignZones').where('campaignId', '==', campaignId).get()).docs.map(d => d.id).sort();
  if (name === 'applySmartZonePlan') {
  await assert.rejects(functions.applySmartZonePlan.run({...request, data: {...request.data, planId: manual.planId}}),
    e => e.code === 'failed-precondition' && /not enough reliable geographic evidence/.test(e.message));
  }
  assert.deepEqual((await db.doc('campaigns/' + campaignId).get()).data(), campaignBefore);
  assert.deepEqual((await db.collection('campaignZones').where('campaignId', '==', campaignId).get()).docs.map(d => d.id).sort(), savedBefore);
  await db.doc('campaigns/' + campaignId).update({executionMode: 'marketplace'});
  await assert.rejects(functions.getSmartZonePlan.run(request), e => e.code === 'failed-precondition' && /membership/.test(e.message));
  for (const collection of ['campaignPayments', 'financialOperations', 'walletTransactions', 'scalerTransfers', 'scalerEarnings', 'trackingSessions']) {
    assert.equal((await db.collection(collection).where('campaignId', '==', campaignId).get()).size, 0);
  }
  await Promise.all(getApps().map(app => app.delete()));
}
if (process.argv[2]) verify(process.argv[2]).then(() => console.log('PASS ' + process.argv[2])).catch(e => {console.error(e); process.exitCode = 1;});
else {
  const results = manifest.entries.map(entry => {
    const run = spawnSync(process.execPath, [__filename, entry.name], {cwd: root, encoding: 'utf8', timeout: 60000,
      env: {...process.env, NODE_PATH: path.join(root, 'functions/node_modules')}});
    const success = run.status === 0;
    console.log((success ? 'PASS ' : 'FAIL ') + entry.name);
    if (!success) console.error(run.stderr || run.error || run.stdout);
    return {name: entry.name, success, output: run.stdout, error: run.stderr};
  });
  fs.writeFileSync(path.join(root, '.firebase/mapping-qa/verification.private.json'), JSON.stringify({passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length, results}, null, 2));
  if (results.some(r => !r.success)) process.exitCode = 1;
}
