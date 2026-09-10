'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const bridge=require('../functions-agentic-growth/internal_growth_bridge');
test('internal bridge fails closed on tenant impersonation, arbitrary operations and scope injection',()=>{
 for(const body of [{actorUid:'other',operation:'load'},{actorUid:'admin',operation:'delete'},{actorUid:'admin',operation:'load',input:{businessUid:'other'}},{actorUid:'admin',operation:'load',path:'wallets/x'}])assert.throws(()=>bridge.validateEnvelope(body,'admin'));
 assert.throws(()=>bridge.validateEnvelope({actorUid:'admin',operation:'load'},''));
 assert.equal(bridge.validateEnvelope({actorUid:'admin',operation:'load'},'admin').operation,'load');
});
test('production forwarding uses only pinned private bridge with IAM identity, no database credentials',async()=>{
 let called=0;const auth={getIdTokenClient:async url=>({request:async request=>{called++;assert.equal(request.url,url);assert.equal(request.data.actorUid,'admin');return {data:{result:{prospects:[]}}};}})};
 await assert.rejects(bridge.forward({url:'https://arbitrary.example',actorUid:'admin',operation:'load',auth}));assert.equal(called,0);
 assert.deepEqual(await bridge.forward({url:'https://internalgrowthworkspacebridgev1-abc-ue.a.run.app',actorUid:'admin',operation:'load',auth}),{prospects:[]});assert.equal(called,1);
});
test('production access requires exact live Admin identity, never email or browser claims alone',()=>{
 const valid={expectedUid:'admin',uid:'admin',tokenVerified:true,user:{role:'admin',active:true},identity:{emailVerified:true,disabled:false}};
 bridge.authorizeProductionActor(valid);
 bridge.authorizeProductionActor({...valid,user:{role:'admin',active:false}});
 for(const changed of [{expectedUid:''},{uid:'other'},{tokenVerified:false},{user:{role:'business',active:true}},{identity:{emailVerified:true,disabled:true}},{identity:{emailVerified:false,disabled:false}}])assert.throws(()=>bridge.authorizeProductionActor({...valid,...changed}));
});
