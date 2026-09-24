'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const mapping=require('./production_mapping_service');
const quote=require('./campaign_funding_quote');
const fs=require('fs'),vm=require('vm');
function planningQuoteHarness() {
 const checks=[];const sandbox={module:{exports:{}},require:name=>name==='./campaign_funding_quote'?quote:{createWorkspaceService:()=>({authority:async input=>{checks.push(input);if(input.businessId!=='owner')throw Error('workspace_denied');}})}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./campaign_planning_quote'),'utf8'),sandbox);
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const input={db:{doc:()=>({get:async()=>({data:()=>({role:'business'})})})},auth:{getUser:async()=>({emailVerified:true})},HttpsError};
 return {call:request=>sandbox.module.exports.quote({...input,request}),checks};
}
test('amount-only callable plans without campaign, payment or provider write and checks workspace authority',async()=>{
 const {call,checks}=planningQuoteHarness();const request={auth:{uid:'owner'},data:{workerAmountCents:10000}};
 const result=await call(request);assert.equal(result.businessChargeCents,12000);assert.equal(result.planningOnly,true);assert.equal(result.quoteDigest,undefined);
 assert.equal(checks[0].permission,'campaigns');assert.equal(checks[0].allowExpired,false);
 await assert.rejects(call({...request,data:{...request.data,businessId:'other'}}),/workspace_denied/);
 await assert.rejects(call({...request,auth:null}),/Sign in/);
 await assert.rejects(call({...request,data:{workerAmountCents:10000,approvedQuoteDigest:'fake'}}),/integer cents/);
});
const polygon=[{latitude:38.7,longitude:-76.8},{latitude:38.7,longitude:-76.79},{latitude:38.71,longitude:-76.79},{latitude:38.71,longitude:-76.8}];
test('reserve includes base and optional bonus; half-up integer fee is added, never deducted',()=>{
 assert.deepEqual(quote.quoteCampaignFunding(10000),{currency:'usd',workerAmountCents:10000,platformFeeRateBasisPoints:2000,platformFeeCents:2000,businessChargeCents:12000});
 assert.equal(quote.quoteCampaignFunding(5000).businessChargeCents,6000);assert.equal(quote.quoteCampaignFunding(3).platformFeeCents,1);
 for(const bad of [0,-1,NaN,2.3,'10000'])assert.throws(()=>quote.quoteCampaignFunding(bad));
});
function fixture(){
 const state={zone:{businessId:'owner',campaignId:'c',status:'unassigned',serviceArea:polygon},campaign:{businessId:'owner',status:'draft',materialQuantity:500},writes:[]};
 const refs={zone:{id:'z'},campaign:{id:'c'}};
 const tx={get:async r=>({data:()=>r===refs.zone?state.zone:state.campaign}),update:(r,data)=>{state.writes.push({r,data});Object.assign(r===refs.zone?state.zone:state.campaign,data);}};
 const db={runTransaction:async fn=>fn(tx)};
 const args={db,FieldValue:{delete:()=>null,serverTimestamp:()=>1},zoneRef:refs.zone,campaignRef:refs.campaign,zone:structuredClone(state.zone),campaign:state.campaign,
  eligible:(c,z)=>{assert.equal(c.businessId,'owner');assert.equal(c.status,'draft');assert.equal(z.status,'unassigned');}};
 return {state,args};
}
const result={source:'Maryland Open Data',sourceVersion:'fixture',dataUpdatedAt:'2024',residentialStructureCount:12,partialCoverage:false,limitations:[],providerPagination:{maxRecords:5000,truncated:false}};
test('held planning binds exact target, retains null door/workload counts and does not create contract/payment',async()=>{
 const {state,args}=fixture();let calls=0;
 const provider={analyze:async({geometry})=>{calls++;assert.deepEqual(geometry,polygon);return result;}};
 const out=await mapping.analyzePlanning({...args,provider});assert.equal(out.targetPlanning.residentialProperties,12);assert.equal(out.targetPlanning.deliveryStops,null);
 assert.equal(out.targetPlanning.workloadMinutes,null);assert.equal(state.writes.length,1);assert.equal(state.zone.completionPolicyVersion,undefined);assert.equal(state.campaign.completionPolicyVersion,undefined);
 const again=await mapping.analyzePlanning({...args,zone:state.zone,provider});assert.equal(again.targetPlanning.geometryDigest,out.targetPlanning.geometryDigest);assert.equal(calls,1);
});
test('provider failure terminates analysis honestly and preserves target',async()=>{
 const {state,args}=fixture();const out=await mapping.analyzePlanning({...args,provider:{analyze:async()=>{throw Error('property_source_http_503');}}});
 assert.equal(out.analysisStatus,'unavailable');assert.equal(state.zone.homeCountStatus,'unavailable');assert.deepEqual(state.zone.serviceArea,polygon);assert.equal(out.targetPlanning.residentialProperties,null);
});
test('unavailable sources retain failure reasons rather than reporting zero homes',()=>{
 const out=mapping.planningResult({zone:{serviceArea:polygon},campaign:{},data:{source:'none',limitations:['property_source_http_403','census_response_not_json']}});
 assert.equal(out.status,'unavailable');assert.equal(out.residentialProperties,null);assert.ok(out.limitations.includes('property_source_http_403'));
});
test('partial coverage is not an exact household count; changed geometry cannot commit stale analysis',async()=>{
 const {state,args}=fixture();const out=await mapping.analyzePlanning({...args,provider:{analyze:async()=>({...result,partialCoverage:true})}});assert.equal(out.analysisStatus,'partial');
 const second=fixture();await assert.rejects(mapping.analyzePlanning({...second.args,provider:{analyze:async()=>{second.state.zone.serviceArea=polygon.slice(0,3);return result;}}}),/target_changed/);assert.equal(second.state.writes.length,0);
});
test('funded/assigned/workspace changes during lookup prevent a planning write',async()=>{
 for(const change of [{status:'funded'},{businessId:'other'}]){const {state,args}=fixture();await assert.rejects(mapping.analyzePlanning({...args,provider:{analyze:async()=>{Object.assign(state.campaign,change);return result;}}}));assert.equal(state.writes.length,0);}
});
