'use strict';

// Internal accounting on the maintained campaign payment. This module has no
// provider client and cannot authorize a charge, transfer, refund or bank payout.
const {createHash} = require('node:crypto');
const VERSION = 'CampaignFundAllocationV1';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(reason) { const e = Error(reason); e.code = 'failed-precondition'; throw e; }
function cents(n) { if (!Number.isSafeInteger(n) || n < 0) fail('invalid_allocation_amount'); return n; }
function sum(values) { return cents(values.reduce((a, b) => a + cents(b), 0)); }
function usable(p) {
  return p?.status === 'paid' && p.paidAt && p.stripeMode === 'live' &&
    !p.settlementFrozen && !p.disputeOpen && !p.fundingReviewRequired &&
    !p.refundRequestedAt && !p.cancellationRequestedAt;
}
function origin(paymentId, p) {
  if (!paymentId || !p?.campaignId || !p.businessId || p.currency !== 'usd' ||
      !/^pi_[A-Za-z0-9_]+$/.test(p.stripePaymentIntentId || '') || !p.paidAt || p.stripeMode !== 'live' ||
      cents(p.businessChargeCents) !== sum([p.workerAmountCents, p.platformFeeCents])) fail('allocation_source_invalid');
  return {paymentId, campaignId:p.campaignId, businessId:p.businessId, currency:p.currency,
    paymentIntentId:p.stripePaymentIntentId, customerPaidCents:p.businessChargeCents,
    workerBudgetCents:p.workerAmountCents, platformFeeCents:p.platformFeeCents};
}
function create(paymentId, p) {
  if (!usable(p)) fail('reconciled_payment_required');
  const source = origin(paymentId, p);
  return {version:VERSION, origin:source, originDigest:digest(source), revision:0,
    providerFeeCents:null, providerAvailableCents:null, sourceState:'healthy',
    assignments:{}, releasedWorkerCents:0, refundedWorkerCents:0,earnedPlatformFeeCents:0,refundedFeeCents:0,refunds:{}};
}
function checked(paymentId, p) {
  const a = p.fundingAllocation;
  if (!a || a.version !== VERSION || a.originDigest !== digest(origin(paymentId,p)) ||
      a.originDigest !== digest(a.origin)) fail('campaign_allocation_required');
  return structuredClone(a);
}
function totals(a) {
  const entries = Object.values(a.assignments);
  return {reserved:sum(entries.map(x=>x.reservedCents)), earned:sum(entries.map(x=>x.earnedCents)),
    paid:sum(entries.map(x=>x.paidCents)), owed:sum(entries.map(x=>x.earnedCents-x.paidCents)),
    committed:sum(entries.map(x=>x.reservedCents+x.earnedCents)),
    released:cents(a.releasedWorkerCents), refunded:cents(a.refundedWorkerCents)};
}
function binding(a, contract) {
  if (!contract?.immutable || !contract.contractDigest || contract.campaignId !== a.origin.campaignId ||
      contract.businessId !== a.origin.businessId || !contract.zoneId || !contract.scalerId || contract.currency !== 'usd') fail('allocation_contract_mismatch');
  return {contractDigest:contract.contractDigest, zoneId:contract.zoneId, scalerId:contract.scalerId,
    maximumCents:sum([contract.baseAmountCents,contract.bonusAmountCents || 0])};
}
function assertBinding(a, contract) {
  const b=binding(a,contract), r=a.assignments[b.zoneId];
  if (!r || Object.keys(b).some(k=>r[k]!==b[k])) fail('assignment_reserve_required');
  return r;
}
function reserve(paymentId,p,contract) {
  const a=checked(paymentId,p), b=binding(a,contract);
  if (!usable(p) || a.sourceState !== 'healthy') fail('campaign_funding_unusable');
  if (a.assignments[b.zoneId]) { assertBinding(a,contract); return a; }
  const t=totals(a);
  if (Object.values(a.refundCapacity||{}).some(r=>r.state!=='reconciled')) fail('campaign_refund_capacity_held');
  if (b.maximumCents<=0 || sum([t.committed,t.released,t.refunded,b.maximumCents])>a.origin.workerBudgetCents) fail('campaign_reserve_exhausted');
  a.assignments[b.zoneId]={...b,reservedCents:b.maximumCents,earnedCents:0,paidCents:0,started:false,payouts:{}};
  a.revision++; return a;
}
function assertStart(paymentId,p,contract) {
  const a=checked(paymentId,p), r=assertBinding(a,contract);
  if (!usable(p) || a.sourceState!=='healthy' || r.reservedCents!==r.maximumCents || r.earnedCents) fail('campaign_funding_unusable');
  // A ledger reservation is not provider cash protection. Until the retained-
  // funds control is verified and installed, no new work may use this authority.
  const proof=p.fundingProtection;
  if (proof?.version!==VERSION || proof.paymentIntentId!==a.origin.paymentIntentId ||
      proof.withdrawalControl!=='committed_funds_retained' || proof.sourceAvailable!==true ||
      !proof.providerBalanceTransactionId || !Number.isSafeInteger(proof.verifiedAtMs) ||
      proof.verifiedAtMs>Date.now() || Date.now()-proof.verifiedAtMs>300000 ||
      cents(proof.netAvailableCents)<a.origin.workerBudgetCents-totals(a).paid-totals(a).refunded) fail('campaign_cash_protection_required');
  return a;
}
function start(paymentId,p,contract) {
  const a=assertStart(paymentId,p,contract),r=assertBinding(a,contract);
  if (!r.started) { r.started=true; a.revision++; } return a;
}
function earn(paymentId,p,contract,earnedCents) {
  const a=checked(paymentId,p),r=assertBinding(a,contract); cents(earnedCents);
  if (!r.started || earnedCents>r.maximumCents) fail('earned_work_authority_required');
  if (r.settled) { if(r.earnedCents!==earnedCents)fail('earning_changed'); return a; }
  // Deliberately independent of current source usability: earned work survives
  // a later dispute. Existing recovery authority must supply real replacement cash.
  r.reservedCents=0; r.earnedCents=earnedCents; r.settled=true;
  a.earnedPlatformFeeCents+=require('./campaign_funding_quote').feeForWorkerAmount(earnedCents,
    p.platformFeeRateBasisPoints ?? p.platformFeeBasisPoints ?? 2000);
  a.releasedWorkerCents+=r.maximumCents-earnedCents; a.revision++; return a;
}
function paid(paymentId,p,contract,{operationId,amountCents,replacementFundingId=null}) {
  const a=checked(paymentId,p),r=assertBinding(a,contract); cents(amountCents);
  if (!operationId || !r.settled || amountCents<=0)fail('payout_authority_required');
  const item={amountCents,replacementFundingId,state:'paid'};
  if(r.payouts[operationId]) {
    const old=r.payouts[operationId];
    if(old.amountCents!==amountCents||old.replacementFundingId!==replacementFundingId)fail('payout_changed');
    if(old.state==='paid')return a;
  }
  if(r.paidCents+amountCents>r.earnedCents)fail('obligation_already_paid');
  r.paidCents+=amountCents;r.payouts[operationId]=item;a.revision++;return a;
}
function reopen(paymentId,p,contract,operationId) {
  const a=checked(paymentId,p),r=assertBinding(a,contract),old=r.payouts[operationId];
  if(!old)fail('payout_authority_required');if(old.state==='reopened')return a;
  r.paidCents=cents(r.paidCents-old.amountCents);old.state='reopened';a.revision++;return a;
}
function sourceState(paymentId,p,state) {
  if(!['healthy','held','disputed','refunded','reversed'].includes(state))fail('source_state_invalid');
  const a=checked(paymentId,p);if(a.sourceState===state)return a;
  a.sourceState=state;
  if(state==='refunded') {
    a.refundedFeeCents=a.origin.platformFeeCents;
    // No work is released once started, even if not reviewed/earned yet.
    for(const r of Object.values(a.assignments))if(!r.started&&!r.settled){a.refundedWorkerCents+=r.reservedCents;r.reservedCents=0;}
    const t=totals(a);a.refundedWorkerCents+=Math.max(0,a.origin.workerBudgetCents-t.committed-t.refunded);
    a.releasedWorkerCents=0;
  }
  a.revision++;return a;
}
function refund(paymentId,p,{operationId,workerCents,feeCents,reversed=false}) {
  const a=checked(paymentId,p);cents(workerCents);cents(feeCents);
  const old=a.refunds[operationId];
  if(!operationId||old&&(old.workerCents!==workerCents||old.feeCents!==feeCents))fail('refund_allocation_conflict');
  const state=reversed?'reversed':'refunded';if(old?.state===state)return a;
  if(reversed&&!old)fail('refund_allocation_conflict');
  if(!reversed&&(workerCents>a.releasedWorkerCents||feeCents>a.origin.platformFeeCents-a.earnedPlatformFeeCents-a.refundedFeeCents))fail('earned_funds_not_refundable');
  a.releasedWorkerCents+=reversed?workerCents:-workerCents;
  a.refundedWorkerCents+=reversed?-workerCents:workerCents;
  a.refundedFeeCents+=reversed?-feeCents:feeCents;
  a.refunds[operationId]={workerCents,feeCents,state};a.revision++;return a;
}
function view(paymentId,p) {
  const a=checked(paymentId,p), t=totals(a);
  const uncommitted=Math.max(0,a.origin.workerBudgetCents-t.committed-t.refunded);
  const held=t.reserved+t.owed+uncommitted;
  const healthy=usable(p)&&a.sourceState==='healthy';
  const proof=p.fundingProtection;
  const retained=proof?.withdrawalControl==='committed_funds_retained'&&proof.sourceAvailable===true&&
    Number.isSafeInteger(proof.verifiedAtMs)&&proof.verifiedAtMs<=Date.now()&&Date.now()-proof.verifiedAtMs<=300000;
  return {customerPaidCents:a.origin.customerPaidCents,providerFeeCents:a.providerFeeCents,
    platformFeeCents:a.origin.platformFeeCents,workerReserveCents:t.reserved,workerEarnedCents:t.earned,
    workerPaidCents:t.paid,uncommittedWorkerCents:uncommitted,releasedWorkerCents:t.released,
    unresolvedHeldCents:held,fundingState:p.status==='disputed'||a.sourceState==='disputed'?'disputed':
      !healthy?(t.owed||t.reserved?'shortfall':a.sourceState):Object.values(a.refundCapacity||{}).some(r=>r.state!=='reconciled')?'held':retained?'healthy':'held',
    replacementFundingRequired:!healthy&&t.owed>0,
    // Unknown provider fees or missing cash protection never become withdrawable.
    safePlatformWithdrawalCents:0};
}
function withdrawal({availableCents,allocations,otherCommittedCents=0,providerControlVerified=false}) {
  if(!Number.isSafeInteger(availableCents))fail('provider_balance_invalid');cents(otherCommittedCents);
  if(!providerControlVerified)return 0;
  let protectedCents=otherCommittedCents, eligible=0;
  for(const a of allocations) {
    if(Object.values(a.refundCapacity||{}).some(r=>r.state!=='reconciled'))return 0;
    const t=totals(a);
    if(a.sourceState!=='healthy'||a.providerFeeCents===null||a.providerAvailableCents===null)return 0;
    const remainingWorker=a.origin.workerBudgetCents-t.paid-t.refunded;
    protectedCents+=cents(remainingWorker)+cents(a.origin.platformFeeCents-a.earnedPlatformFeeCents-a.refundedFeeCents);
    // Uncommitted worker money is still refundable customer money, not revenue.
    eligible+=Math.max(0,Math.min(a.earnedPlatformFeeCents-cents(a.providerFeeCents),
      cents(a.providerAvailableCents)-remainingWorker));
  }
  return Math.max(0,Math.min(eligible,availableCents-protectedCents));
}
function persist(tx,ref,before,after,action,at) {
  if(before?.revision===after.revision)return;
  tx.update(ref,{fundingAllocation:after});
  tx.create(ref.collection('allocationEvents').doc(String(after.revision)),{
    version:VERSION,action,revision:after.revision,originDigest:after.originDigest,
    previousDigest:before?digest(before):null,resultDigest:digest(after),state:after,at});
}
module.exports={VERSION,create,checked,reserve,assertStart,start,earn,paid,reopen,refund,sourceState,view,withdrawal,persist};
