'use strict';
const assert=require('node:assert/strict'),{test,before,after}=require('node:test');
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required; never run against remote Firestore');
process.env.GCLOUD_PROJECT='scaledcircle-staging';
const fft=require('firebase-functions-test')({projectId:'scaledcircle-staging'});
const completion=require('../functions-completion'), room=require('../functions-job-room').getJobRoom;
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getApps,initializeApp}=require('firebase-admin/app');
if(!getApps().length)initializeApp({projectId:'scaledcircle-staging'});
const db=getFirestore(),r=require('./route_progress');
const call=(fn,uid,data)=>fft.wrap(fn)({data,auth:uid?{uid,token:{email_verified:true}}:undefined});
const line=[{latitude:0,longitude:0},{latitude:.001,longitude:0}],corridor=[...line,{latitude:0,longitude:.001}];
before(async()=>{
 for(const [uid,role]of [['coverage-owner','business'],['coverage-scaler','scaler'],['coverage-other','scaler']])await db.doc('users/'+uid).set({role,active:true});
 await db.doc('campaigns/coverage-c').set({businessId:'coverage-owner',type:'neighborhoodCanvassing',materialFulfillmentType:'no_materials_required'});
 await db.doc('campaignZones/coverage-z').set({campaignId:'coverage-c',businessId:'coverage-owner',assignedScalerId:'coverage-scaler',status:'in_progress',serviceArea:corridor,assignedHomes:23,estimatedWalkingMeters:r.distance(...line),executionRoute:{centerline:line,denominatorMeters:r.distance(...line),routeHash:r.hash(line),corridorHash:r.hash(corridor),checkpoints:[]}});
 await db.doc('jobRooms/coverage-z').set({campaignId:'coverage-c',businessId:'coverage-owner',scalerId:'coverage-scaler',status:'open'});
 await db.doc('assignmentCompensations/coverage-z').set({baseAmountCents:1500,bonusAmountCents:0,immutable:true});
 await db.doc('campaignRoutes/coverage-r').set({campaignId:'coverage-c',zoneId:'coverage-z',scalerId:'coverage-scaler',tracking:false,points:line});
 await db.doc('campaignCompletions/coverage-d').set({campaignId:'coverage-c',zoneId:'coverage-z',scalerId:'coverage-scaler',businessId:'coverage-owner',routeId:'coverage-r',status:'draft'});
 const points=line.map((p,i)=>({...p,sequence:i+1,accepted:true,horizontalAccuracy:5,timestampMs:1000+i*60000}));
 await db.doc('trackingSessions/coverage-s').set({campaignId:'coverage-c',zoneId:'coverage-z',scalerId:'coverage-scaler',status:'completed',startedAt:Timestamp.now(),chunkCount:1,pointCount:2});
 await db.doc('trackingSessions/coverage-s/chunks/chunk').set({sessionId:'coverage-s',zoneId:'coverage-z',scalerId:'coverage-scaler',startSequence:1,points});
});
after(async()=>{fft.cleanup();for(const app of getApps())await app.delete();});
test('ordinary completion and approval fail closed; exception review preserves zero economics',async()=>{
 const before=(await db.doc('campaignZones/coverage-z').get()).data();
 await assert.rejects(call(completion.submitZoneCompletion,'coverage-scaler',{completionId:'coverage-d'}),e=>e.code==='failed-precondition');
 assert.deepEqual((await db.doc('campaignZones/coverage-z').get()).data(),before);
 await assert.rejects(call(completion.submitZoneCompletion,'coverage-other',{completionId:'coverage-d'}));
 const result=await call(completion.submitZoneCompletion,'coverage-scaler',{completionId:'coverage-d',reviewMode:'access_exception',scalerNotes:'Public access blocked; did not enter.'});
 assert.equal(result.eligibleForPayment,false);
 await assert.rejects(call(completion.finalizeZoneReview,'coverage-owner',{zoneId:'coverage-z',decision:'approve'}),e=>e.code==='failed-precondition');
 assert.equal((await db.doc('campaignCompletions/coverage-d').get()).data().calculatedTransferAmountCents,null);
 assert.equal((await db.collection('walletTransactions').where('campaignId','==','coverage-c').get()).empty,true);
 assert.equal((await db.doc('assignmentCompensations/coverage-z').get()).data().baseAmountCents,1500);
});
test('private review evidence available only to maintained members, read-only',async()=>{
 const before=(await db.doc('campaignZones/coverage-z').get()).updateTime;
 for(const uid of ['coverage-owner','coverage-scaler']) {const data=await call(room,uid,{zoneId:'coverage-z'});assert.equal(data.completionEvidence.proofCount,2);assert.equal(data.completionEvidence.policy.payableAmountCents,null);assert.equal(data.completionEvidence.path.length,2);}
 await assert.rejects(call(room,'coverage-other',{zoneId:'coverage-z'}));await assert.rejects(call(room,null,{zoneId:'coverage-z'}));
 assert.ok(before.isEqual((await db.doc('campaignZones/coverage-z').get()).updateTime));
});
