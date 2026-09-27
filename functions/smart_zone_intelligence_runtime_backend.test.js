'use strict';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,FieldValue}=require('firebase-admin/firestore');
const runtime=require('./smart_zone_intelligence_runtime'),{endpointHarness}=require('./smart_zone_endpoint_harness');
const fixture=require('./fixtures/21061-corkran-osm-public.json'),geography=require('./smart_zone_geography');
const app=initializeApp({projectId:'demo-smart-zone-intelligence'},'smart-zone-intelligence'),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
let seq=0;
test('multipart re-entry and replacing one saved Zone retain the other identity and never requery',async()=>{
 const s=await setup(),data={...s.data,desiredHours:8};
 const initial=await s.api.getSmartZonePlan({data});
 const runRef=db.doc(`propertyRecommendationWorkspaces/${s.businessId}/mappingRuns/${initial.recommendationRunId}`);
 const run=(await runRef.get()).data(),first=run.searchEvidence.candidates[0];
 // Explicit synthetic candidate variants exercise identity/transaction behavior only.
 const candidates=[0,1,2].map(i=>({...first,id:'synthetic_'+i,
   geometry:first.geometry.map(p=>({...p,longitude:p.longitude+i*.0003})),
   features:first.features.map(f=>({...f,id:f.id+'_'+i,longitude:f.longitude+i*.0003}))}));
 await runRef.update({'searchEvidence.candidates':candidates});
 const plan=await s.api.getSmartZonePlan({data:{...data,recommendationRunId:initial.recommendationRunId}});
 assert.equal(plan.zones.length,2);
 await s.api.applySmartZonePlan({data:{...data,recommendationRunId:initial.recommendationRunId,planId:plan.planId}});
 const savedCampaign=(await db.doc('campaigns/'+s.campaignId).get()).data();
 assert.deepEqual(savedCampaign.serviceArea,[]);assert.equal(savedCampaign.geometryParts.length,2);
 const before=await db.collection('campaignZones').where('campaignId','==',s.campaignId).get();
 const kept=before.docs.find(d=>d.data().zoneNumber===1),changed=before.docs.find(d=>d.data().zoneNumber===2);
 const calls=s.api.calls.provider;
 const reopen={campaignId:s.campaignId,desiredHours:8,resumeSavedPlan:true};
 const reopened=await s.api.getSmartZonePlan({data:reopen});
 assert.deepEqual(reopened.selectionIds,plan.selectionIds);
 const replace={...reopen,selectionIds:plan.selectionIds,replaceZoneIndex:1};
 const next=await s.api.getSmartZonePlan({data:replace});
 const apply={...replace,planId:next.planId};
 await s.api.applySmartZonePlan({data:apply});
 assert.deepEqual((await kept.ref.get()).data(),kept.data());
 assert.notDeepEqual((await changed.ref.get()).data().serviceArea,changed.data().serviceArea);
 assert.equal((await changed.ref.get()).data().zoneNumber,2);
 assert.equal((await db.collection('campaignZones').where('campaignId','==',s.campaignId).get()).size,2);
 assert.equal((await s.api.applySmartZonePlan({data:apply})).replay,true);
 assert.equal(s.api.calls.provider,calls);
 const savedBefore=(await db.doc('campaigns/'+s.campaignId).get()).data();
 await db.doc('campaigns/'+s.campaignId).update({campaignWorkload:require('./campaign_workload_authority').requirement(10),workloadVersion:savedBefore.workloadVersion+1});
 await assert.rejects(s.api.applySmartZonePlan({data:apply}),{code:'aborted'});
 assert.equal((await db.doc('campaigns/'+s.campaignId).get()).data().campaignWorkload.requestedHours,10);
 assert.equal((await db.collection('assignmentCompensations').where('campaignId','==',s.campaignId).get()).size,0);
});
async function setup({snapshot=true,actorUid=null}={}){
  const businessId='intelligence_'+Date.now()+'_'+(++seq),campaignId=businessId+'_campaign';
  const campaign={businessId,status:'draft',executionMode:'own_team',campaignType:'flyer_distribution',serviceArea:[],basePay:0,bonus:0};
  const profile={businessUid:businessId,businessName:'Fixture Business',servicesOffered:['Deck construction']};
  const prefs={userUid:businessId,role:'business',schemaVersion:'ServiceAreaPreferencesV1',
    areas:[{id:'local',geometry:fixture.selectedBoundary}],defaultResponseGoal:'Deck and remodeling prospects'};
  await Promise.all([db.doc('users/'+businessId).set({role:'business',active:true}),
    db.doc('campaigns/'+campaignId).set(campaign),db.doc('businessSubscriptions/'+businessId).set({planId:'scale',status:'active',expiresAt:new Date(Date.now()+86400000)}),
    db.doc('businessGrowthProfiles/'+businessId).set(profile),db.doc('discoveryPreferences/'+businessId).set(prefs)]);
  if(actorUid)await db.doc(`businessWorkspaces/${businessId}/members/${actorUid}`).set({businessId,uid:actorUid,status:'active',seatIndex:1,permissions:['campaigns','intelligence']});
  const api=endpointHarness({db,FieldValue,analyzeProperty:async geometry=>require('./smart_zone_planning').pointInsidePolygon(fixture.anchor,geometry)?{source:'synthetic-property-fixture',confidence:'HIGH',propertyCount:100,residentialStructureCount:80,geometryDigest:require('./property_intelligence').geometryDigest(geometry)}:null,context:{uid:businessId,actorUid:actorUid||businessId,role:'business',permissions:['campaigns','intelligence']},
    fetchSnapshot:async({selectedBoundary,onDiagnostic})=>{
      onDiagnostic({status:snapshot?'success':'unavailable',reasonCode:'local_fixture'});
      return snapshot?geography.snapshotFromElements(selectedBoundary,fixture.elements,{dataTimestamp:fixture.dataTimestamp,fetchedAt:fixture.retrievedAt}):null;
    }});
  const data={campaignId,analysisBoundary:fixture.selectedBoundary,desiredHours:5};
  return {businessId,campaignId,campaign,profile,prefs,api,data};
}
function smallInput(businessId,actorUid=businessId){const selectedArea={geometry:fixture.selectedBoundary,name:'Fixture',source:'drawn'};
  return {businessId,actorUid,campaignId:businessId+'_campaign',contextVersion:'context',requestFingerprint:'request',selectedArea,
    sourceAreaDigest:runtime.selectedAreaDigest(selectedArea)};}
const emptyEvidence=input=>({sourceAreaDigest:input.sourceAreaDigest,contextVersion:input.contextVersion,candidates:[]});
test('actual Corkran evidence round-trips Firestore, alternates and Apply use the same run without resolver/provider repetition',async()=>{
  const s=await setup(),plan=await s.api.getSmartZonePlan({data:s.data});
  assert.ok(plan.zones.length);assert.equal(plan.totalEstimatedProperties,19);assert.equal(plan.totalEstimatedMinutes,44);
  assert.match(plan.recommendationRunId,/^[a-f0-9]{64}$/);const calls=s.api.calls.provider;assert.ok(calls>=1&&calls<=12);
  const saved=(await db.doc(`propertyRecommendationWorkspaces/${s.businessId}/mappingRuns/${plan.recommendationRunId}`).get()).data();
  runtime.assertFirestoreValue(saved);assert.ok(Buffer.byteLength(JSON.stringify(saved))<=runtime.MAX_BYTES);
  const again=await s.api.getSmartZonePlan({data:{...s.data,recommendationRunId:plan.recommendationRunId}});
  assert.equal(again.planId,plan.planId);assert.equal(again.recommendationRunId,plan.recommendationRunId);
  const alternate=await s.api.getSmartZonePlan({data:{...s.data,recommendationRunId:plan.recommendationRunId,alternativeIndex:1}});
  assert.equal(alternate.reasonCode,'no_supported_alternative');assert.equal(alternate.recommendationRunId,plan.recommendationRunId);
  await assert.rejects(s.api.applySmartZonePlan({data:{...s.data,planId:plan.planId,recommendationRunId:plan.recommendationRunId,useRecommendedPay:true}}),{code:'failed-precondition'});
  const applied=await s.api.applySmartZonePlan({data:{...s.data,planId:plan.planId,recommendationRunId:plan.recommendationRunId}});
  assert.equal(applied.success,true);assert.equal(s.api.calls.provider,calls);assert.equal(s.api.calls.resolver,0);
  const campaign=(await db.doc('campaigns/'+s.campaignId).get()).data();
  assert.equal(campaign.executionMode,'own_team');assert.equal(campaign.status,'draft');assert.equal(campaign.basePay,0);
  assert.deepEqual(campaign.smartZoneSearchRegion.geometry,fixture.selectedBoundary);
  assert.deepEqual(campaign.serviceArea,plan.zones[0].geometry);assert.notDeepEqual(campaign.serviceArea,fixture.selectedBoundary);
  const zones=await db.collection('campaignZones').where('campaignId','==',s.campaignId).get();assert.equal(zones.size,plan.zones.length);
  for(const zone of zones.docs){assert.equal(zone.data().smartZonePlanningNetwork.isExecutionRoute,false);assert.equal(zone.data().estimatedHomes,19);}
  const replay=await s.api.applySmartZonePlan({data:{...s.data,planId:plan.planId,recommendationRunId:plan.recommendationRunId}});
  assert.equal(replay.replay,true);assert.equal(s.api.calls.provider,calls);
  for(const collection of ['campaignPayments','assignmentCompensations','payouts'])assert.equal((await db.collection(collection).where('campaignId','==',s.campaignId).get()).size,0);
});
test('empty evidence is cacheable and cannot be applied; revoked Scale and changed profile reject cached plans',async()=>{
  const s=await setup({snapshot:false}),plan=await s.api.getSmartZonePlan({data:s.data}),calls=s.api.calls.provider;
  assert.equal(plan.totalEstimatedProperties,null);assert.deepEqual(plan.zones,[]);
  await assert.rejects(s.api.applySmartZonePlan({data:{...s.data,planId:plan.planId,recommendationRunId:plan.recommendationRunId}}),{code:'failed-precondition'});
  await db.doc('businessSubscriptions/'+s.businessId).update({status:'revoked'});
  for(const name of ['getSmartZonePlan','applySmartZonePlan'])await assert.rejects(s.api[name]({data:{...s.data,planId:plan.planId,recommendationRunId:plan.recommendationRunId}}),{code:'permission-denied'});
  assert.equal(s.api.calls.provider,calls);
  await db.doc('businessSubscriptions/'+s.businessId).update({status:'active'});
  await db.doc('businessGrowthProfiles/'+s.businessId).update({servicesOffered:['Landscaping']});
  await assert.rejects(s.api.getSmartZonePlan({data:{...s.data,recommendationRunId:plan.recommendationRunId}}),{code:'failed-precondition'});
  assert.equal(s.api.calls.provider,calls);assert.deepEqual((await db.doc('campaigns/'+s.campaignId).get()).data(),s.campaign);
});
test('real transaction Business lease blocks parallel members; fresh replay, cooldown and TTL are enforced',async()=>{
  const b='lease_'+Date.now(),input=smallInput(b);let clock=Date.now(),calls=0,release,started;
  const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  const cache=runtime.createRuntime({db,now:()=>clock});
  const first=cache.obtain(input,async()=>{calls++;started();await gate;return emptyEvidence(input);});await entered;
  await assert.rejects(cache.obtain({...input,actorUid:'another_member'},async()=>{calls++;return emptyEvidence(input);}),{code:'aborted'});
  release();const record=await first;assert.equal(calls,1);
  assert.equal((await cache.obtain(input,async()=>{calls++;})).runId,record.runId);assert.equal(calls,1);
  await assert.rejects(cache.obtain({...input,requestFingerprint:'changed'},async()=>emptyEvidence(input)),{code:'resource-exhausted'});
  await assert.rejects(cache.load({...input,runId:record.runId,actorUid:'another_member'}),{code:'permission-denied'});
  await assert.rejects(cache.load({...input,runId:record.runId,contextVersion:'changed'}),{code:'failed-precondition'});
  clock+=runtime.TTL_MS+1;await assert.rejects(cache.load({...input,runId:record.runId}),{code:'failed-precondition'});
});
test('oversized, malformed or altered cache evidence fails closed and releases the matching lease',async()=>{
  for(const patch of [{payload:'x'.repeat(runtime.MAX_BYTES)},{payload:[[1,2]]},{payload:undefined},{payload:NaN}]){
    const b='invalid_'+Date.now()+'_'+(++seq),input=smallInput(b),cache=runtime.createRuntime({db});
    await assert.rejects(cache.obtain(input,async()=>({...emptyEvidence(input),...patch})));
    assert.equal((await db.doc(`propertyRecommendationWorkspaces/${b}/mappingLeases/search`).get()).data().leaseUntilMs,0);
  }
  const b='altered_'+Date.now(),input=smallInput(b),cache=runtime.createRuntime({db}),record=await cache.obtain(input,async()=>emptyEvidence(input));
  await db.doc(`propertyRecommendationWorkspaces/${b}/mappingRuns/${record.runId}`).update({sourceAreaDigest:'forged'});
  await assert.rejects(cache.load({...input,runId:record.runId}),{code:'failed-precondition'});
});
test('bounded server history retains actual completion evidence, rejects cross-tenant/truncated inventory as unknown, and clamps leap cutoff',async()=>{
  const b='history_'+Date.now(),path=`businessOperations/${b}/marketingHistory`,now=Date.UTC(2024,1,29,12);
  const row={schemaVersion:'BusinessMarketingHistoryV1',businessId:b,workspaceId:b,immutable:true,completionEvidenceSource:'business_reported',completedAtMs:now-1000,geometryParts:[{points:fixture.selectedBoundary}]};
  await db.collection(path).doc('valid').set(row);
  const result=await runtime.loadMarketingHistory({db,businessId:b,now:()=>now});assert.equal(result.status,'available');assert.equal(result.records.length,1);
  assert.equal(result.windowStartMs,Date.UTC(2023,1,28,12));assert.deepEqual(Object.keys(result.records[0]).sort(),['completedAtMs','completionEvidenceSource','geometryParts']);
  await db.collection(path).doc('foreign').set({...row,workspaceId:'foreign'});
  assert.equal((await runtime.loadMarketingHistory({db,businessId:b,now:()=>now})).status,'unknown');
  await db.collection(path).doc('foreign').delete();const batch=db.batch();for(let i=0;i<200;i++)batch.set(db.collection(path).doc('row_'+i),row);await batch.commit();
  assert.equal((await runtime.loadMarketingHistory({db,businessId:b,now:()=>now})).status,'unknown');
});
test('Apply transaction rechecks member removal, permission revocation, seat limits and Business availability',async()=>{
  const actorUid='member_'+Date.now(),s=await setup({actorUid}),plan=await s.api.getSmartZonePlan({data:s.data});
  const member=db.doc(`businessWorkspaces/${s.businessId}/members/${actorUid}`),workspace=db.doc(`businessWorkspaces/${s.businessId}`),owner=db.doc('users/'+s.businessId);
  const data={...s.data,planId:plan.planId,recommendationRunId:plan.recommendationRunId},calls=s.api.calls.provider;
  for(const update of [async()=>member.update({status:'removed'}),async()=>member.update({status:'active',permissions:['campaigns']}),
    async()=>{await member.update({permissions:['campaigns','intelligence']});await workspace.set({ownerId:s.businessId,pendingSeatLimit:1});},
    async()=>{await workspace.update({pendingSeatLimit:5});await owner.update({disabled:true});}]){
    await update();await assert.rejects(s.api.applySmartZonePlan({data}),{code:'permission-denied'});
    assert.deepEqual((await db.doc('campaigns/'+s.campaignId).get()).data(),s.campaign);
    assert.equal((await db.collection('campaignZones').where('campaignId','==',s.campaignId).get()).size,0);
  }
  assert.equal(s.api.calls.provider,calls);
});
test('frozen native Apply can recover only its completed exact-input run and cannot trigger a new search',async()=>{
  const s=await setup();await db.doc('campaigns/'+s.campaignId).update({serviceArea:fixture.selectedBoundary});
  const data={campaignId:s.campaignId,desiredHours:5};
  await assert.rejects(s.api.applySmartZonePlan({data:{...data,planId:'not-reviewed'}}),{code:'failed-precondition'});
  assert.equal(s.api.calls.provider,0);assert.equal(s.api.calls.resolver,0);
  const plan=await s.api.getSmartZonePlan({data}),calls=s.api.calls.provider;
  await assert.rejects(s.api.applySmartZonePlan({data:{...data,planId:'wrong-plan'}}),{code:'failed-precondition'});
  await assert.rejects(s.api.applySmartZonePlan({data:{...data,desiredHours:6,planId:plan.planId}}),{code:'failed-precondition'});
  assert.equal(s.api.calls.provider,calls);assert.equal(s.api.calls.resolver,0);
  const applied=await s.api.applySmartZonePlan({data:{...data,planId:plan.planId,useRecommendedPay:false}});
  assert.equal(applied.success,true);assert.equal(s.api.calls.provider,calls);assert.equal(s.api.calls.resolver,0);
  assert.equal((await db.doc('campaigns/'+s.campaignId).get()).data().smartZoneRecommendationRunId,plan.recommendationRunId);
});


test('Starter and Growth fail before any PI, recommendation cache or live provider access',async()=>{
 for(const planId of ['starter','growth']){
  const s=await setup();await db.doc('businessSubscriptions/'+s.businessId).update({planId});
  await assert.rejects(s.api.getSmartZonePlan({data:s.data}),{code:'permission-denied'});
  assert.equal(s.api.calls.property,0);assert.equal(s.api.calls.cache,0);assert.equal(s.api.calls.provider,0);
  assert.equal((await db.collection(`propertyRecommendationWorkspaces/${s.businessId}/mappingRuns`).get()).size,0);
 }
});
