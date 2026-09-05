"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const growth=require("../functions-social-operations/social_growth_cycle");
const measurement=require("../functions-social-operations/social_meta_measurements");
function fixture(provider="facebook") {
 const approval={id:"approval",businessUid:"owner",approvedByUid:"owner",providerAccounts:{[provider]:{providerUserId:"123"}},
  items:[{versionId:"version",bindingHash:"binding",contentHash:"copy-and-media",scheduledFor:"2030-01-01T00:00:00Z",variants:[{provider,copy:"Approved"}]}]};
 const job={...growth.jobs(approval)[0],status:"published",providerPostId:"123_456"};
 const receipt={provider,providerPostId:"123_456",contentHash:"copy-and-media",observedAt:1000};
 const evidence={provider,providerAccountId:"123",providerPostId:"123_456",scope:"post",metrics:[{name:"views",value:0,status:"OBSERVED",period:"day",providerEndTime:"2030-01-02T00:00:00Z",complete:false}]};
 return {approval,job,receipt,evidence,observedAt:"2030-01-01T12:00:00Z"};
}
test("Meta measurements bind deterministic 24h/week observations to exact immutable receipt",()=>{
 const f=fixture();const jobs=measurement.plan(f.job,f.receipt,f.approval);
 assert.deepEqual(jobs,measurement.plan(f.job,f.receipt,f.approval));assert.equal(jobs.length,2);
 assert.equal(jobs[0].contentVersionId,"version");assert.equal(jobs[0].publicationJobId,f.job.id);
 assert.equal(jobs[0].scheduledFor,new Date(1000+86400000).toISOString());
});
test("zero in incomplete daily bucket remains zero/daily/incomplete, never a period total",()=>{
 const value=measurement.observation(fixture());assert.equal(value.metrics[0].value,0);assert.equal(value.metrics[0].period,"day");assert.equal(value.metrics[0].complete,false);
 assert.equal(value.cadenceDecision,"HOLD_PENDING_REVIEW");
});
test("unavailable, no data and execution error remain distinct",()=>{
 for(const status of ["UNAVAILABLE","NO_DATA","ERROR"]){const f=fixture();f.evidence.metrics[0]={name:"views",value:null,status,period:"lifetime"};assert.equal(measurement.observation(f).metrics[0].status,status);}
});
test("account totals, another provider, another post or changed receipt cannot become post evidence",()=>{
 for(const change of [{scope:"account"},{provider:"instagram"},{providerPostId:"987"},{providerAccountId:"9"}]){
  const f=fixture();Object.assign(f.evidence,change);assert.throws(()=>measurement.observation(f),/evidence_mismatch/);
 }
 const f=fixture();f.receipt.contentHash="substitution";assert.throws(()=>measurement.observation(f),/receipt_mismatch/);
});
test("measurement projection does not mutate the canonical job, approval, receipt or evidence",()=>{
 const f=fixture(),before=structuredClone(f);measurement.observation(f);measurement.plan(f.job,f.receipt,f.approval);assert.deepEqual(f,before);
});
test("Instagram post reader preserves zero, unsupported and valid-empty responses independently",async()=>{
 const f=fixture("instagram"),methods=[];
 const result=await require("../functions-social-operations/social_meta_post_insights").collect({...f,
  session:{businessUid:"owner",providerUserId:"123",accessToken:"fixture-only"},fetchImpl:async(url,options)=>{
   methods.push(options.method);const u=new URL(url);assert.equal(u.searchParams.has("access_token"),false);
   if(u.pathname.endsWith("/media"))return {ok:true,json:async()=>({data:[{id:f.receipt.providerPostId}]})};
   const metric=u.searchParams.get("metric");
   if(metric==="reach")return {ok:false,status:400,json:async()=>({error:{code:100,message:"Invalid metric"}})};
   return {ok:true,json:async()=>({data:metric==="views"?[{name:"views",period:"lifetime",values:[{value:0}]}]:[]})};
  }});
 assert.deepEqual(result.metrics.map(x=>[x.status,x.value]),[["OBSERVED",0],["UNAVAILABLE",null],["NO_DATA",null]]);
 assert.deepEqual(methods,["GET","GET","GET","GET"]);
});
test("Facebook post reader does not turn account baseline values into post metrics",async()=>{
 const f=fixture();const result=await require("../functions-social-operations/social_meta_post_insights").collect({...f,
  session:{businessUid:"owner",providerUserId:"123",accessToken:"fixture-only"},fetchImpl:async(_url,options)=>{
   assert.equal(options.method,"GET");return {ok:true,json:async()=>({id:f.receipt.providerPostId,from:{id:"123"},reactions:{summary:{total_count:0}},comments:{summary:{total_count:2}}})};
  }});
 assert.equal(result.metrics.find(x=>x.name==="reactions").value,0);assert.equal(result.metrics.find(x=>x.name==="views").status,"UNAVAILABLE");
});
test("wrong post owner fails without accepting any measurement",async()=>{
 const f=fixture();await assert.rejects(require("../functions-social-operations/social_meta_post_insights").collect({...f,
  session:{businessUid:"owner",providerUserId:"123",accessToken:"fixture-only"},fetchImpl:async()=>({ok:true,json:async()=>({id:f.receipt.providerPostId,from:{id:"456"}})})}),/post_not_verified/);
});
