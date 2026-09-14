'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const learning=require('../functions-social-operations/social_format_learning');
const now=1800000000000;
function row(i,format,interactions,clicks){return {businessUid:'business',provider:'facebook',source:'meta_graph_read_only',scope:'post',hoursAfterPublication:168,
 publicationJobId:'post'+i,observedAt:new Date(now-i*86400000).toISOString(),formatVerified:true,creativeFormat:format,objective:'Estimate inquiry',qualityReady:true,
 metrics:[['reach',100],['total_interactions',interactions],['link_clicks',clicks]].map(([name,value])=>({name,value,status:'OBSERVED',period:'lifetime'}))};}
test('format learning holds sparse evidence and deduplicates publication measurements',()=>{
 const r=row(1,'generated',20,5);const out=learning.recommend({uid:'business',now,observations:Array(20).fill(r)});
 assert.equal(out.decision,'hold');assert.deepEqual(out.comparisons,[]);assert.equal(out.automaticAdjustmentEnabled,false);
});
test('format learning compares attributed equal-age same-objective evidence without a causal claim',()=>{
 const observations=Array.from({length:16},(_,i)=>row(i,i<8?'generated':'text',i<8?20:10,i<8?5:2));
 const out=learning.recommend({uid:'business',now,observations});
 assert.equal(out.comparisons.find(r=>r.format==='generated').decision,'more');
 assert.equal(out.comparisons.find(r=>r.format==='text').decision,'less');
 assert.match(out.comparisons[0].reason,/does not prove/);
 for(const patch of [{businessUid:'other'},{hoursAfterPublication:24},{scope:'account'},{formatVerified:false},{objective:'Other outcome'}]){
  assert.deepEqual(learning.recommend({uid:'business',now,observations:observations.map((r,i)=>i<8?{...r,...patch}:r)}).comparisons,[]);
 }
});
test('format is resolved from immutable published content and correct media origin',async()=>{
 const docs={socialContentVersions:{businessUid:'business',contentHash:'exact',goal:'Estimate inquiry',variants:[{provider:'facebook',mediaRevisionId:'media',mediaRequirement:'image'}]},
  socialMediaLibraries:{businessUid:'business',sourceOrigin:'generated_service_concept'}};
 const db={doc:p=>({get:async()=>({data:()=>docs[p.split('/')[0]]})})};
 const source={...row(1,'text',1,1),formatVerified:false,contentVersionId:'item_v1',contentHash:'exact'};
 assert.equal((await learning.enrich(db,'business',[source]))[0].creativeFormat,'generated');
 assert.equal((await learning.enrich(db,'business',[{...source,contentHash:'changed'}]))[0].formatVerified,false);
});
