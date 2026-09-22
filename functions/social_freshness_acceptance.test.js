'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {project}=require('../functions-social-operations/social_performance_presentation');
const {permitted}=require('../functions-social-operations/social_measurement_authority');
const {timeLabel}=require('../functions-social-operations/social_lifecycle_presentation');
const {zone}=require('../functions-social-operations/workspace_presentation');
const now=Date.parse('2026-09-22T12:00:00Z');
const snapshot={schemaVersion:'MetaBaselineV1',provider:'facebook',providerAccountId:'123',observedAt:'2026-09-13T12:00:00Z',metrics:{followers:{value:0}}};
test('historical zero stays historical; unavailable never becomes a fresh zero',()=>{
 const view=project([snapshot],[],{now}).platforms[0];
 assert.equal(view.freshness,'stale');assert.equal(view.metrics[0].current,0);assert.equal(view.metrics[0].change,null);
 const missing=project([],[],{now}).platforms[0];assert.equal(missing.freshness,'unavailable');assert.equal(missing.metrics[0].current,null);
 assert.equal(project([snapshot],[],{now,connections:[{provider:'facebook',metricCollectionHealth:'error'}]}).platforms[0].freshness,'unavailable');
 assert.equal(project([snapshot],[],{now,connections:[{provider:'facebook',providerUserId:'456'}]}).platforms[0].currentAt,null);
});
test('saved scheduling zone is resolved without modifying scheduled instant or duplicating UTC',()=>{
 assert.equal(zone({}, {}, {settings:{timeZone:'America/New_York'}}),'America/New_York');
 const instant='2026-09-22T19:00:00.000Z';assert.match(timeLabel(instant,'America/New_York'),/3:00 PM EDT/);
 assert.doesNotMatch(timeLabel(instant,'UTC'),/UTC.*UTC/);assert.equal(instant,'2026-09-22T19:00:00.000Z');
});
test('current entitled customer measurement is not limited to internal dogfood; account and tenant boundaries remain',async()=>{
 const args={job:{businessUid:'owner',provider:'instagram',customerApproval:true},approval:{businessUid:'owner',approvedByUid:'owner',providerAccounts:{instagram:{providerUserId:'123'}}},connection:{environment:'production',status:'connected_write',tokenHealth:'healthy',providerUserId:'123'},environment:'production',config:{metaDogfood:{businessUid:'internal'}},authorizeCustomer:async({uid})=>uid==='owner',authorizeInternal:()=>{throw Error('wrong path');}};
 assert.equal(await permitted(args),true);
 await assert.rejects(permitted({...args,job:{...args.job,customerApproval:false}}),/authority/);
 await assert.rejects(permitted({...args,authorizeCustomer:async()=>false}),/authority/);
 await assert.rejects(permitted({...args,connection:{...args.connection,providerUserId:'other'}}),/identity/);
 await assert.rejects(permitted({...args,approval:{...args.approval,businessUid:'other'}}),/identity/);
});
