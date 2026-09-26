'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, '.firebase/campaign-authority/promotion-manifest.private.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const {guarded, planning} = require('./prepare_campaign_execution_promotion.cjs');
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/);

async function verifyOne(name) {
  // Both SDKs are pinned to localhost above. This project name is required by
  // the preserved deployed production isolation gates; it cannot reach cloud.
  process.env.GCLOUD_PROJECT = 'scaled-circle';
  process.env.GOOGLE_CLOUD_PROJECT = 'scaled-circle';
  process.env.APP_ENV = 'production';
  const entry = manifest.entries.find(item => item.name === name);
  assert.ok(entry);
  const functions = require(path.join(entry.output, 'index.js'));
  const {getFirestore} = require('firebase-admin/firestore');
  const {getAuth} = require('firebase-admin/auth');
  const {getApps} = require('firebase-admin/app');
  const db = getFirestore(), auth = getAuth();
  const campaignId = 'ownteam_overlay_' + name, owner = 'overlay_business', scaler = 'overlay_scaler';
  const zoneId = campaignId, completionId = campaignId;
  for (const [uid, role] of [[owner, 'business'], [scaler, 'scaler']]) {
    await auth.createUser({uid, email: `${uid}@example.test`, emailVerified: true}).catch(error => {if (error.code !== 'auth/uid-already-exists') throw error;});
    await db.doc('users/' + uid).set({role, active: true});
  }
  const geometry = [{latitude: 39, longitude: -76}, {latitude: 39.001, longitude: -76}, {latitude: 39.001, longitude: -75.999}];
  await db.doc('campaigns/' + campaignId).set({businessId: owner, campaignName: 'Private overlay fixture', campaignType: 'neighborhoodCanvassing', executionMode: 'own_team', status: planning.includes(name) ? 'draft' : 'open', serviceArea: geometry});
  await db.doc('campaignZones/' + zoneId).set({businessId: owner, campaignId, status: planning.includes(name) ? 'unassigned' : 'assigned', assignedScalerId: planning.includes(name) ? null : scaler, serviceArea: geometry});
  await db.doc('campaignCompletions/' + completionId).set({businessId: owner, campaignId, scalerId: scaler});
  await db.doc('payouts/' + campaignId).set({businessId: owner, campaignId, scalerId: scaler});
  const request = {auth: {uid: owner, token: {email_verified: true}}, data: {campaignId}};
  if (['applyToCampaign', 'acceptZoneGroupSlot', 'startTrackingSession', 'initializeCampaignCompletion', 'startCampaignCompletion', 'appendCampaignCompletionEvidence', 'submitCampaignCompletion', 'submitZoneCompletion', 'assignScalerToCampaignLocations', 'reviewCampaignCompletion'].includes(name)) request.auth.uid = scaler;
  if (['assignScalerToZone', 'configureZoneGroupAssignment', 'acceptZoneGroupSlot', 'startTrackingSession', 'finalizeZoneReview'].includes(name)) request.data.zoneId = zoneId;
  if (['startCampaignCompletion', 'appendCampaignCompletionEvidence', 'submitCampaignCompletion', 'submitZoneCompletion', 'reviewCampaignCompletion'].includes(name)) request.data = {completionId};
  if (name === 'approveZonePayout') request.data = {payoutId: campaignId};
  if (guarded.includes(name)) {
    await assert.rejects(functions[name].run(request), error => error.code === 'failed-precondition' && error.details?.reason === 'MARKETPLACE_EXECUTION_REQUIRED', name);
    // Unknown server mode and missing bound parents must also fail closed.
    await db.doc('campaigns/' + campaignId).update({executionMode: 'invalid_server_mode'});
    await assert.rejects(functions[name].run(request), error => error.code === 'failed-precondition', name);
    await db.doc('campaigns/' + campaignId).delete();
    await assert.rejects(functions[name].run(request), error => error.code === 'failed-precondition', name);
  } else if (planning.includes(name)) {
    let called = 0;
    if (name === 'analyzeCampaignZone') {
      require(path.join(entry.output, 'production_mapping_service.js')).analyze = async () => {called++; return {planningOnly: true};};
      request.data = {zoneId};
      assert.deepEqual(await functions[name].run(request), {planningOnly: true});
    } else {
      require(path.join(entry.output, 'smart_zone_geography.js')).fetchSnapshot = async () => {called++; throw Error('synthetic_geography_unavailable');};
      await assert.rejects(functions[name].run(request), error => error.code === 'unavailable');
    }
    assert.equal(called, 1, name + ' must reach planning without a membership');
    if (name === 'applySmartZonePlan') {
      await assert.rejects(functions[name].run({...request, data: {...request.data, useRecommendedPay: true}}), error => error.code === 'failed-precondition' && /compensation/.test(error.message));
      assert.equal(called, 1, 'forged recommended pay never starts plan generation');
    }
  } else {
    await functions[name].run({params: {campaignId}});
    assert.equal((await db.doc('campaignDiscovery/' + campaignId).get()).exists, false);
  }
  for (const collection of ['campaignPayments', 'financialOperations', 'walletTransactions', 'scalerTransfers', 'scalerEarnings', 'trackingSessions']) {
    assert.equal((await db.collection(collection).where('campaignId', '==', campaignId).get()).size, 0, collection);
  }
  await Promise.all(getApps().map(app => app.delete()));
}
if (process.argv[2]) verifyOne(process.argv[2]).then(() => console.log('PASS ' + process.argv[2])).catch(error => {console.error(error); process.exitCode = 1;});
else {
  const results = [];
  for (const entry of manifest.entries) {
    const result = spawnSync(process.execPath, [__filename, entry.name], {cwd: root, env: {...process.env, NODE_PATH: path.join(root, 'functions/node_modules')}, encoding: 'utf8', timeout: 30000});
    const success = result.status === 0;
    results.push({name: entry.name, success, output: result.stdout, error: result.stderr});
    console.log((success ? 'PASS ' : 'FAIL ') + entry.name);
    if (!success) console.error(result.stderr || result.error || result.stdout);
  }
  fs.writeFileSync(path.join(root, '.firebase/campaign-authority/verification.private.json'), JSON.stringify({passed: results.filter(result => result.success).length, failed: results.filter(result => !result.success).length, results}, null, 2));
  if (results.some(result => !result.success)) process.exitCode = 1;
}
