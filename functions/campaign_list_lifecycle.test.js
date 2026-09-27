'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const lifecycle=require('../functions-campaign-funding/campaign_funding_lifecycle');
const {assertAcceptingWork}=require('./campaign_list_lifecycle');
test('organizational closure retains precisely the prior refund eligibility, including all blockers',()=>{
  for(const prior of ['open','funded','draft','active','completed']) {
    for(const flags of [{},{hasAssignedZone:true},{hasAcceptedApplication:true},{hasTrackingSession:true},
      {hasCompletionEvidence:true},{hasWorkerEarning:true},{hasSettlement:true},{hasDispute:true},{hasMaterialHandoff:true}]) {
      const campaign={status:prior,fundingStatus:'funded'},payment={status:'paid'};
      assert.deepEqual(lifecycle.cancelRefundEligibility({campaign,payment,...flags}),
        lifecycle.cancelRefundEligibility({campaign:{...campaign,status:'closed',workEntryClosed:true,closedFromStatus:prior},payment,...flags}));
    }
  }
  assert.equal(lifecycle.cancelRefundEligibility({campaign:{status:'closed',fundingStatus:'funded'},payment:{status:'paid'}}).eligible,false);
});
test('work closure latch prevents accidental reopen even if a legacy status changes',()=>{
  for(const status of ['open','active','available','draft','closed'])assert.throws(()=>assertAcceptingWork({status,workEntryClosed:true}),{code:'failed-precondition'});
  for(const status of ['open','active','in_progress'])assert.doesNotThrow(()=>assertAcceptingWork({status}));
});
test('archive marker never controls settlement or completed work-start eligibility',()=>{
  assert.throws(()=>assertAcceptingWork({status:'completed',archived:false}));
  assert.throws(()=>assertAcceptingWork({status:'completed',archived:true}));
});
