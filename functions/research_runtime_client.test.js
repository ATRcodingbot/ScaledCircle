'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const runtime=require('../functions-agentic-growth/research_runtime_client');
const uid='IqRjZYHKOzXYuJcSyL68LYNwtDg1';
test('only exact pilot workspaces get a runtime adapter',()=>{
 assert.equal(runtime.create({project:'scaled-circle',businessUid:'another'}),null);
 assert.equal(runtime.create({project:'scaledcircle-staging',businessUid:uid}),null);
});
test('disabled configuration prevents credential acquisition or dispatch',async()=>{
 let authCalls=0;
 const adapter=runtime.create({project:'scaled-circle',businessUid:uid,db:{doc:()=>({get:async()=>({data:()=>({enabled:false})})})},auth:{getIdTokenClient:async()=>{authCalls++;}}});
 await assert.rejects(adapter.executeRequest({workspace:'scaled-circle/'+uid}),/not_enabled/);
 assert.equal(authCalls,0);
});
test('enabled runtime uses fixed central authority without HTTP retry or cross-workspace dispatch',async()=>{
 const calls=[];
 const adapter=runtime.create({project:'scaled-circle',businessUid:uid,db:{doc:()=>({get:async()=>({data:()=>({enabled:true,centralEndpoint:runtime.ENDPOINT})})})},auth:{getIdTokenClient:async audience=>{assert.equal(audience,runtime.ENDPOINT);return {request:async request=>{calls.push(request);return {data:{ok:true}};}};}}});
 await assert.rejects(adapter.executeRequest({workspace:'scaledcircle-staging/'+uid}),/not_enabled/);
 const body={workspace:'scaled-circle/'+uid,operation:'metadata'};
 assert.deepEqual(await adapter.executeRequest(body),{ok:true});
 assert.equal(calls.length,1);assert.equal(calls[0].retry,false);assert.equal(calls[0].url,runtime.ENDPOINT);assert.deepEqual(calls[0].data,body);
});
