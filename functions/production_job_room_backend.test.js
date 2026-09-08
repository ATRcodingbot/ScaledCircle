'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Local emulators required');
process.env.GCLOUD_PROJECT='demo-production-job-room';
const path=require('node:path');
const entry=path.resolve(__dirname,'../.firebase/production-launch/job-room/index.js');
const packageRequire=require('node:module').createRequire(entry);
const fft=require('firebase-functions-test')({projectId:process.env.GCLOUD_PROJECT});
const fn=require(entry).getJobRoom;
const {getFirestore}=packageRequire('firebase-admin/firestore');
const {getAuth}=packageRequire('firebase-admin/auth');
const {getApps}=packageRequire('firebase-admin/app');
const db=getFirestore();
const call=(uid,version='logistics_privacy_v1')=>fft.wrap(fn)({data:{zoneId:'zone',privacyVersion:version},auth:uid?{uid,token:{email_verified:true}}:undefined});
before(async()=>{
 for(const [uid,role]of [['owner','business'],['admin','admin'],['assigned','scaler'],['other','scaler'],['tenant','business']]){
  await getAuth().createUser({uid,email:uid+'@example.invalid',emailVerified:true});
  await db.doc('users/'+uid).set({role,active:role!=='admin'});
 }
 await db.doc('campaigns/campaign').set({businessId:'owner',status:'open',campaignName:'Campaign',campaignType:'flyerDistribution',materialFulfillmentType:'scaler_pickup_business',materialHandoffAddress:'PRIVATE'});
 await db.doc('campaignZones/zone').set({campaignId:'campaign',businessId:'owner',assignedScalerId:'assigned',status:'assigned'});
 await db.doc('jobRooms/zone').set({campaignId:'campaign',businessId:'owner',scalerId:'assigned',status:'open'});
 await db.doc('assignmentCompensations/zone').set({campaignId:'campaign',businessId:'owner',scalerId:'assigned',baseAmountCents:1500,immutable:true,acceptedMaterialLogistics:{location:'PRIVATE'}});
});
after(async()=>{fft.cleanup();for(const app of getApps())await app.delete();});
test('patched deployed Job Room retains owner/Admin and exact active assignee, denies other actors',async()=>{
 for(const uid of ['owner','admin','assigned'])assert.match(JSON.stringify(await call(uid)),/PRIVATE/);
 for(const uid of ['other','tenant',null])await assert.rejects(call(uid));
 await assert.rejects(call('assigned',null),e=>e.code==='failed-precondition'&&e.message.includes('Update ScaledCircle'));
 await getAuth().updateUser('assigned',{disabled:true});
 await assert.rejects(call('assigned'));
 await getAuth().updateUser('assigned',{disabled:false});
});
test('submitted, completed and canceled Job Rooms revoke precise Scaler logistics and retain owner evidence',async()=>{
 for(const status of ['submitted','completed','cancelled']){
  await db.doc('campaignZones/zone').update({status});
  const response=await call('assigned');
  assert.equal(response.privateLogisticsAvailable,false);
  assert.doesNotMatch(JSON.stringify(response),/PRIVATE/);
  assert.equal(response.compensation.baseAmountCents,1500);
  assert.match(JSON.stringify(await call('owner')),/PRIVATE/);
 }
 await db.doc('campaignZones/zone').update({businessId:'tenant'});
 await assert.rejects(call('assigned'));
 for(const c of ['walletTransactions','scalerEarnings','trackingSessions'])assert.equal((await db.collection(c).get()).empty,true);
});
test('pinned production Job Room permits delegated review and revokes removed members immediately',async()=>{
 await getAuth().createUser({uid:'finance-member',email:'finance-member@example.invalid',emailVerified:true});
 await db.doc('users/finance-member').set({role:'business',active:false,activeBusinessId:'owner'});
 await db.doc('businessSubscriptions/owner').set({plan:'growth',status:'active',expiresAt:packageRequire('firebase-admin/firestore').Timestamp.fromMillis(Date.now()+86400000)});
 await db.doc('businessWorkspaces/owner/members/finance-member').set({uid:'finance-member',businessId:'owner',status:'active',seatIndex:1,permissions:['payments']});
 await db.doc('campaignZones/zone').update({businessId:'owner',status:'submitted'});
 assert.match(JSON.stringify(await call('finance-member')),/PRIVATE/);
 await db.doc('businessWorkspaces/owner/members/finance-member').update({status:'removed'});
 await assert.rejects(call('finance-member'));
});
test('production evidence retains completed Scaler result and relevant notes without active tracking',async()=>{
 const evidence=require('./production_job_room_evidence');
 const {VERSION}=require('./production_canvassing_contract');
 await db.doc('campaigns/campaign').update({completionPolicyVersion:VERSION});
 await db.doc('campaignZones/zone').update({businessId:'owner',status:'completed',completionPolicyVersion:VERSION});
 await db.doc('trackingSessions/closed').set({zoneId:'zone',campaignId:'campaign',scalerId:'assigned',status:'completed',startedAt:packageRequire('firebase-admin/firestore').Timestamp.now()});
 await db.doc('trackingSessions/closed/workNotes/note').set({kind:'access',note:'Authorized access unavailable',createdAt:packageRequire('firebase-admin/firestore').Timestamp.now()});
 const result=await evidence.read({db,zoneId:'zone',uid:'assigned'});
 assert.equal(result.trackingActive,false);assert.equal(result.sessionStatus,'completed');
 assert.equal(result.workNotes[0].note,'Authorized access unavailable');
 assert.equal(result.historicalCalculatedAmountCents,null);
 assert.equal(await evidence.read({db,zoneId:'zone',uid:'other'}),null);
});
