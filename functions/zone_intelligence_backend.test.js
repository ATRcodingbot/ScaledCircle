'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,FieldValue}=require('firebase-admin/firestore');
const {preview}=require('./zone_intelligence_runtime'),access=require('./workspace_access'),workspace=require('./business_workspace');
const fixture=require('./fixtures/21061-corkran-osm-public.json'),geo=require('./smart_zone_geography');
const app=initializeApp({projectId:'demo-zone-evidence'},'zone-evidence'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
let counter=0;
async function setup(){
 const uid='zone_'+Date.now()+'_'+(++counter),campaignId=uid+'_campaign',zoneId=uid+'_zone';
 const campaign={businessId:uid,campaignType:'flyer_distribution',status:'draft'},zone={businessId:uid,campaignId,serviceArea:fixture.selectedBoundary};
 await Promise.all([db.doc('users/'+uid).set({role:'business',active:true}),
  db.doc('campaigns/'+campaignId).set(campaign),db.doc('campaignZones/'+zoneId).set(zone),
  db.doc('businessSubscriptions/'+uid).set({planId:'starter',status:'active',expiresAt:new Date(Date.now()+86400000)})]);
 let calls=0;
 const input={db,context:{uid,actorUid:uid,role:'business',permissions:['campaigns']},data:{campaignId,geometry:fixture.selectedBoundary},
  fetchSnapshot:async()=>{calls++;return geo.snapshotFromElements(fixture.selectedBoundary,fixture.elements);}};
 return{uid,campaignId,zoneId,campaign,zone,input,calls:()=>calls};
}
test('Starter campaign authority permits factual preview without Scale/intelligence/payment permission and leaves records unchanged',async()=>{
 const s=await setup(),adapter=access.createAccessAdapter({db,FieldValue,workspace:workspace.createWorkspaceService({db,FieldValue,auth:{getUser:async uid=>({uid,email:uid+'@fixture.test',emailVerified:true,disabled:false})}})});
 const result=await adapter('getCampaignZoneIntelligence',{auth:{uid:s.uid,token:{}},data:s.input.data},
  request=>preview({...s.input,context:request[access.CONTEXT],data:request.data}));
 assert.ok(result.mappedTargetCount>0);assert.equal(result.mode,'manual');
 assert.deepEqual((await db.doc('campaigns/'+s.campaignId).get()).data(),s.campaign);
 assert.deepEqual((await db.doc('campaignZones/'+s.zoneId).get()).data(),s.zone);
 assert.equal((await db.collection('campaignPayments').where('businessId','==',s.uid).get()).size,0);
});
test('signed-out, admin, missing campaign permission and foreign campaign fail before provider calls',async()=>{
 const s=await setup();
 for(const [context,code] of [[null,'unauthenticated'],[{...s.input.context,role:'admin'},'permission-denied'],
  [{...s.input.context,isAdmin:true},'permission-denied'],[{...s.input.context,permissions:['intelligence']},'permission-denied'],
  [{...s.input.context,uid:'foreign'},'permission-denied']])await assert.rejects(preview({...s.input,context}),{code});
 assert.equal(s.calls(),0);
});
test('cross-Zone/campaign association and missing resource reject before acquisition',async()=>{
 const a=await setup(),b=await setup();
 await assert.rejects(preview({...a.input,data:{...a.input.data,zoneId:b.zoneId}}),{code:'permission-denied'});
 await assert.rejects(preview({...a.input,data:{...a.input.data,campaignId:'missing'}}),{code:'not-found'});
 assert.equal(a.calls(),0);
});
test('new unsaved area preview requires no Zone record; malformed boundary fails closed',async()=>{
 const s=await setup();await db.doc('campaignZones/'+s.zoneId).delete();
 assert.ok((await preview(s.input)).mappedTargetCount>0);
 await assert.rejects(preview({...s.input,data:{...s.input.data,geometry:[]}}),{code:'invalid-argument'});
 assert.equal((await db.doc('campaignZones/'+s.zoneId).get()).exists,false);
});
test('provider failure returns safe unknown fields and does not write a campaign',async()=>{
 const s=await setup();const r=await preview({...s.input,fetchSnapshot:async()=>{throw Error('private provider detail');}});
 assert.equal(r.mappedTargetCount,null);assert.ok(!JSON.stringify(r).includes('private provider detail'));
 assert.deepEqual((await db.doc('campaigns/'+s.campaignId).get()).data(),s.campaign);
});
test('saved recommendation evidence stays bound to owning campaign and geometry; edited or stale evidence is reacquired',async()=>{
 const s=await setup(),runId='a'.repeat(64),now=Date.now();
 const candidate={geometry:fixture.selectedBoundary,features:[{id:'exact-target',observedTags:{building:'detached'}}],
  networkSegments:[{from:fixture.selectedBoundary[0],to:fixture.selectedBoundary[1]}],
  workload:{estimatedMinutes:32,estimatedProperties:1,version:'fixture'},
  source:{name:'OpenStreetMap',dataTimestamp:new Date(now-86400000).toISOString()},ranking:{reasons:['Regional context fixture']}};
 const runRef=db.doc(`propertyRecommendationWorkspaces/${s.uid}/mappingRuns/${runId}`);
 await db.doc('campaigns/'+s.campaignId).update({smartZoneRecommendationRunId:runId});
 const digest=require('./operational_layer').zoneGeometryDigest(fixture.selectedBoundary);
 await db.doc('campaignZones/'+s.zoneId).update({smartZonePlanId:'fixture-reviewed-plan',smartZoneTargetEvidence:{geometryDigest:digest},serverZoneGeometryDigest:digest});
 const run={status:'complete',businessId:s.uid,campaignId:s.campaignId,searchEvidence:{targetIntent:'residential',candidates:[candidate]}};
 await runRef.set(run);
 const input={...s.input,data:{...s.input.data,zoneId:s.zoneId},now:()=>now};
 const exact=await preview(input);assert.equal(exact.mappedTargetCount,1);assert.equal(exact.mode,'recommended');assert.equal(s.calls(),0);
 const older=await preview({...input,now:()=>now+20*86400000});assert.equal(older.source.freshness,'stale');assert.ok(older.limitations.some(s=>s.includes('stale')));
 const changed=fixture.selectedBoundary.map(p=>({...p,latitude:p.latitude+0.00001}));
 await preview({...input,data:{...input.data,geometry:changed}});assert.equal(s.calls(),1);
 await runRef.update({campaignId:'foreign'});await preview(input);assert.equal(s.calls(),2);
 await runRef.set({...run,searchEvidence:{...run.searchEvidence,candidates:[{...candidate,source:{...candidate.source,dataTimestamp:'2020-01-01'}}]}});
 await preview(input);assert.equal(s.calls(),3);
 await runRef.set(run);await db.doc('campaignZones/'+s.zoneId).update({smartZonePlanId:FieldValue.delete()});
 const manual=await preview(input);assert.equal(manual.mode,'manual');assert.equal(s.calls(),4);
});
test('Growth member needs an active campaign seat; revoked member is denied before provider',async()=>{
 const s=await setup(),member=s.uid+'_member';
 await db.doc('businessSubscriptions/'+s.uid).update({planId:'growth'});
 await db.doc('users/'+member).set({role:'business',activeBusinessId:s.uid});
 const ref=db.doc(`businessWorkspaces/${s.uid}/members/${member}`);
 await ref.set({businessId:s.uid,uid:member,status:'active',seatIndex:1,permissions:['campaigns']});
 const adapter=access.createAccessAdapter({db,FieldValue,workspace:workspace.createWorkspaceService({db,FieldValue,
  auth:{getUser:async uid=>({uid,email:uid+'@fixture.test',emailVerified:true})}})});
 const call=()=>adapter('getCampaignZoneIntelligence',{auth:{uid:member,token:{}},data:s.input.data},
  request=>preview({...s.input,context:request[access.CONTEXT],data:request.data}));
 assert.ok((await call()).mappedTargetCount>0);
 await ref.update({permissions:['intelligence']});await assert.rejects(call(),{code:'permission-denied'});
 await ref.update({permissions:['campaigns'],status:'revoked'});await assert.rejects(call(),{code:'permission-denied'});
 assert.equal(s.calls(),1);
});
