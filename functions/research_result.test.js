'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const result=require('../functions-agentic-growth/research_result');
test('legacy syntax failures remain failures without rewriting records or treating missing counts as zero',()=>{
 const run={status:'completed',createdAt:2,completedAt:3,newProspectCount:0,discoveryChecks:[{attemptId:'x',status:'research_response_invalid',stage:'response_parsing',diagnostic:{reason:'invalid_json_syntax'}}]};const before=JSON.stringify(run);
 const f=result.freshness([{discoveredAt:1,lastCheckedAt:99}],[run]);assert.equal(f.state,'failed');assert.equal(f.candidatesParsed,null);assert.equal(f.newQualified,null);assert.equal(f.lastSuccessfulProcessingAt,null);assert.equal(f.lastNewProspectAt,1);assert.equal(JSON.stringify(run),before);assert.match(result.describe(f,10),/Unknown/);
});
test('strict output contract is identical in central and consuming adapters',()=>{
 const a=require('../functions-agentic-growth/public_web_discovery'),b=require('../functions-creative-media/public_web_discovery');assert.deepEqual(a.request('x'),b.request('x'));const r=a.request('x');assert.equal(r.text.format.strict,true);assert.equal(r.text.format.schema.properties.candidates.maxItems,4);assert.equal(r.model,'gpt-4.1-mini');assert.equal(r.max_tool_calls,1);assert.equal(r.max_output_tokens,1200);
 assert.throws(()=>a.parseCandidates({output_text:'{"candidates":[{}]}'}),e=>e.safeReason==='candidate_schema_invalid');assert.deepEqual(a.parseCandidates({output_text:'{"candidates":[]}'}),{candidates:[]});
});
test('brief separates catalog counts from seven fresh candidates and supplies a readable safe next step',()=>{
 const f=result.freshness([{discoveredAt:1789084908436}],[{id:'run-one',status:'completed',createdAt:1,completedAt:1790340563823,newQualifiedProspectCount:0,newProspectCount:0,duplicatesExcludedCount:6,suppressedCount:1,discoveryChecks:[{attemptId:'a',status:'search_completed',candidatesParsed:3,sourcesChecked:1,excluded:1,unavailable:1,duplicates:0,backoff:1},{attemptId:'b',status:'search_completed',candidatesParsed:4,sourcesChecked:0,excluded:0,unavailable:0,duplicates:0,backoff:4}]}]);
 assert.equal(f.runId,'run-one');assert.equal(f.candidatesParsed,7);assert.equal(f.sourceBackoff,5);assert.equal(f.candidateDuplicates,0);assert.equal(f.duplicates,6);
 const n=result.notification(f);assert.equal(n.title,'Daily research summary — no new leads');assert(!n.message.includes('T12:'));assert(!n.message.includes('250'));assert.match(n.detail,/catalog\/persistence duplicates/);assert.match(n.detail,/not saved in this report snapshot/);
});
