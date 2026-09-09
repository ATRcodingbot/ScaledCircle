const fs=require('node:fs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {publicCampaignDocument}=require('./operational_layer');
let env;
const db=uid=>env.authenticatedContext(uid,{email_verified:true}).firestore();
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-logistics-privacy',firestore:{rules:fs.readFileSync(require('node:path').join(__dirname,'../firestore.production.rules'),'utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{
  const store=ctx.firestore();
  for(const [uid,role] of [['owner','business'],['tenant','business'],['admin','admin'],['assigned','scaler'],['unassigned','scaler'],['applicant','scaler'],['cross','scaler']])
   await store.doc(`users/${uid}`).set({role,active:true});
  const c={businessId:'owner',status:'open',materialFulfillmentType:'scaler_pickup_business',materialHandoffAddress:'PRIVATE',publicLogistics:{postalCode:'21061'}};
  await store.doc('campaigns/job').set(c);
  await store.doc('campaignDiscovery/job').set(publicCampaignDocument('job',c));
  await store.doc('campaignZones/z').set({campaignId:'job',businessId:'owner',assignedScalerId:'assigned',status:'accepted'});
  await store.doc('assignmentCompensations/z').set({campaignId:'job',businessId:'owner',scalerId:'assigned',immutable:true,acceptedMaterialLogistics:{location:'PRIVATE'}});
  await store.doc('campaigns/job/applications/applicant').set({scalerId:'applicant',status:'pending'});
 });
});
after(async()=>env?.cleanup());
test('assigned location collection query must constrain active state',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  await ctx.firestore().doc('campaignLocations/query-active').set({campaignId:'job',businessId:'owner',assignedScalerId:'assigned',status:'assigned',address:'PRIVATE'});
  await ctx.firestore().doc('campaignLocations/query-terminal').set({campaignId:'job',businessId:'owner',assignedScalerId:'assigned',status:'completed',address:'PRIVATE'});
 });
 await assertFails(db('assigned').collection('campaignLocations').where('assignedScalerId','==','assigned').get());
 await assertFails(db('assigned').collection('campaignLocations').where('assignedScalerId','==','assigned').where('status','in',['assigned','in_progress']).get());
 const result=await assertSucceeds(db('assigned').collection('campaignLocations').where('campaignId','==','job').where('businessId','==','owner').where('assignedScalerId','==','assigned').where('status','in',['assigned','in_progress']).get());
 assert.equal(result.docs.some(d=>d.id==='query-active'),true);
 assert.equal(result.docs.some(d=>d.id==='query-terminal'),false);
});
test('raw private source denied before and after assignment; owner/Admin retain authority',async()=>{
 for(const uid of ['assigned','unassigned','applicant','cross','tenant']) await assertFails(db(uid).doc('campaigns/job').get());
 for(const uid of ['owner','admin']) await assertSucceeds(db(uid).doc('campaigns/job').get());
 await assertFails(env.unauthenticatedContext().firestore().doc('campaigns/job').get());
});
test('public get/list projections contain coarse logistics only and reject client writes',async()=>{
 for(const uid of ['assigned','unassigned','applicant','cross']){
  const snap=await assertSucceeds(db(uid).doc('campaignDiscovery/job').get());
  assert.equal(JSON.stringify(snap.data()).includes('PRIVATE'),false);
  assert.equal(snap.data().materialLogistics.postalCode,'21061');
  await assertSucceeds(db(uid).collection('campaignDiscovery').where('status','==','open').get());
  await assertFails(db(uid).collection('campaigns').where('status','==','open').get());
 }
 await assertFails(db('owner').doc('campaignDiscovery/job').update({materialHandoffAddress:'PRIVATE'}));
});
test('exact assignment logistics allowed only to active intended Scaler, owner or Admin',async()=>{
 for(const uid of ['assigned','owner','admin']) await assertSucceeds(db(uid).doc('assignmentCompensations/z').get());
 for(const uid of ['unassigned','applicant','cross','tenant']) await assertFails(db(uid).doc('assignmentCompensations/z').get());
 await assertFails(env.unauthenticatedContext().firestore().doc('assignmentCompensations/z').get());
 await env.withSecurityRulesDisabled(ctx=>ctx.firestore().doc('campaignZones/z').update({status:'cancelled'}));
 await assertFails(db('assigned').doc('assignmentCompensations/z').get());
 await assertSucceeds(db('owner').doc('assignmentCompensations/z').get());
});
test('group and exact-location private reads revoke after terminal state',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  const store=ctx.firestore();
  await store.doc('campaignZones/group').set({campaignId:'job',businessId:'owner',assignedScalerIds:['assigned'],status:'unassigned'});
  await store.doc('zoneScalerParticipations/group__assigned').set({zoneId:'group',campaignId:'job',businessId:'owner',scalerUid:'assigned',status:'accepted',acceptedMaterialLogistics:{location:'PRIVATE'}});
  await store.doc('campaignLocations/exact').set({campaignId:'job',businessId:'owner',assignedScalerId:'assigned',status:'assigned',address:'PRIVATE'});
 });
 for(const path of ['zoneScalerParticipations/group__assigned','campaignLocations/exact']){
  for(const uid of ['assigned','owner','admin']) await assertSucceeds(db(uid).doc(path).get());
  for(const uid of ['unassigned','applicant','cross','tenant']) await assertFails(db(uid).doc(path).get());
 }
 await env.withSecurityRulesDisabled(async ctx=>{
  await ctx.firestore().doc('zoneScalerParticipations/group__assigned').update({status:'replaced'});
  await ctx.firestore().doc('campaignLocations/exact').update({status:'completed'});
 });
 for(const path of ['zoneScalerParticipations/group__assigned','campaignLocations/exact']) await assertFails(db('assigned').doc(path).get());
});
test('intentional resume window retains only intended assignment logistics; expired review revokes them',async()=>{
 await env.withSecurityRulesDisabled(ctx=>ctx.firestore().doc('campaignZones/z').update({status:'paused_work_window',pauseReason:'intentional_finish_later'}));
 await assertSucceeds(db('assigned').doc('assignmentCompensations/z').get());
 for(const uid of ['unassigned','applicant','cross','tenant'])await assertFails(db(uid).doc('assignmentCompensations/z').get());
 await assertFails(db('assigned').doc('campaignZones/z').update({status:'assigned'}));
 await env.withSecurityRulesDisabled(ctx=>ctx.firestore().doc('campaignZones/z').update({status:'incomplete_review'}));
 await assertFails(db('assigned').doc('assignmentCompensations/z').get());
 await assertSucceeds(db('owner').doc('assignmentCompensations/z').get());
});
