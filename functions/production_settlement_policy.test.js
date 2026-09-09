'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {hash}=require('./route_progress');
const policy=require('./production_campaign_policy'),allocation=require('./campaign_reserve_settlement').allocation;
const lifecycle=require('../functions-campaign-funding/campaign_funding_lifecycle');
function offer(base,bonus,count){const body={version:'CanvassingRoute80_95V1',baseAmountCents:base,bonusAmountCents:bonus,
 workerReserveCents:(base+bonus)*count,bindings:Array.from({length:count},(_,i)=>({zoneId:'zone'+i})),
 baseThresholdBasisPoints:8000,bonusThresholdBasisPoints:9500,coverageBasis:'unique_assigned_route_estimate'};
 return {...body,offerDigest:hash(body)};}
test('funding and settlement round at the same assignment boundary with no stranded cents',()=>{
 for(const count of [1,2,3,32])for(const base of [1500,1501,1502,1503,1504])for(const bonus of [0,300,301,302]){
  const accepted=offer(base,bonus,count),q=policy.settlementQuote(lifecycle,accepted);
  for(const earned of [base,base+bonus,Math.floor(base/2)]){
   const a=allocation(accepted,earned);
   assert.equal(count*(a.finalCostCents+a.businessReturnCents),q.totalChargeCents);
   assert.equal(count*a.maximumFeeCents,q.platformFeeCents);
  }
 }
});
test('the accepted single-zone examples keep their exact cost and return',()=>{
 const o=offer(1500,300,1),q=policy.settlementQuote(lifecycle,o);
 assert.equal(q.totalChargeCents,2160);
 assert.deepEqual([allocation(o,1500).earnedFeeCents,allocation(o,1500).businessReturnCents],[300,360]);
 assert.deepEqual([allocation(o,1800).earnedFeeCents,allocation(o,1800).businessReturnCents],[360,0]);
});
