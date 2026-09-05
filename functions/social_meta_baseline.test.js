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

test("Facebook diagnostics preserve Graph classification while redacting credentials",async()=>{
  const diagnostics=[];
  await assert.rejects(collect({surface:"facebook",account,tokens,diagnostic:entry=>diagnostics.push(entry),
    fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:{code:200,error_subcode:123,
      type:"OAuthException",message:"Denied fixture-page fixture-user https://graph.facebook.com/?access_token=hidden"}})})}),/authority_or_rate_limit/);
  assert.equal(diagnostics.length,1);
  assert.equal(diagnostics[0].httpStatus,403);assert.equal(diagnostics[0].code,200);
  assert.equal(diagnostics[0].subcode,123);assert.equal(diagnostics[0].type,"OAuthException");
  assert.equal(diagnostics[0].path,"/123");
  assert.ok(!JSON.stringify(diagnostics).includes("fixture-"));
  assert.ok(!JSON.stringify(diagnostics).includes("hidden"));
});

test("Instagram error handling emits no Facebook diagnostics",async()=>{
  let diagnostics=0;
  await assert.rejects(collect({surface:"instagram",account,tokens,diagnostic:()=>diagnostics++,
    fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:{code:200}})})}));
  assert.equal(diagnostics,0);
});

test("Facebook posts code 10 preserves Page metrics without requesting another permission",async()=>{
  const calls=[];
  const result=await collect({surface:"facebook",account,tokens,fetchImpl:async(url,options)=>{
    calls.push(url.pathname); assert.equal(options.method,"GET");
    if(url.pathname.endsWith("/posts")) return {ok:false,status:400,json:async()=>({error:{
      code:10,type:"OAuthException",message:"(#10) This endpoint requires the 'pages_read_user_content' permission or the 'Page Public Content Access' feature."}})};
    const body=url.pathname.endsWith("/insights") ? {data:[{name:url.searchParams.get("metric"),period:"day",
      values:[{value:7,end_time:"2026-09-05T07:00:00Z"}]}]} :
      {id:"123",followers_count:5,instagram_business_account:{id:"456"}};
    return {ok:true,json:async()=>body};
  }});
  assert.equal(result.metrics.followers.value,5);
  for(const key of ["page_media_view","page_post_engagements","page_views_total"]) assert.equal(result.metrics[key].value,7);
  assert.equal(result.latestStatus,"UNAVAILABLE");
  assert.equal(result.latestUnavailableReason,"optional_post_read_permission_not_granted");
  assert.deepEqual(result.latest,[]); assert.equal(result.metrics.postCount.value,null);
  assert.equal(calls.length,5);
});

test("Facebook optional posts exception never suppresses expired tokens or rate limits",async()=>{
  for(const [status,code] of [[400,190],[429,10],[403,10]]) {
    await assert.rejects(collect({surface:"facebook",account,tokens,fetchImpl:async url=>{
      if(url.pathname.endsWith("/posts"))return {ok:false,status,json:async()=>({error:{code,type:"OAuthException",message:"pages_read_user_content"}})};
      return {ok:true,json:async()=>url.pathname.endsWith("/insights")?{data:[]}:{id:"123",instagram_business_account:{id:"456"}}};
    }}),/authority_or_rate_limit/);
  }
});
