'use strict';

// Narrow extension of the operator-only production hygiene utility. Not an API,
// not a general waiver of compensation, and never a payment/ledger operation.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const ID = Object.freeze({campaign:'Xt7n9vQfabOBCDz1t50h', business:'IqRjZYHKOzXYuJcSyL68LYNwtDg1',
  zone:'WL8l4lrY2es55IugYPOq', completion:'SkRNk1JJS2Qdq5bcs7SA', route:'eMXS6NLhHru8Drw2nQ3P',
  scaler:'qdVthxPzIRO5vSkQnm0THFAfiwI3'});
const VERSION = 'OwnerConfirmedColumbiaTestRetirementV1';
const AUDIT = `adminAuditEvents/hygiene_test_retirement_${ID.campaign}`;
const roots = ['campaignZones','campaignLocations','campaignPayments','assignmentCompensations',
  'campaignCompletions','campaignRoutes','trackingSessions','zoneGroupAssignments','zoneParticipants',
  'zoneScalerParticipations','materialHandoffs','scalerEarnings','earnings','payouts',
  'financialOperations','walletTransactions','scalerTransfers','campaignSettlements','campaignDiscovery','jobRooms','applications'];
const paths = {
  campaign:`campaigns/${ID.campaign}`, zone:`campaignZones/${ID.zone}`,
  completion:`campaignCompletions/${ID.completion}`, route:`campaignRoutes/${ID.route}`,
  payout:`payouts/${ID.zone}`, discovery:`campaignDiscovery/${ID.campaign}`,
  application:`campaigns/${ID.campaign}/applications/${ID.scaler}`,
  owner:`users/${ID.business}`, scaler:`users/${ID.scaler}`, wallet:`wallets/${ID.business}`,
  grant:`wallets/${ID.business}/transactions/adminGrant_20260810_01`,
  subscription:`wallets/${ID.business}/transactions/zIMg63fJmBeB8Su0IEwq`,
  reserve:`wallets/${ID.business}/transactions/3HbAjDogLvxYq8WPxjFN`,
};
function assertReview(review, actor) {
  assert.equal(review.projectId, 'scaled-circle');
  assert.equal(actor.kind, 'google_iam_admin', 'IAM Admin execution only');
  assert.ok(actor.email?.includes('@')); assert.equal(actor.email, review.operatorEmail);
  assert.deepEqual(review.identity, ID, 'Only the exact reviewed Columbia record is authorized');
  assert.equal(review.ownerConfirmation, 'Test only; no genuine worker obligation');
  assert.equal(review.noGenuineOngoingWork, true);
  assert.equal(review.preserveAllFinancialHistory, true);
  assert.ok(review.authorizationReference?.trim());
}
async function snapshot(db, tx) {
  const read = ref => tx ? tx.get(ref) : ref.get();
  const rows = new Map(), queries = {};
  const add = doc => { if (doc.exists) rows.set(doc.ref.path, {path:doc.ref.path, data:doc.data(),
    version:`${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}`}); };
  for (const path of Object.values(paths)) add(await read(db.doc(path)));
  const pending = roots.map(root => [root, db.collection(root).where('campaignId','==',ID.campaign)]);
  pending.push(['campaignApplications',db.collection(`campaigns/${ID.campaign}/applications`)],
    ['assignedScalers',db.collection(`campaigns/${ID.campaign}/assignedScalers`)],
    ['walletHistory',db.collection(`wallets/${ID.business}/transactions`)],
    ['scheduleItems',db.collection(`businessOperations/${ID.business}/items`).where('campaignId','==',ID.campaign)]);
  // Also follow the maintained Zone bindings if a financial row lacks campaignId.
  for (const root of ['payouts','scalerEarnings','earnings','assignmentCompensations','financialOperations','trackingSessions'])
    pending.push([root+':zone', db.collection(root).where('zoneId','==',ID.zone)]);
  for (const [key, query] of pending) {
    const docs = await read(query.limit(51));
    assert.ok(docs.size <= 50, 'Incomplete bounded inventory is held: '+key);
    queries[key] = docs.docs.map(d => d.ref.path).sort(); docs.docs.forEach(add);
  }
  return {rows:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path)), queries};
}
function noProviderOrActiveWork(value) {
  for (const [key,v] of Object.entries(value || {})) {
    if (/stripe|paymentIntent|fundingPaymentId|campaignPaymentId|checkoutSession|transferId/i.test(key))
      assert.ok(!v, 'Provider economic binding is held: '+key);
    if (['activeTrackingSessionId','resumableTrackingSessionId','gpsTracking','tracking'].includes(key))
      assert.ok(!v || (typeof v === 'object' && !Object.keys(v).length), 'Active work is held: '+key);
    if (['livemode','liveMode'].includes(key)) assert.notEqual(v,true,'LIVE evidence is held');
    if (v && typeof v === 'object' && !Array.isArray(v)) noProviderOrActiveWork(v);
  }
}
function planTestRetirement(state, review, actor) {
  assertReview(review, actor);
  assert.deepEqual(state.rows.map(r=>r.path).sort(), Object.values(paths).sort(),
    'Missing or additional relationship requires review');
  const get = key => state.rows.find(r=>r.path===paths[key]).data;
  const c=get('campaign'), z=get('zone'), done=get('completion'), route=get('route'), payout=get('payout');
  assert.equal(c.businessId,ID.business); assert.equal(c.campaignName,'Columbia');
  assert.equal(c.status,'accepted'); assert.equal(c.fundingStatus,'reserved');
  assert.equal(c.archived===true,false);
  assert.equal(get('owner').email,'attractiveremodel@gmail.com'); assert.equal(get('owner').role,'business');
  assert.equal(get('scaler').role,'scaler');
  for (const data of [c,z,done,route,payout,get('application'),get('discovery')]) noProviderOrActiveWork(data);
  for (const data of [z,done,route,payout,get('application'),get('discovery')]) assert.equal(data.campaignId,ID.campaign);
  for (const data of [z,done,payout,get('application'),get('discovery')]) assert.equal(data.businessId,ID.business);
  assert.equal(z.assignedScalerId,ID.scaler); assert.equal(z.status,'submitted');
  assert.equal(z.submittedCompletionId,ID.completion); assert.equal(z.routeId,ID.route);
  assert.equal(done.scalerId,ID.scaler); assert.equal(done.status,'submitted'); assert.equal(done.routeId,ID.route);
  assert.equal(z.eligibleForPayment,false); assert.equal(done.eligibleForPayment,false);
  assert.equal(route.zoneId,ID.zone); assert.equal(route.scalerId,ID.scaler);
  assert.ok(route.endedAt); assert.equal(route.tracking,false);
  assert.equal(payout.status,'pending_review'); assert.equal(payout.calculationStatus,'redo_required');
  assert.equal(payout.basePay,25); assert.equal(payout.bonus,0); assert.equal(payout.scalerId,ID.scaler);
  assert.equal(get('application').status,'accepted'); assert.equal(get('application').assignedZoneId,ID.zone);
  const grant=get('grant'),reserve=get('reserve'),subscription=get('subscription'),wallet=get('wallet');
  assert.equal(grant.type,'promotional_credit'); assert.equal(grant.developmentOnly,true);
  assert.equal(grant.cashValue,0); assert.equal(grant.amount,10000);
  assert.equal(grant.promoKey,'development-business-10000-v1');
  assert.equal(reserve.type,'campaign_reserve'); assert.equal(reserve.campaignId,ID.campaign);
  assert.equal(reserve.amount,50); assert.equal(reserve.totalCharge,55); assert.equal(reserve.platformFee,5);
  noProviderOrActiveWork(reserve);
  assert.equal(subscription.type,'subscription_payment'); assert.equal(subscription.amount,499);
  assert.equal(wallet.ownerId,ID.business); assert.equal(wallet.ownerType,'business');
  assert.equal(wallet.availableCredits,10000-499-55); assert.equal(wallet.reservedCredits,50);
  const marker={schemaVersion:VERSION,classification:'owner_confirmed_historical_test',
    obligationDisposition:'owner_confirmed_none',authorizationReference:review.authorizationReference,
    auditPath:AUDIT,excludedFromRealPerformance:true};
  const patches={
    [paths.campaign]:{status:'archived',archived:true,archivedBy:actor.email,marketplaceVisible:false,
      acceptingApplications:false,workEntryClosed:true,testRetirement:marker},
    [paths.zone]:{status:'test_retired',testRetirement:marker},
    [paths.completion]:{status:'test_retired',testRetirement:marker},
    [paths.discovery]:{status:'archived',archived:true,marketplaceVisible:false,acceptingApplications:false,
      workEntryClosed:true,testRetirement:marker},
  };
  const plan={version:VERSION,operation:'retire_exact_owner_confirmed_columbia_test',identity:ID,
    review,patches,queries:state.queries,
    refs:state.rows.map(r=>({path:r.path,hash:hash(r.data),version:r.version})),
    // Original operational values are retained in the immutable audit. GPS and
    // unchanged financial/identity documents stay in place and are hash-bound.
    before:state.rows.filter(r=>patches[r.path]),financialRecordsChanged:0};
  return {...plan,seal:hash(plan)};
}
function createTestRetirementService({db,FieldValue,projectId,review,actor}) {
  assert.equal(projectId,'scaled-circle'); assertReview(review,actor);
  const preview=async()=>planTestRetirement(await snapshot(db),review,actor);
  async function execute(seal) {
    assert.match(seal,/^[a-f0-9]{64}$/);
    return db.runTransaction(async tx=>{
      const audit=db.doc(AUDIT),existing=await tx.get(audit);
      if(existing.exists) { assert.equal(existing.data().plan.seal,seal,'Different retirement already recorded');
        return {alreadyComplete:true,seal,auditPath:AUDIT}; }
      const plan=planTestRetirement(await snapshot(db,tx),review,actor);
      assert.equal(plan.seal,seal,'Concurrent evidence change; retirement held');
      for(const [path,patch] of Object.entries(plan.patches)) tx.update(db.doc(path),{...patch,
        updatedAt:FieldValue.serverTimestamp(),testRetiredAt:FieldValue.serverTimestamp(),
        ...(path===paths.campaign?{archivedAt:FieldValue.serverTimestamp()}:{} )});
      tx.create(audit,{schemaVersion:'ProductionHygieneV1',eventType:'production_hygiene_exact_test_retired',
        operatorEmail:actor.email,plan,occurredAt:FieldValue.serverTimestamp()});
      return {seal,auditPath:AUDIT,campaignsRetired:1,queueRecordsRetired:2,financialRecordsChanged:0};
    });
  }
  return {preview,execute};
}
module.exports={TEST_RETIREMENT_ID:ID,TEST_RETIREMENT_PATHS:paths,TEST_RETIREMENT_AUDIT:AUDIT,
  planTestRetirement,createTestRetirementService};
