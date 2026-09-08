'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {allocation,funded}=require('./campaign_reserve_settlement');
const policy=require('./canvassing_completion');
const contract={baseAmountCents:1500,bonusAmountCents:300};
for (const [percent,earned,fee,returned] of [[92.88,1500,300,360],[98.59,1800,360,0]]) {
 test(`${percent}% earns ${earned} cents; unearned pay and associated fee return`,()=>{
  const decision=policy.decision({coverage:{state:'available',coveragePercentage:percent},baseAmountCents:1500,bonusAmountCents:300,authorityValid:true,finalized:true});
  assert.equal(decision.payableAmountCents,earned);
  const a=allocation(contract,earned);
  assert.equal(a.earnedFeeCents,fee);assert.equal(a.businessReturnCents,returned);
  assert.equal(a.finalCostCents+a.businessReturnCents,2160);
 });
}
test('partial settlement returns unused worker and fee reserves, with cent-safe conservation',()=>{
 for(let pay=0;pay<=1800;pay++) {const a=allocation(contract,pay);assert.equal(a.finalCostCents+a.businessReturnCents,2160);assert.equal(a.earnedFeeCents+a.unusedFeeCents,360);}
 assert.equal(allocation(contract,1000).businessReturnCents,960);
 assert.throws(()=>allocation(contract,1801));assert.throws(()=>allocation(contract,-1));assert.throws(()=>allocation(contract,15.2));
});
test('paid redirect alone is not reconciled funding',()=>{
 assert.ok(!funded({status:'paid'}));assert.ok(!funded({status:'paid',paidAt:1,stripePaymentIntentId:'pi_x',stripeMode:'test',settlementFrozen:true}));
 assert.ok(funded({status:'paid',paidAt:1,stripePaymentIntentId:'pi_x',stripeMode:'test'}));
});
