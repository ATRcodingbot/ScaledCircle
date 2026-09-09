'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {read}=require('./job_room_approved_amounts');
function fixture(){return {zoneId:'zone',completion:{zoneId:'zone',campaignId:'campaign',scalerId:'scaler',status:'approved'},
  zone:{assignedScalerId:'scaler',campaignId:'campaign',businessId:'owner',reviewStatus:'approved',approvedBaseAmountCents:1500,approvedBonusAmountCents:300,approvedTransferAmountCents:1800},
  earning:{zoneId:'zone',campaignId:'campaign',businessId:'owner',scalerId:'scaler',type:'scaler_earnings',amountCents:1800}};}
const empty={baseAmountCents:null,bonusAmountCents:null};
test('historical total-only ledger uses the matching recorded approval breakdown',()=>{
  const f=fixture(),before=JSON.stringify(f);assert.deepEqual(read(f),{baseAmountCents:1500,bonusAmountCents:300});assert.equal(JSON.stringify(f),before);
});
test('zero approved bonus is preserved without a coverage-based calculation',()=>{
  const f=fixture();f.earning.amountCents=1500;f.zone.approvedTransferAmountCents=1500;f.zone.approvedBonusAmountCents=0;f.zone.completionPercentage=100;
  assert.deepEqual(read(f),{baseAmountCents:1500,bonusAmountCents:0});
});
test('mismatched parties, totals or approval states never invent a breakdown',()=>{
  for(const change of [f=>f.earning.businessId='other',f=>f.earning.zoneId='other',f=>f.earning.campaignId='other',f=>f.zone.assignedScalerId='other',
    f=>f.completion.scalerId='other',f=>f.zone.reviewStatus='pending',f=>f.completion.status='submitted',f=>f.zone.approvedTransferAmountCents=1799,
    f=>f.zone.approvedBonusAmountCents=299,f=>delete f.zone.approvedBaseAmountCents,f=>f.zone.approvedBaseAmountCents=-1]){
    const f=fixture();change(f);assert.deepEqual(read(f),empty);
  }
});
test('recorded ledger components must add up exactly and cannot be hidden by a fallback',()=>{
  const f=fixture();Object.assign(f.earning,{baseAmountCents:1500,bonusAmountCents:300});assert.deepEqual(read(f),{baseAmountCents:1500,bonusAmountCents:300});
  f.earning.bonusAmountCents=299;assert.deepEqual(read(f),empty);
});
