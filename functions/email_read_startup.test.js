'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('read-only service startup does not initialize outbound model tokenizer',()=>{
 const runtime=require('../functions-business-email/outbound_runtime');
 runtime.createRuntime({db:{},apiKey:null});
 assert(!Object.keys(require.cache).some(p=>p.includes('js-tiktoken')));
});
