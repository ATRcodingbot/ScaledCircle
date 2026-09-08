'use strict';
const assert=require('node:assert/strict'),{test,before,after}=require('node:test');
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required; never run against remote Firestore');
process.env.GCLOUD_PROJECT='scaledcircle-staging';
const fft=require('firebase-functions-test')({projectId:'scaledcircle-staging'});
const completion=require('../functions-completion'), room=require('../functions-job-room').getJobRoom;
const tracking=require('../functions-legacy').getTrackingSessionState;
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getApps,initializeApp}=require('firebase-admin/app');
if(!getApps().length)initializeApp({projectId:'scaledcircle-staging'});
const db=getFirestore(),r=require('./route_progress');
const call=(fn,uid,data)=>fft.wrap(fn)({data,auth:uid?{uid,token:{email_verified:true}}:undefined});
const line=[{latitude:0,longitude:0},{latitude:.001,longitude:0}],corridor=[...line,{latitude:0,longitude:.001}];
before(async()=>{
 if(!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth emulator required');
 const auth=require('firebase-admin/auth').getAuth();
 for(const uid of ['coverage-owner', 'coverage-scaler', 'coverage-other']) {try{await auth.createUser({uid,email:`${uid}@example.test`,emailVerified:true});}catch(e){if(e.code!=='auth/uid-already-exists')throw e;}}

 for(const [uid,role]of [['coverage-owner','business'],['coverage-scaler','scaler'],['coverage-other','scaler']])await db.doc('users/'+uid).set({role,active:true});
 await db.doc('campaigns/coverage-c').set({businessId:'coverage-owner',type:'neighborhoodCanvassing',materialFulfillmentType:'no_materials_required'});
 await db.doc('campaignZones/coverage-z').set({campaignId:'coverage-c',businessId:'coverage-owner',assignedScalerId:'coverage-scaler',status:'in_progress',serviceArea:corridor,assignedHomes:23,estimatedWalkingMeters:r.distance(...line),executionRoute:{centerline:line,denominatorMeters:r.distance(...line),routeHash:r.hash(line),corridorHash:r.hash(corridor),checkpoints:[]}});
 await db.doc('jobRooms/coverage-z').set({campaignId:'coverage-c',businessId:'coverage-owner',scalerId:'coverage-scaler',status:'open'});
 await db.doc('assignmentCompensations/coverage-z').set({baseAmountCents:1500,bonusAmountCents:0,immutable:true,zoneId:'coverage-z',campaignId:'coverage-c',businessId:'coverage-owner',scalerId:'coverage-scaler'});
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

async function seedEligible(key,{offRoute=false,bonus=0,badDigest=false}={}) {
 const zoneId=key+'-z',campaignId=key+'-c',sessionId=key+'-s',completionId=key+'-d';
 const points=Array.from({length:12},(_,i)=>({latitude:i*.001/11,longitude:offRoute?.001:0,accepted:true,horizontalAccuracy:5,sequence:i+1,timestampMs:1000+i*10000}));
 const digest=require('node:crypto').createHash('sha256').update('1:12:test-digest').digest('hex');
 await db.doc('campaigns/'+campaignId).set({businessId:'coverage-owner',campaignType:'neighborhoodCanvassing',materialFulfillmentType:'no_materials_required'});
 await db.doc('campaignZones/'+zoneId).set({campaignId,businessId:'coverage-owner',assignedScalerId:'coverage-scaler',status:'in_progress',routeId:sessionId,gpsTracking:false,fundingPaymentId:key+'-p',serviceArea:corridor,
  executionRoute:{centerline:line,routeHash:r.hash(line),corridorHash:r.hash(corridor),denominatorMeters:r.distance(...line)}});
 await db.doc('jobRooms/'+zoneId).set({campaignId,businessId:'coverage-owner',scalerId:'coverage-scaler',status:'open'});
 await db.doc('assignmentCompensations/'+zoneId).set({campaignId,zoneId,businessId:'coverage-owner',scalerId:'coverage-scaler',baseAmountCents:1500,bonusAmountCents:bonus,immutable:true});
 await db.doc('campaignPayments/'+key+'-p').set({campaignId,businessId:'coverage-owner',workerAmountCents:1500+bonus,status:'funded'});
 await db.doc('trackingSessions/'+sessionId).set({campaignId,zoneId,scalerId:'coverage-scaler',routeId:sessionId,status:'completed',startedAt:Timestamp.now(),endedAt:Timestamp.now(),pointCount:12,chunkCount:1,finalPointCount:12,finalAcceptedPointCount:12});
 await db.doc('trackingSessions/'+sessionId+'/chunks/one').set({sessionId,zoneId,scalerId:'coverage-scaler',startSequence:1,endSequence:12,payloadDigest:'test-digest',points});
 await db.doc('campaignRoutes/'+sessionId).set({campaignId,zoneId,scalerId:'coverage-scaler',trackingSessionId:sessionId,tracking:false,simulated:false,evidenceDigest:badDigest?'mismatch':digest,points});
 await db.doc('campaignCompletions/'+completionId).set({campaignId,zoneId,scalerId:'coverage-scaler',businessId:'coverage-owner',routeId:sessionId,status:'draft'});
 return {zoneId,campaignId,sessionId,completionId};
}
test('eligible finalized submission preserves full immutable base; exactly-once review uses accepted bonus only',async()=>{
 const f=await seedEligible('eligible',{bonus:300});
 const result=await call(completion.submitZoneCompletion,'coverage-scaler',{completionId:f.completionId});
 assert.equal(result.calculatedTransferAmountCents,1800);
 const repeated=await call(completion.submitZoneCompletion,'coverage-scaler',{completionId:f.completionId});assert.equal(repeated.alreadySubmitted,true);
 const preview=await call(room,'coverage-owner',{zoneId:f.zoneId});assert.equal(preview.completionEvidence.policy.payableAmountCents,1800);
 assert.equal((await db.collection('walletTransactions').where('campaignId','==',f.campaignId).get()).size,0);
 const [a,b]=await Promise.all([call(completion.finalizeZoneReview,'coverage-owner',{zoneId:f.zoneId,decision:'approve'}),call(completion.finalizeZoneReview,'coverage-owner',{zoneId:f.zoneId,decision:'approve'})]);
 assert.ok(a.earningRecorded||b.earningRecorded);assert.ok(a.alreadyProcessed||b.alreadyProcessed);
 const records=await db.collection('walletTransactions').where('campaignId','==',f.campaignId).get();assert.equal(records.size,1);assert.equal(records.docs[0].data().amountCents,1800);
 assert.equal((await db.doc('campaignZones/'+f.zoneId).get()).data().approvedBaseAmountCents,1500);
});
test('off-route work cannot submit ordinary completion or obtain money through exception report',async()=>{
 const f=await seedEligible('off-route',{offRoute:true});
 await assert.rejects(call(completion.submitZoneCompletion,'coverage-scaler',{completionId:f.completionId}),e=>e.code==='failed-precondition');
 await call(completion.submitZoneCompletion,'coverage-scaler',{completionId:f.completionId,reviewMode:'access_exception',scalerNotes:'Gate closed'});
 await assert.rejects(call(completion.finalizeZoneReview,'coverage-owner',{zoneId:f.zoneId,decision:'approve'}));
 assert.equal((await db.collection('walletTransactions').where('campaignId','==',f.campaignId).get()).size,0);
});
test('technical evidence mismatch protects base under audited hold, never bonus or normal approval',async()=>{
 const f=await seedEligible('technical',{badDigest:true,bonus:300});
 const preview=await call(room,'coverage-owner',{zoneId:f.zoneId});assert.equal(preview.completionEvidence.policy.baseProtected,true);
 await assert.rejects(call(completion.submitZoneCompletion,'coverage-scaler',{completionId:f.completionId}));
 await call(completion.submitZoneCompletion,'coverage-scaler',{completionId:f.completionId,reviewMode:'technical_review'});
 const saved=(await db.doc('campaignCompletions/'+f.completionId).get()).data();assert.equal(saved.technicalReview.baseProtected,true);assert.equal(saved.calculatedTransferAmountCents,null);
 await assert.rejects(call(completion.finalizeZoneReview,'coverage-owner',{zoneId:f.zoneId,decision:'approve'}));
 assert.equal((await db.collection('walletTransactions').where('campaignId','==',f.campaignId).get()).size,0);
});
test('historical versions and changed immutable evidence cannot enter the new payment policy',async()=>{
 const f=await seedEligible('changed');await call(completion.submitZoneCompletion,'coverage-scaler',{completionId:f.completionId});
 await db.doc('assignmentCompensations/'+f.zoneId).update({baseAmountCents:1000});
 await assert.rejects(call(completion.finalizeZoneReview,'coverage-owner',{zoneId:f.zoneId,decision:'approve'}));
 await db.doc('campaignZones/'+f.zoneId).update({economicPolicyVersion:'StagingCanvassingReviewV1'});
 await assert.rejects(call(completion.finalizeZoneReview,'coverage-owner',{zoneId:f.zoneId,decision:'approve'}));
 assert.equal((await db.collection('walletTransactions').where('campaignId','==',f.campaignId).get()).size,0);
});

test('accepted GPS mutation after submission fails closed even if the stored upload digest is unchanged',async()=>{
 const f=await seedEligible('evidence-change');await call(completion.submitZoneCompletion,'coverage-scaler',{completionId:f.completionId});
 const chunkRef=db.doc('trackingSessions/'+f.sessionId+'/chunks/one');const chunk=(await chunkRef.get()).data();
 chunk.points[0].horizontalAccuracy=6;await chunkRef.update({points:chunk.points});
 await assert.rejects(call(completion.finalizeZoneReview,'coverage-owner',{zoneId:f.zoneId,decision:'approve'}));
 assert.equal((await db.collection('walletTransactions').where('campaignId','==',f.campaignId).get()).size,0);
});

test('authoritative live progress is route-only and excludes other Scalers without home-count data',async()=>{
 const f=await seedEligible('live-progress');
 const before=(await db.doc('campaignZones/'+f.zoneId).get()).updateTime;
 const result=await call(tracking,'coverage-scaler',{sessionId:f.sessionId,includeProgress:true});
 assert.equal(result.progress.state,'available');assert.ok(result.progress.coveragePercentage>=95);assert.equal(result.progress.householdCoverage,null);
 await assert.rejects(call(tracking,'coverage-other',{sessionId:f.sessionId,includeProgress:true}));
 assert.ok(before.isEqual((await db.doc('campaignZones/'+f.zoneId).get()).updateTime));
});
