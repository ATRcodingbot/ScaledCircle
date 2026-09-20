'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {recover}=require('../functions-social-operations/social_managed_recovery');
test('one replacement preserves failed evidence; repeated failure cannot regenerate again',async()=>{
 const rows={},uid='owner',policyId='policy',now=1000;let calls=0;
 const ref=path=>({path,update:async v=>Object.assign(rows[path],v)});
 const db={doc:ref,runTransaction:async fn=>fn({get:async r=>({exists:!!rows[r.path],data:()=>r.path==='socialManagedPolicies/'+uid?{id:policyId,businessUid:uid,status:'active',endsAt:2000}:rows[r.path]}),create:(r,v)=>{rows[r.path]=v;}})};
 const candidate={sha256:'a',preparation:{subjectQuality:{status:'blocked',checkedSha256:'a',observations:{confidence:.70}}}};
 const args={db,uid,policyId,now,input:{itemId:'item',provider:'instagram',version:3},candidate,preparation:{prepare:async(_,input)=>{calls++;assert.equal(input.action,'regenerate');assert.equal(input.candidateSha256,'a');return {generationRequest:{requestId:'new'}};}}};
 assert((await recover(args)).result.generationRequest);assert.equal((await recover(args)).exhausted,true);assert.equal(calls,1);assert.deepEqual(Object.values(rows)[0].failedCandidate,candidate);
});
