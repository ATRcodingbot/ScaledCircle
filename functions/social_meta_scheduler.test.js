"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {run}=require("../functions-social-operations/social_meta_scheduler");
async function scenario(records,{enabled=true,now=500000}={}) {
 let executions=0;
 const job={id:"job",businessUid:"owner",provider:"instagram",status:"approved",scheduledFor:new Date(0).toISOString()};
 const steps={docs:records.map(record=>({data:()=>record}))};
 const row={id:job.id,data:()=>job,ref:{collection:()=>({limit:()=>({get:async()=>steps})})}};
 const db={collection:()=>({where:(_key,_op,provider)=>({limit:()=>({get:async()=>({docs:provider==="instagram"?[row]:[]})})})})};
 const publisher={inspect:async()=>({deploymentAllowsCreates:enabled,allowanceEnabled:true}),execute:async()=>{executions++;return {status:"published"};}};
 return {result:await run({db,publisher,businessUid:"owner",now}),executions};
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
