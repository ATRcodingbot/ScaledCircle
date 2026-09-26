'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {endpointHarness}=require('./smart_zone_endpoint_harness');
const contract=require('./smart_zone_entry_contract'),fixture=require('./fixtures/21061-corkran-osm-public.json');
const area=fixture.selectedBoundary;
const active=planId=>({planId,status:'active',expiresAt:new Date(Date.now()+86400000)});
function setup({entitlement=active('scale'),executionMode='own_team',context={uid:'owner',actorUid:'owner',role:'business',permissions:['campaigns','intelligence']},campaign={},profile={},preferences={},exists=true,resolution}={}){
  const rows={campaigns:{businessId:'owner',status:'draft',executionMode,campaignType:'flyer_distribution',serviceArea:area,...campaign},
    businessSubscriptions:entitlement,businessGrowthProfiles:{businessUid:'owner',businessName:'Test',servicesOffered:['Roofing'],...profile},
    discoveryPreferences:{userUid:'owner',role:'business',schemaVersion:'ServiceAreaPreferencesV1',areas:[{id:'local',geometry:area}],defaultResponseGoal:'Roofing prospects',...preferences}};
  const readNames=[];
  const db={collection:name=>({doc:()=>({get:async()=>{readNames.push(name);return {exists:name!=='campaigns'||exists,data:()=>rows[name]};}}),
    limit:()=>({get:async()=>({docs:[]})})})};
  return {...endpointHarness({db,context,resolution}),readNames,request:extra=>({data:{campaignId:'campaign',desiredHours:5,analysisBoundary:area,...extra}})};
}
test('Starter/Growth, expired, revoked and spoofed Scale fail both callables before resolver/cache/provider even own-team',async()=>{
  for(const executionMode of ['own_team','marketplace'])for(const entitlement of [null,active('starter'),active('growth'),
    {...active('scale'),expiresAt:new Date(0)},{...active('scale'),status:'revoked'}]){
    const s=setup({entitlement,executionMode});
    for(const name of ['getSmartZonePlan','applySmartZonePlan'])await assert.rejects(s[name](s.request({recommendationRunId:'forged',
      planId:'scale',entitlement:{planId:'scale'},services:['Forged']})),{code:'permission-denied'});
    assert.equal(s.calls.resolver,0);assert.equal(s.calls.provider,0);
    assert.ok(!s.readNames.includes('businessGrowthProfiles'));
    assert.ok(!s.readNames.includes('propertyRecommendationWorkspaces'));
  }
});
test('active Scale, Managed Growth, and trusted complimentary Scale inherit the maintained authority',async()=>{
  const comped={planId:'scale',status:'active',comped:true,billingStatus:'comped',source:'internal_qa',purpose:'store_review',
    paidProviderUsageAllowed:false,accessTerm:'until_revoked',expiresAt:null,revokedAt:null};
  for(const entitlement of [active('scale'),active('managed_growth'),comped]){
    const s=setup({entitlement}),input=await s.smartZoneCampaign(s.request({services:['Invented'],businessId:'foreign',workType:'event_marketing'}));
    assert.deepEqual(input.intelligenceContext.services,['Roofing']);assert.equal(input.intelligenceContext.campaignType,'flyer_distribution');
    assert.deepEqual(input.selectedBoundary,area);assert.equal(input.context.uid,'owner');assert.equal(s.calls.provider,0);
  }
  for(const entitlement of [{...comped,revokedAt:new Date()},{...comped,source:'client'},{...comped,paidProviderUsageAllowed:true}]){
    const s=setup({entitlement});await assert.rejects(s.smartZoneCampaign(s.request()),{code:'permission-denied'});
  }
});
test('role, tenant, member permission, draft and authoritative profile bindings fail before location work',async()=>{
  for(const [options,code] of [[{context:null},'unauthenticated'],[{context:{uid:'owner',role:'admin'}},'permission-denied'],
    [{context:{uid:'owner',role:'business',isAdmin:true}},'permission-denied'],[{campaign:{businessId:'foreign'}},'permission-denied'],
    [{context:{uid:'owner',role:'business',permissions:['campaigns']}},'permission-denied'],
    [{context:{uid:'owner',role:'business',permissions:['intelligence']}},'permission-denied'],[{campaign:{status:'funded'}},'failed-precondition'],
    [{profile:{businessUid:'foreign'}},'failed-precondition'],[{preferences:{userUid:'foreign'}},'failed-precondition'],[{exists:false},'not-found']]){
    const s=setup(options);await assert.rejects(s.smartZoneCampaign(s.request()),{code});
    assert.equal(s.calls.resolver,0);assert.equal(s.calls.provider,0);
  }
});
test('authorized member context uses tenant profile and goal; forged client context cannot override it',async()=>{
  const s=setup({context:{uid:'owner',actorUid:'member',role:'business',permissions:['campaigns','intelligence']}});
  const input=await s.smartZoneCampaign(s.request({objective:'Find B2B business leads',contextVersion:'forged',eligibleGeography:[],services:['Unknown']}));
  assert.equal(input.cacheAuthority.actorUid,'member');assert.equal(input.intelligenceContext.targetIntent,'business');
  assert.equal(input.intelligenceContext.goal,'Find B2B business leads');assert.deepEqual(input.intelligenceContext.services,['Roofing']);
  assert.notEqual(input.contextVersion,'forged');assert.ok(input.eligibleGeography.length);
});
test('malformed explicit geometry, hours, goal and alternatives fail without provider or resolver',async()=>{
  for(const extra of [{analysisBoundary:[]},{desiredHours:0},{objective:123},{objective:'x'.repeat(801)},
    {alternativeIndex:3},{alternativeIndex:-1},{alternativeIndex:1.5},{alternativeIndex:1}]){
    const s=setup();await assert.rejects(s.smartZoneCampaign(s.request(extra)));
    assert.equal(s.calls.provider,0);assert.equal(s.calls.resolver,0);
  }
  assert.throws(()=>contract.normalizeAnalysisBoundary([{latitude:'39',longitude:-76},...area.slice(1)]));
});
test('server-resolved missing ZIP boundary stays unresolved, without inventing an address rectangle',async()=>{
  const s=setup({resolution:{results:[{id:'zip',latitude:39.15,longitude:-76.63,geographyType:'zcta',geometry:[],fullAddress:'21061, Maryland'}]}});
  const input=await s.smartZoneCampaign(s.request({analysisBoundary:undefined,areaSelection:{query:'21061',resultId:'zip'}}));
  assert.deepEqual(input.selectedBoundary,[]);assert.match(input.sourceAreaDigest,/^[a-f0-9]{64}$/);assert.equal(s.calls.resolver,1);
});
