"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {run}=require("../functions-social-operations/social_meta_scheduler");
async function scenario(records,{enabled=true,now=500000,inspectOnly=false}={}) {
 let executions=0;
 const job={id:"job",businessUid:"owner",provider:"instagram",status:"approved",scheduledFor:new Date(0).toISOString()};
 const steps={docs:records.map(record=>({data:()=>record}))};
 const row={id:job.id,data:()=>job,ref:{collection:()=>({limit:()=>({get:async()=>steps})})}};
 const db={collection:()=>({where:(_key,_op,provider)=>({limit:()=>({get:async()=>({docs:provider==="instagram"?[row]:[]})})})})};
 const publisher={inspect:async()=>({deploymentAllowsCreates:enabled,allowanceEnabled:true}),execute:async()=>{executions++;return {status:"published"};}};
 return {result:await run({db,publisher,businessUid:"owner",now,inspectOnly}),executions};
}
test("scheduler resumes known delayed container IDs after their lease, through reconciliation",async()=>{
 const f=await scenario([{receipt:{id:"100"}},{observedProviderId:"101",generation:1,leaseUntil:1}]);assert.equal(f.executions,1);
});
test("scheduler holds unknown create responses without another provider attempt",async()=>{
 const f=await scenario([{generation:1,leaseUntil:1}]);assert.equal(f.executions,0);assert.equal(f.result.results[0].status,"reconciliation_required");
});
test("scheduler bounds readiness polling and preserves active leases",async()=>{
 for(const record of [{observedProviderId:"101",generation:3,leaseUntil:1},{observedProviderId:"101",generation:1,leaseUntil:900000}])assert.equal((await scenario([record])).executions,0);
});
test("deployment guard blocks both new and resumed provider work",async()=>{
 for(const records of [[],[{observedProviderId:"101",generation:1,leaseUntil:1}]]){const f=await scenario(records,{enabled:false});assert.equal(f.executions,0);assert.equal(f.result.results[0].status,"gated");}
});
test("inspection cannot create even when an approved job is due and enabled",async()=>{
 const f=await scenario([],{inspectOnly:true});assert.equal(f.executions,0);assert.equal(f.result.results[0].status,"awaiting_scheduler");
});
test("future jobs stay scheduled with zero provider execution",async()=>{
 const f=await scenario([],{now:-1});assert.equal(f.executions,0);assert.equal(f.result.results[0].status,"scheduled");
});
test("Facebook-only deployment denies Instagram execution and activation before credentials",async()=>{
 const {createPublisher}=require("../functions-social-operations/social_meta_runtime");
 const publisher=createPublisher({project:"scaled-circle",providerCreatesEnabled:true,enabledProviders:["facebook"],
  db:{doc:()=>({get:async()=>({data:()=>({id:"job",provider:"instagram"})})})},
  credentials:async()=>{throw Error("credentials_forbidden");},fetchImpl:async()=>{throw Error("provider_forbidden");}});
 await assert.rejects(publisher.execute("job"),/deployment_creates_disabled/);
 await assert.rejects(publisher.activate("owner","approval","instagram"),/deployment_creates_disabled/);
});
