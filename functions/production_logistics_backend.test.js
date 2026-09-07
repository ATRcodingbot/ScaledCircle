'use strict';
const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('Auth and Firestore emulators required');
process.env.GCLOUD_PROJECT='demo-production-privacy';
const fft=require('firebase-functions-test')({projectId:process.env.GCLOUD_PROJECT});
const handlers=require('../functions-logistics-access');
const accessRequire=require('node:module').createRequire(require.resolve('../functions-logistics-access'));
const {getFirestore}=accessRequire('firebase-admin/firestore');
const {getAuth}=accessRequire('firebase-admin/auth');
const {getApps}=accessRequire('firebase-admin/app');
const db=getFirestore();
const invoke=(name,uid,data={})=>fft.wrap(handlers[name])({data,auth:uid?{uid,token:{email_verified:true}}:undefined});
before(async()=>{
 for(const [uid,role,active] of [['admin','admin',true],['scaler','scaler',true],['other','scaler',true],['owner','business',true],['inactive','scaler',false]]) {
  await getAuth().createUser({uid,email:uid+'@example.invalid',emailVerified:true});
  await db.doc('users/'+uid).set({role,active});
 }
 await db.doc('campaigns/job').set({businessId:'owner',campaignName:'Campaign',type:'neighborhoodCanvassing',status:'open',materialHandoffAddress:'PRIVATE'});
 await db.doc('campaignLocations/location').set({campaignId:'job',businessId:'owner',assignedScalerId:'scaler',status:'assigned',address:'PRIVATE'});
});
after(async()=>{fft.cleanup();for(const app of getApps())await app.delete();});
test('production ID authority validates real auth, exact role and lifecycle without exposing logistics',async()=>{
 assert.deepEqual(await invoke('listAssignedLocationIdsV1','scaler'),{locationIds:['location']});
 assert.deepEqual(await invoke('listAssignedLocationIdsV1','other'),{locationIds:[]});
 for(const uid of [null,'owner','admin','inactive'])await assert.rejects(invoke('listAssignedLocationIdsV1',uid));
 await assert.rejects(invoke('listAssignedLocationIdsV1','scaler',{uid:'other'}));
 await getAuth().updateUser('scaler',{disabled:true});
 await assert.rejects(invoke('listAssignedLocationIdsV1','scaler'));
 await getAuth().updateUser('scaler',{disabled:false,emailVerified:false});
 await assert.rejects(invoke('listAssignedLocationIdsV1','scaler'));
 await getAuth().updateUser('scaler',{emailVerified:true});
 await db.doc('campaignLocations/location').update({status:'completed'});
 assert.deepEqual(await invoke('listAssignedLocationIdsV1','scaler'),{locationIds:[]});
});
test('bounded seed compares exact revision, replaces stale fields and audits exactly once',async()=>{
 const source=await db.doc('campaigns/job').get();
 const stamp=source.updateTime;
 const updateTime=new Date(stamp.seconds*1000).toISOString().replace('.000Z','.'+String(stamp.nanoseconds).padStart(9,'0')+'Z');
 const data={campaigns:[{id:'job',updateTime}]};
 await assert.rejects(invoke('seedCampaignDiscoveryV1','owner',data));
 await assert.rejects(invoke('seedCampaignDiscoveryV1','admin',{campaigns:[{id:'job',updateTime:'2000-01-01T00:00:00Z'}]}));
 await db.doc('campaignDiscovery/job').set({address:'PRIVATE'});
 const first=await invoke('seedCampaignDiscoveryV1','admin',data);
 assert.equal(first.alreadyApplied,false);
 assert.equal((await invoke('seedCampaignDiscoveryV1','admin',data)).alreadyApplied,true);
 assert.equal((await db.collection('privacyMigrationAudit').get()).size,1);
 assert.doesNotMatch(JSON.stringify((await db.doc('campaignDiscovery/job').get()).data()),/PRIVATE/);
 assert.deepEqual((await db.doc('campaigns/job').get()).data(),source.data());
});
test('replayed projection uses current source, closes and deletes without resurrection',async()=>{
 const project=fft.wrap(handlers.projectCampaignDiscoveryV1);
 await db.doc('campaigns/job').update({status:'completed'});
 await project({params:{campaignId:'job'}});
 assert.equal((await db.doc('campaignDiscovery/job').get()).data().status,'completed');
 await db.doc('campaigns/job').delete();
 await project({params:{campaignId:'job'}});
 await project({params:{campaignId:'job'}});
 assert.equal((await db.doc('campaignDiscovery/job').get()).exists,false);
 for(const c of ['walletTransactions','scalerEarnings','trackingSessions','campaignPayments'])assert.equal((await db.collection(c).get()).empty,true);
});
test('production authority cannot run in an unintended environment',async()=>{
 const previous=process.env.GCLOUD_PROJECT;process.env.GCLOUD_PROJECT='unintended-project';
 try{await assert.rejects(invoke('listAssignedLocationIdsV1','scaler'),e=>e.code==='failed-precondition');}
 finally{process.env.GCLOUD_PROJECT=previous;}
});
test('reputation exposes only authoritative count without private campaign records',async()=>{
 await db.doc('campaigns/history').set({completedBy:'scaler',status:'completed',address:'PRIVATE'});
 await db.doc('campaigns/not-complete').set({completedBy:'scaler',status:'open'});
 assert.deepEqual(await invoke('getReputationCompletionCountV1','owner',{userId:'scaler'}),{completedCount:1,source:'completed_campaigns'});
 await assert.rejects(invoke('getReputationCompletionCountV1',null,{userId:'scaler'}));
 await assert.rejects(invoke('getReputationCompletionCountV1','scaler',{userId:'missing'}));
});
