"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const market=require("./market_rollout"),{states}=require("./market_states");
const geo=require("./market_work_geography"),alerts=require("./opportunity_notification_policy");
const id=code=>states.find(s=>s.code===code).id;
test("Census state identifiers are unique; initialized launch is MD only; missing config never activates",()=>{
  assert.equal(new Set(states.map(s=>s.id)).size,states.length);
  for(const state of states){
    assert.equal(market.statusFor(market.initialConfig(),state.id),state.code==="MD"?"ACTIVE":"PRELAUNCH");
    assert.equal(market.statusFor(null,state.id),"PRELAUNCH");
  }
  assert.equal(market.statusFor(market.initialConfig(),"Maryland"),"UNKNOWN");
});
test("rollout reporting never guesses state from ZIP, free text, base, or service areas",()=>{
  const result=market.demand({config:market.initialConfig(),users:[
    {id:"s",role:"scaler",postalCode:"21061",state:"Maryland"},
    {id:"b",role:"business"},{id:"member",role:"business",signupPurpose:"team_invitation"},
    {id:"p",role:"scaler"}],profiles:[{id:"p",stateId:id("PA"),selectionSource:"explicit_user_selection"}]});
  assert.equal(result.unknown.scalers,1);assert.equal(result.unknown.businesses,1);
  assert.equal(result.rows.find(r=>r.code==="MD").scalers,0);
  assert.equal(result.rows.find(r=>r.code==="PA").scalers,1);
  assert.equal(JSON.stringify(result).includes("21061"),false);
  assert.equal(result.optionalFunnelMetrics,null);
});
test("state choice alone never subscribes a Scaler to any job",()=>{
  const result=alerts.scalerOpportunityDecision({stateId:id("MD"),role:"scaler",serviceAreas:[]},
    {campaignType:"neighborhoodCanvassing",location:{latitude:38.33,longitude:-75.08}});
  assert.equal(result.matched,false);
});
test("Maryland active cannot override the independent LIVE payout hold",()=>{
  assert.equal(market.statusFor(market.initialConfig(),id("MD")),"ACTIVE");
  assert.throws(()=>require("./paid_work_launch_gate").assertNewPaidWork({project:"scaled-circle",enabled:"false"}),/Paid work is not open/);
});
const campaign={businessId:"b",serviceArea:[{latitude:39,longitude:-76.5},{latitude:39.01,longitude:-76.5},{latitude:39,longitude:-76.49}]};
test("work geography uses full containing envelope and canonical Census result, never home-state inference",async()=>{
  let requested;
  const state=await geo.stateForWork(campaign,{fetchImpl:async url=>{
    requested=url;return {ok:true,json:async()=>({features:[{attributes:{STATE:"42"}}]})};
  }});
  assert.equal(state.code,"PA");assert.equal(requested.searchParams.get("spatialRel"),"esriSpatialRelWithin");
  assert.equal(JSON.parse(requested.searchParams.get("geometry")).xmax,-76.49);
});
test("unknown, multiple/border states, provider failure and invalid work geometry fail closed",async()=>{
  for(const payload of [{features:[]},{features:[{attributes:{STATE:"24"}},{attributes:{STATE:"42"}}]},
    {features:[{attributes:{STATE:"99"}}]},{error:{message:"failed"}}]){
    await assert.rejects(geo.stateForWork(campaign,{fetchImpl:async()=>({ok:true,json:async()=>payload})}));
  }
  await assert.rejects(geo.stateForWork(campaign,{fetchImpl:async()=>{throw Error("offline");}}));
  assert.throws(()=>geo.envelope({serviceArea:[{}, {}, {}]}));
  assert.throws(()=>geo.envelope({state:"Maryland",latitude:39,longitude:-76}));
});
test("active Business state does not authorize a PRELAUNCH work state",async()=>{
  const data={"marketProfiles/b":{stateId:id("MD"),selectionSource:"explicit_user_selection"},
    [market.CONFIG]:market.initialConfig()};
  const db={doc:path=>({get:async()=>({data:()=>data[path]})})};
  await assert.rejects(geo.requireCampaign(db,campaign,undefined,{fetchImpl:async()=>({ok:true,json:async()=>({features:[{attributes:{STATE:"42"}}]})})}),/work area's state/);
});
test("multiple saved service areas match locally; Maryland state never broadens notifications",()=>{
  const preferences={stateId:id('MD'),areas:[
    {name:'Baltimore City',type:'around_business',center:{latitude:39.29,longitude:-76.61},radiusMiles:5},
    {name:'Baltimore County',type:'around_business',center:{latitude:39.40,longitude:-76.60},radiusMiles:5}],
    jobTypes:['flyer_distribution'],travelMode:'nearby',notifications:{newJobsInMyAreas:true}};
  const job=location=>({campaignType:'flyer_distribution',location});
  assert.equal(alerts.scalerOpportunityDecision(preferences,job({latitude:39.29,longitude:-76.61})).matched,true);
  assert.equal(alerts.scalerOpportunityDecision(preferences,job({latitude:39.40,longitude:-76.60})).matched,true);
  for(const location of[{latitude:38.33,longitude:-75.08},{latitude:39.64,longitude:-77.72}])
    assert.equal(alerts.scalerOpportunityDecision(preferences,job(location)).matched,false);
  assert.equal(require('./discovery_preferences').matchOpportunity(preferences,
    {location:{latitude:38.33,longitude:-75.08},jobType:'flyer_distribution'},'manual').matched,true);
});
