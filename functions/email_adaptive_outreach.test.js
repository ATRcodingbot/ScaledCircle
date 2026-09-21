'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const a=require('../functions-business-email/adaptive_outreach');
const now=Date.parse('2026-09-21T15:00:00Z'),sent=now-10*86400000;
function fixture(){const operations=[],outcomes=[];for(const variant of ['baseline','alternative'])for(let i=0;i<40;i++){
 const id=variant+i;operations.push({id,businessId:'one',state:'sent',requestedAt:sent,assistance:{kind:'introduction'},outreach:{strategyId:'s',segmentId:'g',identity:id,variant}});
 if(i<(variant==='alternative'?32:3))outcomes.push({businessId:'one',operationId:id,outcome:'interested',recordedAt:sent+1000});
 }return {businessId:'one',strategyId:'s',segmentId:'g',objective:'qualified_conversation',operations,outcomes,now};}
test('comparable mature qualified evidence changes future selection while preserving baseline and exploration',()=>{
 const data=fixture(),result=a.evaluate(data);assert.equal(result.decision,'PREFER_ALTERNATIVE');assert.equal(result.groups.alternative.n,40);
 const identities=Array.from({length:1000},(_,i)=>'prospect'+i);
 const before=identities.map(id=>a.choose(id,'s','HOLD')),after=identities.map(id=>a.choose(id,'s',result.decision));
 assert.ok(before.every(v=>v==='baseline'));
 assert.ok(after.filter(x=>x==='alternative').length>before.filter(x=>x==='alternative').length);
 assert.ok(after.includes('baseline'));assert.equal(a.choose('stable','s',result.decision),a.choose('stable','s',result.decision));
});
test('small, immature, truncated, cross-workspace, different segments and certification evidence HOLD',()=>{
 const d=fixture();for(const patch of [{operations:d.operations.slice(0,2)},{now:sent+86400000},{truncated:true},{businessId:'other'},{segmentId:'other'}, {operations:d.operations.map(o=>({...o,certification:true}))}])assert.equal(a.evaluate({...d,...patch}).decision,'HOLD');
});
test('duplicates and negative/corrected outcomes cannot produce a qualified winner',()=>{
 const d=fixture();d.operations.push(...d.operations);assert.equal(a.evaluate(d).groups.alternative.n,40);
 d.outcomes.push(...d.outcomes.filter(e=>e.operationId.startsWith('alternative')).map(e=>({...e,outcome:'do_not_contact',recordedAt:sent+2000})));
 const corrected=a.evaluate(d);assert.equal(corrected.groups.alternative.positive,0);assert.equal(corrected.decision,'PREFER_BASELINE');
});
test('raw and automated replies are not positive outcomes and old versus new cohorts are incomparable',()=>{
 const d=fixture();d.outcomes=[];d.operations=d.operations.map(o=>({...o,replyCount:5}));assert.equal(a.evaluate(d).groups.alternative.positive,0);assert.equal(a.evaluate(d).decision,'HOLD');
 const c=fixture();c.operations=c.operations.map(o=>o.outreach.variant==='baseline'?{...o,requestedAt:sent-14*86400000}:o);assert.equal(a.evaluate(c).decision,'HOLD');
});
test('adaptive consent requires a distinct reviewed alternative and cannot encode sending authority',()=>{
 const p={templates:{introduction:{subject:'A',body:'A'}},adaptiveOutreach:{enabled:true,objective:'qualified_conversation',alternative:{subject:'B',body:'B'}}};
 assert.equal(a.validate(p),null);assert.ok(a.validate({...p,adaptiveOutreach:{...p.adaptiveOutreach,sendLimit:999}}));assert.ok(a.validate({...p,adaptiveOutreach:{...p.adaptiveOutreach,alternative:p.templates.introduction}}));
});
