"use strict";
const {test,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Local emulator required');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const c=require('../functions-staging-admin/fixture_creator');
const {AGREEMENTS}=require('../functions-staging-admin/scaler_approval');
const app=initializeApp({projectId:'demo-fixture-creator'}),db=getFirestore(app);
// Private committed geometry is supplied only to the local certification run.
const packet=require(require('node:path').resolve(process.env.QA_GEOMETRY_TEST_FILE));
let authUsers;
const run=(actorUid='admin',data={},projectId=c.PROJECT,retest=false,finalRetest=false)=>c.createFixtureService({db,FieldValue,projectId,retest,finalRetest,
 auth:{getUser:async uid=>{if(!authUsers[uid])throw Error('missing');return authUsers[uid];}}})({actorUid,data});
beforeEach(async()=>{
 for(const collection of await db.listCollections()) await db.recursiveDelete(collection);
 authUsers={};
 for(const [uid,role] of [['admin','admin'],[c.BUSINESS,'business'],...c.FIXTURES.map(f=>[f.scalerUid,'scaler'])]) {
  authUsers[uid]={emailVerified:true,disabled:false};
  await db.doc(`users/${uid}`).set({role,active:true,betaAccess:'approved'});
  if(role==='admin')continue;
  if(role==='scaler')await db.doc(`discoveryPreferences/${uid}`).set({userUid:uid,role,initialSetupCompletedAt:Timestamp.now()});
  for(const [type,v] of Object.entries(AGREEMENTS))if(role==='scaler'||type!=='scaler_work')
   await db.doc(`legalConsents/${uid}_${type}_${v}`).set({uid,agreementType:type,agreementVersion:v,acceptedAt:Timestamp.now()});
 }
 await db.doc(`internalCertificationGeometry/${c.GEOMETRY_VERSION}`).set({projectId:c.PROJECT,immutable:true,version:c.GEOMETRY_VERSION,geometryHash:c.GEOMETRY_HASH,geometry:packet.geometry});
 for(const f of c.FIXTURES)await db.doc(`internalCertificationAuthorities/${f.campaignId}`).set({...f,projectId:c.PROJECT,immutable:true,certificationFixture:true,businessUid:c.BUSINESS});
 await db.doc('campaigns/ordinary').set({status:'draft',businessId:'ordinary'});
});
after(()=>deleteApp(app));

test('fresh retest creation and replay preserve historical records and create no money',async()=>{
 const p=require(require('node:path').resolve(process.env.QA_RETEST_GEOMETRY_TEST_FILE));
 await run();
 const old=await Promise.all(c.FIXTURES.map(async f=>({campaign:(await db.doc(`campaigns/${f.campaignId}`).get()).data(),zone:(await db.doc(`campaignZones/${f.zoneId}`).get()).data()})));
 await db.doc(`internalCertificationGeometry/${p.version}`).set(p);
 const result=await run('admin',{},c.PROJECT,true);
 assert.equal(result.replayed,false);
 assert.equal((await run('admin',{},c.PROJECT,true)).replayed,true);
 assert.equal((await db.collection('campaignZones').get()).size,4);
 for(const f of result.fixtures){
  const z=(await db.doc(`campaignZones/${f.zoneId}`).get()).data();
  assert.ok(Math.abs(z.estimatedWalkingMeters-p.routeDistanceMeters)<.01);
  assert.equal(z.executionRoute.routeHash,p.routeHash);
  assert.equal(z.baseAmountCents,1500);
  assert.equal(z.assignedScalerId,null);
  assert.equal((await db.doc(`campaigns/${f.campaignId}`).get()).data().fundingStatus,'unfunded');
  assert.equal((await db.doc(`adminAuditEvents/${f.auditId}`).get()).data().actionVersion,'DualMobileRetestV2');
 }
 const after=await Promise.all(c.FIXTURES.map(async f=>({campaign:(await db.doc(`campaigns/${f.campaignId}`).get()).data(),zone:(await db.doc(`campaignZones/${f.zoneId}`).get()).data()})));
 assert.deepEqual(after,old);
 for(const name of ['walletTransactions','scalerEarnings','campaignPayments','financialOperations','notifications'])assert.equal((await db.collection(name).get()).size,0);
});
test('atomic concurrent creation makes exactly two unfunded shells and two audits, no economic effects',async()=>{
 const r=await Promise.all([run(),run()]);assert.equal(r.filter(x=>!x.replayed).length,1);
 assert.equal((await db.collection('campaigns').get()).size,3);assert.equal((await db.collection('campaignZones').get()).size,2);
 assert.equal((await db.collection('adminAuditEvents').get()).size,2);
 for(const f of c.FIXTURES){const a=(await db.doc(`campaigns/${f.campaignId}`).get()).data();assert.equal(a.status,'draft');assert.equal(a.fundingStatus,'unfunded');assert.equal(a.certificationScalerUid,f.scalerUid);
 const z=(await db.doc(`campaignZones/${f.zoneId}`).get()).data();assert.equal(z.assignedScalerId,null);assert.equal(z.baseAmountCents,1500);assert.ok(require('./smart_zone_planning').paymentReadiness(z).ready);}
 for(const n of ['notifications','walletTransactions','scalerEarnings','campaignPayments','assignmentCompensations','financialOperations'])assert.equal((await db.collection(n).get()).size,0);
 assert.deepEqual((await db.doc('campaigns/ordinary').get()).data(),{status:'draft',businessId:'ordinary'});
});
test('replay preserves later lifecycle states and immutable timestamps',async()=>{
 await run();const f=c.FIXTURES[0],ref=db.doc(`campaigns/${f.campaignId}`);
 await ref.update({status:'open',fundingStatus:'funded'});const before=(await ref.get()).data();
 assert.equal((await run()).replayed,true);assert.deepEqual((await ref.get()).data(),before);
});
for(const [label,change,error] of [
 ['non-admin',()=>db.doc('users/admin').update({role:'business'}),'admin_required'],
 ['wrong Business',()=>db.doc(`internalCertificationAuthorities/${c.FIXTURES[0].campaignId}`).update({businessUid:'other'}),'authority_mismatch'],
 ['wrong Scaler',()=>db.doc(`internalCertificationAuthorities/${c.FIXTURES[1].campaignId}`).update({scalerUid:'other'}),'authority_mismatch'],
 ['missing consent',()=>db.doc(`legalConsents/${c.FIXTURES[0].scalerUid}_terms_${AGREEMENTS.terms}`).delete(),'consent_required'],
 ['pending Scaler',()=>db.doc(`users/${c.FIXTURES[1].scalerUid}`).update({active:false}),'account_ineligible'],
 ['disabled Scaler',async()=>{authUsers[c.FIXTURES[0].scalerUid].disabled=true;},'account_ineligible'],
 ['missing profile',()=>db.doc(`discoveryPreferences/${c.FIXTURES[0].scalerUid}`).delete(),'profile_incomplete'],
 ['geometry mismatch',()=>db.doc(`internalCertificationGeometry/${c.GEOMETRY_VERSION}`).update({geometry:[]}),'geometry_mismatch'],
 ['partial existing fixture',()=>db.doc(`campaigns/${c.FIXTURES[0].campaignId}`).set({status:'draft'}),'fixture_conflict'],
 ])test(label+' fails closed with zero new shells',async()=>{await change();await assert.rejects(run(),new RegExp(error));assert.equal((await db.collection('campaignZones').get()).size,0);assert.equal((await db.collection('adminAuditEvents').get()).size,0);});
test('compensation conflict cannot be overwritten',async()=>{await run();await db.doc(`campaignZones/${c.FIXTURES[0].zoneId}`).update({baseAmountCents:1});await assert.rejects(run(),/fixture_conflict/);assert.equal((await db.collection('adminAuditEvents').get()).size,2);});


test('V3 concurrent creation is bounded, funds base plus accepted bonus, and preserves V1/V2',async()=>{
 const p=require(require('node:path').resolve(process.env.QA_RETEST_GEOMETRY_TEST_FILE));
 await run();
 await db.doc(`internalCertificationGeometry/${p.version}`).set(p);
 const v2=await run('admin',{},c.PROJECT,true);
 const oldIds=[...c.FIXTURES,...v2.fixtures];
 const snapshot=()=>Promise.all(oldIds.map(async f=>({campaign:(await db.doc(`campaigns/${f.campaignId}`).get()).data(),zone:(await db.doc(`campaignZones/${f.zoneId}`).get()).data()})));
 const before=await snapshot();
 const results=await Promise.all([run('admin',{},c.PROJECT,false,true),run('admin',{},c.PROJECT,false,true)]);
 assert.equal(results.filter(r=>!r.replayed).length,1);
 const result=results[0];
 assert.deepEqual(result.fixtures.map(f=>f.campaignId),['ios_physical_qa_v3','android_physical_qa_v3']);
 for(const [i,f] of result.fixtures.entries()){
  const campaign=(await db.doc(`campaigns/${f.campaignId}`).get()).data();
  const zone=(await db.doc(`campaignZones/${f.zoneId}`).get()).data();
  assert.equal(f.scalerUid,c.FIXTURES[i].scalerUid);
  assert.equal(f.zoneId,c.FIXTURES[i].zoneId.replace('_v1','_v3'));
  assert.equal(campaign.status,'draft');assert.equal(campaign.fundingStatus,'unfunded');
  assert.equal(campaign.workerAmountCents,1800);assert.equal(campaign.basePay,15);assert.equal(campaign.bonus,3);
  assert.equal(campaign.requiredTestFundingCents,2160);assert.equal(campaign.certificationContract.platformFeeCents,360);
  assert.equal(zone.baseAmountCents,1500);assert.equal(zone.bonusAmountCents,300);
  assert.equal(zone.assignedScalerId,null);assert.equal(zone.status,'unassigned');
  assert.equal(zone.executionRoute.corridorHash,p.geometryHash);
  const projection=require('./operational_layer').publicCampaignDocument(f.campaignId,campaign);
  assert.equal(projection.campaignType,'neighborhoodCanvassing');
  assert.match(campaign.name,/Physical Certification.*Retest V3/);
  assert.equal((await db.doc(`adminAuditEvents/${f.auditId}`).get()).data().actionVersion,'DualMobileRetestV3');
 }
 assert.equal((await db.collection('campaignZones').get()).size,6);
 assert.equal((await db.collection('adminAuditEvents').get()).size,6);
 assert.deepEqual(await snapshot(),before);
 for(const n of ['walletTransactions','scalerEarnings','campaignPayments','assignmentCompensations','notifications'])assert.equal((await db.collection(n).get()).size,0);
 await db.doc('campaignZones/ios_physical_qa_zone_v3').update({bonusAmountCents:301});
 await assert.rejects(run('admin',{},c.PROJECT,false,true),/fixture_conflict/);
});
