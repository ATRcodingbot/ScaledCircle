'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {load,research}=require('./admin_launch_overview');
function store(data={},failed=[]){return {collection:name=>({limit:()=>({get:async()=>{if(failed.includes(name))throw Error('unavailable');return {docs:Object.entries(data[name]||{}).map(([id,v])=>({id,data:()=>v}))};}})}),doc:path=>({get:async()=>({exists:path in data,data:()=>data[path]})})};}
test('zero-result completed research remains healthy; stale lease needs attention',()=>{
 const s={enabled:true,lastStatus:'completed',leaseUntil:0,lastCompletedAt:10,nextRunAt:100};
 assert.equal(research(s,{newProspectCount:0,duplicatesExcludedCount:6},20).status,'completed');
 assert.equal(research({...s,leaseUntil:10},null,20).status,'stale_lease');
 assert.equal(research(null,null,20).status,'unavailable');
});
test('tenant binding and document identity survive embedded ids; private fields never returned',async()=>{
 const db=store({socialManagedPolicies:{alpha:{id:'policy-1',businessUid:'alpha',status:'active',secret:'DO_NOT_RETURN'}},socialManagedCycles:{alpha:{businessUid:'alpha',status:'complete',token:'DO_NOT_RETURN'}},
 customerResearchSchedules:{alpha:{businessUid:'alpha',lastStatus:'completed',lastRunId:'run1'}},
 'agentRuns/run1':{businessUid:'other',newProspectCount:99},
 'socialConnections/alpha/providers/facebook':{status:'connected_write',tokenHealth:'healthy',accessToken:'DO_NOT_RETURN'},
 socialGrowthJobs:{a:{businessUid:'alpha',status:'scheduled'},b:{businessUid:'other',status:'scheduled'}}});
 const result=await load({db,now:20,project:'scaled-circle'});
 assert.equal(result.businesses[0].social.authorization,'active');
 assert.equal(result.businesses[0].social.scheduled,1);
 assert.equal(result.businesses[0].research.newOpportunities,null);
 assert.doesNotMatch(JSON.stringify(result),/DO_NOT_RETURN|accessToken/);
 assert.equal(result.payoutCertification.cashoutAndBankReceipt,'pending');
 assert.equal(result.paidWork,'unavailable');
});
test('missing source and capped inventory are unavailable, never zero',async()=>{
 const result=await load({db:store({socialGrowthJobs:Object.fromEntries(Array.from({length:101},(_,i)=>[i,{status:'scheduled'}]))},['businessSubscriptions'])});
 assert.equal(result.billing.active,null);assert(result.unavailableSources.includes('socialGrowthJobs'));
 assert.equal(result.payoutCertification,null);
});
