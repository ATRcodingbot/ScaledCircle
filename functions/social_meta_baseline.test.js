"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {collect, insight, measure} = require("../functions-social-operations/social_meta_baseline");
test("Meta counters never coerce missing or malformed values to zero", () => {
  for (const value of [null, undefined, "0", false, -1, NaN, Infinity, {}]) assert.equal(measure(value,"x").value,null);
  assert.equal(measure(0,"x").status,"OBSERVED");
  assert.equal(insight({data:[]},"reach","x").status,"NO_DATA");
  assert.equal(insight({data:[{name:"reach",total_value:{value:0}}]},"reach","x").value,0);
  assert.equal(insight({data:[{name:"reach",values:[{value:4},{value:3}]}]},"reach","x").value,3);
});
const account={accountId:"123",linkedAccountId:"456",linkedHandle:"brand"};
const tokens={pageAccessToken:"fixture-page",userAccessToken:"fixture-user"};
test("Instagram uses User token, total-value day metrics and GET only", async () => {
  const calls=[];
  const baseline=await collect({surface:"instagram",account,tokens,now:1788650000000,fetchImpl:async(url,options)=>{
    calls.push(String(url)); assert.equal(options.method,"GET"); assert.equal(options.headers.Authorization,"Bearer fixture-user");
    assert.equal(url.searchParams.has("access_token"),false);
    let body={data:[]};
    if(url.pathname==="/v26.0/456")body={id:"456",username:"brand",followers_count:12,media_count:2};
    if(url.pathname.endsWith("/insights")){
      assert.equal(url.searchParams.get("period"),"day"); assert.equal(url.searchParams.get("metric_type"),"total_value");
      body={data:[{name:url.searchParams.get("metric"),total_value:{value:0}}]};
    }
    return {ok:true,json:async()=>body};
  }});
  assert.equal(calls.length,6); assert.equal(baseline.metrics.followers.value,12);
  assert.equal(baseline.metrics.mediaCount.value,2); assert.equal(baseline.metrics.impressions.value,null);
  assert.equal(baseline.latestStatus,"NO_DATA"); assert.ok(!JSON.stringify(baseline).includes("fixture-user"));
});
test("Wrong provider identity stops before baseline metric requests",async()=>{
  let calls=0;
  await assert.rejects(collect({surface:"instagram",account,tokens,fetchImpl:async()=>{
    calls++; return {ok:true,json:async()=>({id:"789",username:"other"})};
  }}),/identity_mismatch/); assert.equal(calls,1);
});
test("Authorization failure is not disguised as an empty successful baseline",async()=>{
  await assert.rejects(collect({surface:"facebook",account,tokens,fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:{code:200}})})}),/authority_or_rate_limit/);
});
