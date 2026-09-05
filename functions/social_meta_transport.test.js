"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const growth=require("../functions-social-operations/social_growth_cycle");
const {createAdapter}=require("../functions-social-operations/social_meta_transport");
function fixture(fetchImpl,authorizeCreate=async()=>{}){
 const account={businessUid:"fixture",providerUserId:"123"};
 const approval={id:"approval",businessUid:"fixture",approvedByUid:"fixture",providerAccounts:{facebook:account},
  items:[{versionId:"v1",bindingHash:"binding",scheduledFor:"2030-01-01T00:00:00Z",
   variants:[{provider:"facebook",format:"text",copy:"Approved Page copy."}]}]};
 const job=growth.jobs(approval)[0];
 const adapter=createAdapter({job,account,approval,fetchImpl,authorizeCreate,
  credentials:async()=>({...account,accessToken:"fixture-token"}),now:()=>2000});
 const request={method:"POST",path:"/123/feed",body:{message:"Approved Page copy."}};
 return {adapter,request};
}
test("Meta transport sends exact approved Page copy once and verifies owner",async()=>{
 const calls=[];
 const {adapter,request}=fixture(async(url,options)=>{
  calls.push(options.method); assert.equal(url.origin,"https://graph.facebook.com");
  assert.equal(url.searchParams.has("access_token"),false);
  return {ok:true,json:async()=>options.method==="POST"?{id:"123_456"}:{id:"123_456",from:{id:"123"},message:"Approved Page copy."}};
 });
 const receipt=await adapter.create({kind:"text",request});
 await adapter.verify({kind:"text",request,receipt});
 assert.deepEqual(calls,["POST","GET"]);
 assert.equal(receipt.id,"123_456");
});
test("Supervisor denial and changed copy stop before any network write",async()=>{
 let calls=0;
 const {adapter,request}=fixture(async()=>{calls++;},async()=>{throw Error("paused")});
 await assert.rejects(adapter.create({kind:"text",request}),/paused/);
 await assert.rejects(adapter.create({kind:"text",request:{...request,body:{message:"substitution"}}}),/changed/);
 assert.equal(calls,0);
});
test("Unknown Page outcome is read-only, ambiguous matches never authorize a retry",async()=>{
 const calls=[];
 const {adapter,request}=fixture(async(url,options)=>{
  calls.push(options.method);
  if(options.method==="POST")throw Error("lost_response");
  return {ok:true,json:async()=>({data:[1,2].map(n=>({id:`123_${n}`,from:{id:"123"},message:"Approved Page copy.",created_time:new Date(1000).toISOString()}))})};
 });
 await assert.rejects(adapter.create({kind:"text",request}),/lost_response/);
 assert.equal(await adapter.reconcile({kind:"text",request,record:{startedAt:1000}}),null);
 assert.deepEqual(calls,["POST","GET"]);
});
test("Stored observed provider ID still requires exact owner verification",async()=>{
 const {adapter,request}=fixture(async()=>({ok:true,json:async()=>({id:"123_456",from:{id:"999"},message:"Approved Page copy."})}));
 const receipt=await adapter.reconcile({kind:"text",request,record:{observedProviderId:"123_456"}});
 await assert.rejects(adapter.verify({kind:"text",request,receipt}),/identity_mismatch/);
});
