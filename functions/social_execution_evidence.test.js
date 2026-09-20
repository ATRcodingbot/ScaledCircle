const {test}=require('node:test'),assert=require('node:assert/strict');
const {hydrate}=require('../functions-social-operations/social_execution_evidence');
const {project,state}=require('../functions-social-operations/social_lifecycle_presentation');
test('future, processing grace and overdue exception are exclusive',()=>{
 const now=Date.parse('2026-09-20T12:00:00Z');
 for(const [time,want]of [['12:01','scheduled'],['11:55','publishing'],['11:00','needs_attention']])assert.equal(state({status:'approved',scheduledFor:'2026-09-20T'+time+':00Z'},now),want);
 const r=project({uid:'owner',now,jobs:[{id:'old',businessUid:'owner',provider:'instagram',status:'approved',scheduledFor:'2026-09-13T12:00:00Z'}]});assert.equal(r.counters.scheduled,0);assert.equal(r.counters.needsAttention,1);assert.match(r.posts[0].lifecycleMessage,/No confirmed publication/);
});
test('receipt supplies actual time/link; Story shows exact saved text, tenant mismatch denied',async()=>{
 const records={'socialGrowthJobs/x/receipts/publication':{providerPostId:'123',observedAt:1789056909458,providerPostUrl:'https://x.com/ScaledCircle/status/123'},'socialStoryVersions/v':{versionId:'v',mediaRevisionId:'m',mediaHash:'h',text:'Saved exact Story',pillar:'business_value'},'socialStoryMediaRevisions/m':{owner:'owner',provider:'instagram',sha256:'h',url:'https://scaledcircle.com/social/h.jpg'}};
 const db={doc:p=>({get:async()=>({data:()=>records[p]})})};
 const x=await hydrate(db,{id:'x',canonicalKey:'socialGrowthJobs/x',businessUid:'owner',provider:'x',status:'published'},'owner');assert.equal(x.providerPostId,'123');assert.equal(x.publishedAt,1789056909458);
 const story=await hydrate(db,{id:'s',canonicalKey:'socialStoryJobs/s',owner:'owner',provider:'instagram',versionId:'v',mediaRevisionId:'m',status:'approved',scheduledFor:'2026-09-09T22:00:00Z'},'owner');assert.equal(story.binding.variants[0].copy,'Saved exact Story');assert.equal(story.providerPostId,undefined);
 const r=project({uid:'owner',channels:['x','instagram'],jobs:[x,story]});assert.equal(r.counters.published,1);assert.equal(r.counters.needsAttention,1);assert.equal(r.posts.find(p=>p.provider==='x').providerPermalink,records['socialGrowthJobs/x/receipts/publication'].providerPostUrl);
 await assert.rejects(hydrate(db,{...x,businessUid:'other'},'owner'));
});
