'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const discovery=require('../functions-agentic-growth/customer_discovery'),op=require('../functions-agentic-growth/growth_opportunities');
const now=Date.parse('2026-09-10T12:00:00Z'),profile={servicesOffered:['decks','general contracting']};
const row=(title,id,date,status='open')=>`<div class="fw-bold text-body d-none d-lg-block">${title}</div><span class="status-${status}-pill">${status}</span><strong>RFQ Number:</strong> ${id}<strong>Deadline:</strong> ${date}`;
test('live bid discovery is dynamic, service-aware and excludes expired or closed listings',()=>{
 const html=row('Office Renovation','RFQ-123','09/15/2026')+row('Fence Repair','RFQ-124','09/09/2026')+row('Fence Repair','RFQ-125','09/19/2026','closed')+row('Software supply','RFQ-126','09/19/2026');
 const found=discovery.parseBids(html,discovery.hubs[0],profile,now);assert.equal(found.length,1);assert.equal(found[0].sourceRecordId,'RFQ-123');assert.equal(found[0].explicitNeed,true);assert.match(found[0].unknowns,/eligibility/);
 assert.equal(discovery.parseBids(html,discovery.hubs[0],{servicesOffered:['dentistry']},now).length,0);
});
test('source failure does not invent opportunity and no unrelated geography is fetched',async()=>{
 let n=0;const readSource=async()=>{n++;throw Error('blocked');};
 assert.deepEqual((await discovery.discover({profile,scope:{areas:[]},readSource,now})).sources,[]);assert.equal(n,0);
});
test('channels, accounts and public candidates are distinct with explainable ranking',()=>{
 const p={kind:'business',category:'construction opportunities',qualified:true,sourceAvailable:true,lastCheckedAt:now};const old=structuredClone(p);
 assert.equal(op.project(p,now).opportunityType,'partner_channel');assert.deepEqual(p,old);
 assert.equal(op.project({...p,kind:'referral_partner'},now).opportunityType,'recruitment_channel');
 const bid=op.project({...p,opportunityType:'public_bid',explicitNeed:true,deadline:'2026-09-15'},now);
 assert.equal(bid.opportunityGroup,'Direct opportunities');assert.ok(bid.ranking.score>op.project(p,now).ranking.score);assert.equal(bid.ranking.factors.length,8);
 assert.equal(op.project({...p,opportunityType:'property_management'},now).currentOpportunity,false);
 assert.equal(op.project({...p,opportunityType:'public_bid',explicitNeed:true,deadline:'2026-09-01'},now).currentOpportunity,false);
 assert.equal(op.project({...p,kind:'scaler'},now).opportunityGroup,'Workforce candidates');
 const paid=op.project({...p,opportunityType:'paid_lead_source'},now);assert.equal(paid.ranking.score,0);assert.equal(paid.opportunityGroup,'Excluded paid sources');
});
