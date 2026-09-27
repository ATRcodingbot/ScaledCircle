'use strict';
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.GCLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT = 'demo-scaledcircle';
const functions = require('./index');
const {getFirestore, FieldValue, Timestamp} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const {getApps} = require('firebase-admin/app');
const {createAuthority} = require('../functions-business-operations/authority');
const {createService} = require('../functions-business-operations/service');
const db = getFirestore(), auth = getAuth();
const service = createService({db, FieldValue, authority: createAuthority({db, auth, FieldValue, Timestamp, project: 'demo-scaledcircle'})});
let b, other, worker, manager, observer;
async function user(role = 'business') {
  const uid = 'list_' + crypto.randomUUID();
  await auth.createUser({uid, email: uid + '@example.test', emailVerified: true});
  await db.doc('users/' + uid).set({role, active: true});
  for (const [type, version] of Object.entries(require('./legal_consent').AGREEMENTS)) await db.doc(`legalConsents/${uid}_${type}_${version}`).set({uid, agreementType: type, agreementVersion: version});
  await db.doc('marketProfiles/' + uid).set({role, stateId: 'us_census_tigerweb:state:24', selectionSource: 'explicit_user_selection'});
  return uid;
}
before(async () => {
  b = await user(); other = await user(); worker = await user('scaler'); manager = await user(); observer = await user();
  await db.doc('marketRollout/config').set(require('./market_rollout').initialConfig());
  await db.doc('businessSubscriptions/' + b).set({status: 'active', plan: 'growth', expiresAt: Timestamp.fromMillis(Date.now() + 86400000)});
  for (const [uid, permissions, seatIndex] of [[manager, ['campaigns'], 1], [observer, ['analytics'], 2]]) await db.doc(`businessWorkspaces/${b}/members/${uid}`).set({uid, businessId: b, permissions, status: 'active', seatIndex});
});
after(async () => Promise.all(getApps().map(a => a.delete())));
async function seed(patch = {}) {
  const c = 'list_' + crypto.randomUUID();
  await db.doc('campaigns/' + c).set({businessId: b, campaignName: 'Synthetic unfinished draft', status: 'draft', executionMode: 'marketplace', ...patch});
  return c;
}
function call(operation, c, input = {}, uid = b, requestId = crypto.randomUUID(), businessId = b) {
  return service.execute({auth: uid ? {uid, token: {email_verified: true}} : null, data: {businessId, operation, input: {campaignId: c, ...input}, requestId}});
}
const preview = (c, uid = b) => call('campaignListActions', c, {}, uid);
async function change(c, action, uid = b, requestId = crypto.randomUUID()) {
  const p = await preview(c, uid);
  return call('changeCampaignListState', c, {action, expectedVersion: p.version}, uid, requestId);
}
const saved = async c => (await db.doc('campaigns/' + c).get()).data();

test('incomplete draft without any territory is deletable by campaign manager; audit and shared assets survive', async () => {
  const c = await seed();
  await db.doc('marketingAssets/shared_' + c).set({campaignId: c, usedBy: ['another_campaign'], source: 'fixture'});
  assert.deepEqual((await preview(c, manager)).actions, ['delete']);
  assert.equal((await change(c, 'delete', manager)).confirmed, true);
  assert.equal((await saved(c)).status, 'deleted');
  assert.equal((await db.doc('marketingAssets/shared_' + c).get()).exists, true);
  const audit = await db.collection(`businessWorkspaces/${b}/activity`).where('campaignId', '==', c).get();
  assert.equal(audit.size, 1); assert.equal(audit.docs[0].data().actorUid, manager);
});
test('eligible mapped draft deletion retains geometry and audit rather than blind cascade', async () => {
  const c = await seed(); await db.doc('campaignZones/' + c).set({businessId: b, campaignId: c, status: 'unassigned', assignedScalerId: null});
  await change(c, 'delete'); assert.equal((await db.doc('campaignZones/' + c).get()).exists, true);
});
for (const status of ['payment_pending', 'funded', 'reserved', 'refund_pending', 'disputed']) test('draft ' + status + ' blocks deletion', async () => {
  const c = await seed({fundingStatus: status});
  assert.deepEqual((await preview(c)).actions, []); await assert.rejects(change(c, 'delete'), {code: 'failed-precondition'});
  assert.equal((await saved(c)).status, 'draft');
});
test('even hidden or failed payment operation history requires reconciliation, not orphaning', async () => {
  for (const col of ['campaignPayments', 'financialOperations', 'walletTransactions', 'scalerTransfers']) {
    const c = await seed(); await db.doc(col + '/' + c).set({campaignId: c, status: 'unknown'});
    await assert.rejects(change(c, 'delete'), {code: 'failed-precondition'});
  }
});
test('stale draft label with accepted work cannot delete', async () => {
  const c = await seed(); await db.doc(`campaigns/${c}/applications/${worker}`).set({scalerId: worker, status: 'accepted'});
  await assert.rejects(change(c, 'delete'), {code: 'failed-precondition'});
});
test('signed-out, cross-workspace, analyst, disabled and Admin callers are denied', async () => {
  const c = await seed(), admin = await user('admin');
  for (const uid of [null, other, observer, admin]) await assert.rejects(preview(c, uid), e => ['permission-denied', 'unauthenticated'].includes(e.code));
  await assert.rejects(call('campaignListActions', c, {}, other, crypto.randomUUID(), other), {code: 'permission-denied'});
  await auth.updateUser(manager, {disabled: true}); await assert.rejects(preview(c, manager), {code: 'permission-denied'}); await auth.updateUser(manager, {disabled: false});
});
test('permission revocation while dialog open is rechecked', async () => {
  const c = await seed(), p = await preview(c, manager);
  await db.doc(`businessWorkspaces/${b}/members/${manager}`).update({permissions: ['analytics']});
  await assert.rejects(call('changeCampaignListState', c, {action: 'delete', expectedVersion: p.version}, manager), {code: 'permission-denied'});
  await db.doc(`businessWorkspaces/${b}/members/${manager}`).update({permissions: ['campaigns']});
});
test('unassigned active campaign closes with pending applications preserved and no money mutation', async () => {
  const c = await seed({status: 'open', fundingStatus: 'funded'});
  await db.doc(`campaigns/${c}/applications/${worker}`).set({scalerId: worker, status: 'pending'});
  await db.doc('campaignPayments/' + c).set({campaignId: c, status: 'paid', fundingAllocation: {reserveCents: 10000}});
  const p = await preview(c); assert.deepEqual(p.actions, ['close']); assert.match(p.financialNotice, /No refund is requested/);
  await change(c, 'close'); const d = await saved(c); assert.equal(d.status, 'closed'); assert.equal(d.acceptingApplications, false);
  assert.equal(d.fundingStatus, 'funded'); assert.equal((await db.doc('campaignPayments/' + c).get()).data().fundingAllocation.reserveCents, 10000);
  assert.equal((await db.doc(`campaigns/${c}/applications/${worker}`).get()).data().status, 'pending');
});
for (const [col, row] of [['campaignZones', {status: 'assigned', assignedScalerId: 'worker'}], ['campaignLocations', {status: 'assigned'}],
  ['assignmentCompensations', {immutable: true}], ['campaignCompletions', {status: 'submitted'}], ['trackingSessions', {status: 'in_progress'}],
  ['zoneGroupAssignments', {}], ['payouts', {status: 'pending_review'}]]) test(col + ' blocks ordinary close and archive', async () => {
  const c = await seed({status: 'open'}); await db.doc('campaignZones/empty_' + c).set({campaignId: c, status: 'unassigned'});
  await db.doc(col + '/' + c).set({businessId: b, campaignId: c, ...row});
  assert.deepEqual((await preview(c)).actions, []);
  for (const action of ['close', 'archive', 'delete']) await assert.rejects(change(c, action), {code: 'failed-precondition'});
});
test('own-team internal assignments cannot be treated as unassigned marketplace work', async () => {
  const c = await seed({status: 'own_team_scheduled', executionMode: 'own_team', scheduleItemId: 'item_fixture'});
  await db.doc(`businessOperations/${b}/items/item_fixture`).set({businessId: b, campaignId: c, sourceKind: 'own_team_campaign', assignedPeople: ['crew:one'], status: 'open'});
  await assert.rejects(change(c, 'close'), {code: 'failed-precondition'});
  await db.doc(`businessOperations/${b}/items/item_fixture`).update({assignedPeople: []}); await change(c, 'close');
  assert.equal((await db.doc(`businessOperations/${b}/items/item_fixture`).get()).data().status, 'canceled');
});
test('missing or mismatched direct schedule/payment bindings fail closed', async () => {
  for (const field of ['scheduleItemId', 'fundingPaymentId']) {
    const c = await seed({status: 'open', [field]: 'bound_' + crypto.randomUUID()});
    await assert.rejects(preview(c), {code: 'failed-precondition'});
    const value = (await saved(c))[field];
    const ref = db.doc(field === 'scheduleItemId' ? `businessOperations/${b}/items/${value}` : 'campaignPayments/' + value);
    await ref.set({status: 'open'});
    await assert.rejects(preview(c), {code: 'failed-precondition'});
    await ref.update({campaignId: 'another_campaign'});
    await assert.rejects(preview(c), {code: 'failed-precondition'});
  }
});
test('archive/restore preserves completed state, identity and unresolved obligations; reconciliation remains writable', async () => {
  const c = await seed({status: 'completed', fundingStatus: 'refund_pending'});
  const p = db.doc('campaignPayments/' + c); await p.set({campaignId: c, status: 'refund_pending', obligationCents: 1000});
  await db.doc('assignmentCompensations/' + c).set({campaignId: c, immutable: true});
  await change(c, 'archive'); assert.equal((await saved(c)).status, 'completed'); assert.equal((await saved(c)).archived, true);
  assert.deepEqual((await preview(c)).actions, ['restore']);
  await p.update({status: 'refunded'}); // Synthetic provider reconciliation does not consult organizational visibility.
  await change(c, 'restore'); assert.equal((await saved(c)).status, 'completed'); assert.equal((await saved(c)).archived, false);
  assert.equal((await p.get()).data().obligationCents, 1000); assert.equal((await p.get()).data().status, 'refunded');
  assert.equal((await db.doc('assignmentCompensations/' + c).get()).data().immutable, true);
});
test('duplicate clicks and retry after lost response reuse one receipt/audit', async () => {
  const c = await seed(), p = await preview(c), key = crypto.randomUUID();
  const invoke = () => call('changeCampaignListState', c, {action: 'delete', expectedVersion: p.version}, b, key);
  const outcomes = await Promise.all([invoke(), invoke()]); assert.ok(outcomes.every(r => r.confirmed));
  assert.equal((await invoke()).duplicate, true);
  assert.equal((await db.collection(`businessWorkspaces/${b}/activity`).where('campaignId', '==', c).get()).size, 1);
  await assert.rejects(call('changeCampaignListState', c, {action: 'archive', expectedVersion: p.version}, b, key), {code: 'already-exists'});
});
test('changed name/state/Zone after preview rejects outdated confirmation', async () => {
  const c = await seed(), p = await preview(c); await db.doc('campaigns/' + c).update({campaignName: 'Changed'});
  await assert.rejects(call('changeCampaignListState', c, {action: 'delete', expectedVersion: p.version}), {code: 'aborted'});
  const next = await preview(c); await db.doc('campaignZones/' + c).set({campaignId: c, status: 'unassigned'});
  await assert.rejects(call('changeCampaignListState', c, {action: 'delete', expectedVersion: next.version}), {code: 'aborted'});
});
test('actual exact-location assignment racing closure has exactly one winner', async () => {
  for (let i = 0; i < 5; i++) {
    const c = await seed({status: 'open'}), locationId = 'loc_' + c;
    await db.doc(`campaigns/${c}/applications/${worker}`).set({scalerId: worker, status: 'pending', campaignId: c});
    await db.doc('campaignLocations/' + locationId).set({campaignId: c, businessId: b, status: 'pending'});
    const p = await preview(c);
    const out = await Promise.allSettled([
      call('changeCampaignListState', c, {action: 'close', expectedVersion: p.version}),
      functions.assignScalerToCampaignLocations.run({auth: {uid: b, token: {email_verified: true}}, data: {campaignId: c, applicationId: worker, locationIds: [locationId]}}),
    ]);
    assert.equal(out.filter(r => r.status === 'fulfilled').length, 1, JSON.stringify(out));
    const campaign = await saved(c), location = (await db.doc('campaignLocations/' + locationId).get()).data();
    assert.ok(campaign.status === 'closed' ? !location.assignedScalerId : location.assignedScalerId === worker);
  }
});
test('legacy draft-delete callable uses same preserved-history authority', async () => {
  const c = await seed(); const req = {auth: {uid: b, token: {email_verified: true}}, data: {campaignId: c}};
  assert.equal((await functions.deleteDraftCampaign.run(req)).confirmed, true);
  assert.equal((await functions.deleteDraftCampaign.run(req)).alreadyDeleted, true);
});
test('assigned-first rejects closure and closed-first rejects exact-location assignment', async () => {
  for (const first of ['assign', 'close']) {
    const c = await seed({status:'open'}), locationId = 'loc_' + c;
    await db.doc(`campaigns/${c}/applications/${worker}`).set({scalerId:worker,status:'pending',campaignId:c});
    await db.doc('campaignLocations/'+locationId).set({businessId:b,campaignId:c,status:'pending'});
    const assign = () => functions.assignScalerToCampaignLocations.run({auth:{uid:b,token:{email_verified:true}},data:{campaignId:c,applicationId:worker,locationIds:[locationId]}});
    if(first==='assign') {await assign(); await assert.rejects(change(c,'close'),{code:'failed-precondition'});}
    else {await change(c,'close'); await assert.rejects(assign(),{code:'failed-precondition'});}
  }
});
test('payment initiation and delete cannot both commit; pending attempt is retained', async () => {
  const c = await seed(), p = await preview(c);
  const payment = () => db.runTransaction(async tx => {
    const ref=db.doc('campaigns/'+c), current=(await tx.get(ref)).data();
    if(current.status!=='draft')throw Object.assign(Error('Draft unavailable'),{code:'failed-precondition'});
    tx.update(ref,{fundingStatus:'payment_pending'});
    tx.create(db.doc('campaignPayments/'+c),{campaignId:c,status:'payment_pending'});
  });
  const out=await Promise.allSettled([payment(),call('changeCampaignListState',c,{action:'delete',expectedVersion:p.version})]);
  assert.equal(out.filter(r=>r.status==='fulfilled').length,1);
  const d=await saved(c), paid=(await db.doc('campaignPayments/'+c).get()).exists;
  assert.equal(d.status==='deleted',!paid);
});
test('actual provider reconciliation retains Closed/archive visibility and changes only financial state', async () => {
  const fs=require('node:fs'),parser=require('@babel/parser');
  const source=fs.readFileSync(require.resolve('../functions-campaign-funding/index.js'),'utf8');
  const n=parser.parse(source).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='transition');
  const reconcile=new Function('db','FieldValue','lifecycle','campaignExecution','HttpsError','return ('+source.slice(n.start,n.end)+')')(db,FieldValue,
    require('../functions-campaign-funding/campaign_funding_lifecycle'),require('./campaign_execution_authority'),require('firebase-functions/v2/https').HttpsError);
  for(const initial of [{status:'open'},{status:'completed'}]) {
    const c=await seed({...initial,fundingStatus:'funded'}), ref=db.doc('campaignPayments/'+c);
    await ref.set({campaignId:c,status:'paid',workerAmountCents:10000});
    await change(c,initial.status==='open'?'close':'archive');
    await reconcile(c,{status:'disputed'},{status:'funding_review_required',fundingStatus:'disputed',fundingReviewRequired:true});
    assert.equal((await ref.get()).data().status,'disputed');assert.equal((await ref.get()).data().workerAmountCents,10000);
    assert.equal((await saved(c)).status,initial.status==='open'?'closed':'completed');
    assert.equal((await saved(c)).fundingStatus,'disputed');
  }
});
test('closed campaign rejects actual application, assignment, group and start entry handlers', async () => {
  const c = await seed({status: 'closed', workEntryClosed: true});
  await db.doc('campaignZones/' + c).set({businessId: b, campaignId: c, assignedScalerId: worker, status: 'assigned'});
  await db.doc(`campaigns/${c}/applications/${worker}`).set({campaignId: c, scalerId: worker, status: 'pending'});
  await db.doc('campaignCompletions/' + c).set({campaignId: c, scalerId: worker, status: 'draft'});
  for (const [name, uid, data] of [
    ['applyToCampaign', worker, {campaignId: c}],
    ['assignScalerToZone', b, {campaignId: c, zoneId: c, applicationId: worker}],
    ['configureZoneGroupAssignment', b, {campaignId: c, zoneId: c, requiredScalerCount: 1}],
    ['startAssignedZone', worker, {campaignId: c, zoneId: c}],
    ['startTrackingSession', worker, {campaignId: c, zoneId: c}],
    ['startCampaignCompletion', worker, {completionId: c}],
  ]) await assert.rejects(functions[name].run({auth: {uid, token: {email_verified: true}}, data}), e => ['failed-precondition', 'permission-denied', 'invalid-argument'].includes(e.code), name);
});
