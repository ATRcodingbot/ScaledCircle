'use strict';
const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Local Firestore emulator required');
process.env.GCLOUD_PROJECT='demo-logistics-backend';
const fft=require('firebase-functions-test')({projectId:'demo-logistics-backend'});
const room=require('../functions-job-room').getJobRoom;
const discovery=require('../functions-discovery');
const {getFirestore}=require('firebase-admin/firestore');
const {getApps,initializeApp}=require('firebase-admin/app');
if (!getApps().length) initializeApp({projectId:'demo-logistics-backend'});
const db=getFirestore();
const call=(fn,uid,data,verified=true)=>fft.wrap(fn)({data,auth:uid?{uid,token:{email_verified:verified}}:undefined});
before(async()=>{
 for(const [uid,role] of [['owner','business'],['admin','admin'],['assigned','scaler'],['other','scaler'],['applicant','scaler'],['tenant','business']]) await db.doc('users/'+uid).set({role,active:true});
 await db.doc('campaigns/private-job').set({businessId:'owner',status:'open',materialFulfillmentType:'scaler_pickup_business',materialHandoffAddress:'PRIVATE LOCATION',publicLogistics:{postalCode:'21061'}});
 await db.doc('campaignZones/private-zone').set({campaignId:'private-job',businessId:'owner',assignedScalerId:'assigned',status:'accepted'});
 await db.doc('jobRooms/private-zone').set({campaignId:'private-job',businessId:'owner',scalerId:'assigned',status:'open'});
 await db.doc('assignmentCompensations/private-zone').set({campaignId:'private-job',businessId:'owner',scalerId:'assigned',immutable:true,baseAmountCents:1500,acceptedMaterialLogistics:{location:'PRIVATE LOCATION'}});
});
after(async()=>{fft.cleanup();for(const app of getApps()) await app.delete();});
test('actual Job Room handler enforces identity and revokes exact logistics after cancellation',async()=>{
 for(const uid of ['assigned','owner','admin']) assert.match(JSON.stringify(await call(room,uid,{zoneId:'private-zone'})),/PRIVATE LOCATION/);
 for(const uid of ['other','applicant','tenant',null]) await assert.rejects(call(room,uid,{zoneId:'private-zone'}));
 await assert.rejects(call(room,'assigned',{zoneId:'private-zone'},false));
 await db.doc('campaignZones/private-zone').update({status:'cancelled'});
 const historical=await call(room,'assigned',{zoneId:'private-zone'});
 assert.equal(historical.privateLogisticsAvailable,false);
 assert.doesNotMatch(JSON.stringify(historical),/PRIVATE LOCATION/);
 assert.equal(historical.compensation.baseAmountCents,1500);
 assert.match(JSON.stringify(await call(room,'owner',{zoneId:'private-zone'})),/PRIVATE LOCATION/);
});
test('projection refresh is staging/Admin-only, replaces stale private fields and has no source effects',async()=>{
 const fn=discovery.refreshStagingCampaignDiscovery;
 await assert.rejects(call(fn,'admin',{campaignIds:['private-job']}),e=>e.code==='failed-precondition');
 process.env.GCLOUD_PROJECT='scaledcircle-staging';
 try {
  await assert.rejects(call(fn,'other',{campaignIds:['private-job']}),e=>e.code==='permission-denied');
  await assert.rejects(call(fn,'admin',{campaignIds:['private-job'],privateField:true}));
  const original=(await db.doc('campaigns/private-job').get()).data();
  await db.doc('campaignDiscovery/private-job').set({privateAddress:'PRIVATE STALE'});
  for(let i=0;i<2;i++) assert.equal((await call(fn,'admin',{campaignIds:['private-job']})).sourceRecordsChanged,0);
  const projection=(await db.doc('campaignDiscovery/private-job').get()).data();
  assert.equal(projection.materialLogistics.postalCode,'21061');
  assert.doesNotMatch(JSON.stringify(projection),/PRIVATE/);
  assert.deepEqual((await db.doc('campaigns/private-job').get()).data(),original);
  for(const collection of ['walletTransactions','scalerEarnings','trackingSessions']) assert.equal((await db.collection(collection).get()).empty,true);
 } finally {process.env.GCLOUD_PROJECT='demo-logistics-backend';}
});
