'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']) {
  assert.match(process.env[key]||'',/^(127\.0\.0\.1|localhost):\d+$/,'Loopback emulators required');
}
const entry=process.env.JOB_ROOM_PRESENTATION_ENTRY;
assert.ok(entry,'Exact prepared candidate required');
process.env.GCLOUD_PROJECT='demo-job-room-presentation';process.env.APP_ENV='production';
const localRequire=require('node:module').createRequire(path.resolve(entry));
const fft=require('firebase-functions-test')({projectId:process.env.GCLOUD_PROJECT});
const fn=localRequire(entry).getJobRoom;
const {getFirestore,Timestamp}=localRequire('firebase-admin/firestore');
const {getAuth}=localRequire('firebase-admin/auth');const {getApps}=localRequire('firebase-admin/app');const db=getFirestore();
const invoke=uid=>fft.wrap(fn)({data:{zoneId:'zone',privacyVersion:'logistics_privacy_v1'},
  auth:uid?{uid,token:{email_verified:true}}:undefined});
let preserved;
before(async()=>{
 for(const [uid,role] of [['owner','business'],['scaler','scaler'],['other','scaler'],['tenant','business'],['admin','admin']]) {
  await getAuth().createUser({uid,email:uid+'@example.invalid',emailVerified:true});
  await db.doc('users/'+uid).set({role,active:true,displayName:uid==='scaler'?'Avery Walker':uid,email:'PRIVATE'});
 }
 await db.doc('campaigns/campaign').set({businessId:'owner',status:'open',campaignName:'Completed work',campaignType:'flyerDistribution',materialFulfillmentType:'scaler_pickup_business',materialHandoffAddress:'PRIVATE'});
 await db.doc('campaignZones/zone').set({campaignId:'campaign',businessId:'owner',assignedScalerId:'scaler',status:'completed',reviewStatus:'approved',approvedBaseAmountCents:1500,approvedBonusAmountCents:300,approvedTransferAmountCents:1800});
 await db.doc('jobRooms/zone').set({campaignId:'campaign',businessId:'owner',scalerId:'scaler',status:'open'});
 await db.doc('assignmentCompensations/zone').set({campaignId:'campaign',zoneId:'zone',businessId:'owner',scalerId:'scaler',baseAmountCents:1500,bonusAmountCents:300,immutable:true,acceptedMaterialLogistics:{location:'PRIVATE'}});
 await db.doc('campaignCompletions/completion').set({campaignId:'campaign',zoneId:'zone',scalerId:'scaler',status:'approved',gpsPointCount:35,submittedAt:Timestamp.fromMillis(1000),scalerEmail:'PRIVATE'});
 await db.doc('walletTransactions/earning_zone_v1').set({campaignId:'campaign',businessId:'owner',zoneId:'zone',scalerId:'scaler',type:'scaler_earnings',amountCents:1800});
 preserved=await state();
});
async function state(){const out={};for(const n of ['users','campaigns','campaignZones','assignmentCompensations','campaignCompletions','walletTransactions','trackingSessions','scalerEarnings'])out[n]=(await db.collection(n).get()).docs.map(d=>({id:d.id,...d.data()}));return out;}
after(async()=>{fft.cleanup();for(const app of getApps())await app.delete();});
test('completed Scaler sees name and recorded amounts without revoked pickup details',async()=>{
 const result=await invoke('scaler');assert.equal(result.privateLogisticsAvailable,false);
 assert.equal(result.participantLabels.participants[0].displayName,'Avery Walker');
 assert.equal(result.completions[0].earning.amountCents,1800);
 assert.equal(result.completions[0].earning.baseAmountCents,1500);
 assert.equal(result.completions[0].earning.bonusAmountCents,300);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|scalerEmail/);
 assert.equal(result.startEligibility.allowed,false);
});
test('owner and Admin receive the evidence; unrelated and signed-out callers remain denied',async()=>{
 for(const uid of ['owner','admin'])assert.equal((await invoke(uid)).completions[0].earning.amountCents,1800);
 for(const uid of [undefined,'other','tenant'])await assert.rejects(invoke(uid));
});
test('reading presentation cannot change users, contracts, evidence, or economic records',async()=>{
 assert.deepEqual(await state(),preserved);
});
