"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {project,load}=require("../functions-social-operations/social_runtime_status");
const {customerState}=require('../functions-social-operations/social_runtime_status');
test('saved draft plus write permission means review, never publication approval',()=>{
 const input={plans:[{planVersion:1,approvedVersion:null,status:'ready_for_review'}],connections:[{status:'connected_write'}]};
 const original=structuredClone(input),s=customerState(input);assert.equal(s.state,'needs_review');assert.equal(s.counters.scheduled,0);assert.equal(s.publicationAuthorizedByStatus,false);assert.deepEqual(input,original);
 assert.equal(customerState({plans:[{}]}).state,'needs_review');
 assert.equal(customerState({jobs:[{status:'scheduled',scheduledFor:'2099-01-01'}],...input}).state,'scheduled');
 assert.equal(customerState({jobs:[{status:'scheduled',scheduledFor:'2000-01-01'}],...input}).state,'waiting_for_publication');
 assert.equal(customerState({jobs:[{status:'failed'}],...input}).state,'blocked');
 assert.equal(customerState({jobs:[{status:'publishing'}]}).state,'publishing');
 assert.equal(customerState({jobs:[{status:'paused'}]}).state,'paused');
 assert.equal(customerState({jobs:[{status:'published',providerPostId:'receipt'}]}).state,'published_monitoring');
 assert.equal(customerState({}).state,'needs_permission');
});
test("Social read model distinguishes future work, due work and recorded outcomes",()=>{
 const now=Date.parse("2026-09-07T00:00:00Z");
 const jobs=[{provider:"facebook",status:"approved",scheduledFor:"2026-09-08T14:00:00Z"},
 {provider:"x",status:"approved",scheduledFor:"2026-09-06T14:00:00Z"},
 {provider:"instagram",status:"unknown_outcome",providerMediaId:null}];
 const rows=project({jobs,measurements:[],now});
 assert.equal(rows[1].needsReviewCount,0);assert.equal(rows[1].publishedWithIdCount,0);
 assert.equal(rows[1].nextScheduledFor,"2026-09-08T14:00:00.000Z");
 assert.equal(rows[0].needsReviewCount,1);assert.equal(rows[2].needsReviewCount,1);
 assert.equal(rows[2].nextMeasurementAt,null);
});
test("Social read model uses exact owner-scoped reads and distinguishes read failure from zero",async()=>{
 const queries=[];const db={collection:c=>({where:(field,op,uid)=>{queries.push([c,field,op,uid]);return{limit:n=>({get:async()=>({size:0,docs:[]})})};}})};
 const out=await load(db,"owner");assert.equal(out.available,true);assert.equal(out.channels.length,3);
 assert.ok(queries.every(q=>q[2]==="=="&&q[3]==="owner"));
 assert.deepEqual(queries.find(q=>q[0]==="socialStoryJobs"),["socialStoryJobs","owner","==","owner"]);
 assert.equal((await load({collection(){throw Error("private backend detail");}},"owner")).available,false);
});
