'use strict';
// Reservations live on the existing campaign allocation, with its immutable
// allocationEvents audit. No parallel wallet, provider write or expiry lease.
const funds=require('./campaign_fund_allocation');
function fail(reason){const e=Error(reason);e.code='failed-precondition';throw e;}
function cents(n){if(!Number.isSafeInteger(n)||n<0)fail('refund_capacity_amount_invalid');return n;}
function active(a){return Object.values(a.refundCapacity||{}).filter(r=>r.state!=='reconciled');}
function protectedAmount(id,p){
  if(!p.fundingAllocation){
    if(['paid','funded','disputed','refund_pending','refund_review_required'].includes(p.status))fail('legacy_campaign_allocation_review_required');
    return 0;
  }
  const a=funds.checked(id,p),v=funds.view(id,p),rs=active(a);
  const refundGross=rs.reduce((n,r)=>n+cents(r.amountCents),0);
  // The reservation replaces only its own still-uncommitted worker/fee
  // obligation. Once refunded in the ledger, that offset disappears until
  // the provider debit AND ledger result have been reconciled together.
  const workerOffset=Math.min(v.uncommittedWorkerCents,rs.reduce((n,r)=>n+cents(r.workerCents),0));
  const feeObligation=Math.max(cents(p.platformFeeRefundReservedCents||0),
    cents(Math.max(0,a.origin.platformFeeCents-a.earnedPlatformFeeCents-a.refundedFeeCents)));
  const feeOffset=Math.min(feeObligation,rs.reduce((n,r)=>n+cents(r.feeCents),0));
  return cents(v.unresolvedHeldCents+feeObligation+refundGross-workerOffset-feeOffset);
}
async function inventory(tx,db){
  const rows=await tx.get(db.collection('campaignPayments').limit(501));
  if(rows.size>500)fail('campaign_allocation_inventory_review_required');
  return rows.docs.map(d=>({id:d.id,data:d.data()}));
}
function available(balance){
  const n=balance?.available?.find(x=>x.currency==='usd')?.amount;
  if(balance?.livemode!==true||!Number.isSafeInteger(n))fail('refund_available_funds_unknown');
  return n;
}
async function reserve({db,stripe,paymentId,operationId,amountCents,workerCents,feeCents,now=Date.now}){
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(operationId||''))fail('refund_operation_invalid');
  if(cents(amountCents)<=0||cents(workerCents)+cents(feeCents)!==amountCents)fail('refund_capacity_amount_invalid');
  return db.runTransaction(async tx=>{
    const records=await inventory(tx,db),p=records.find(r=>r.id===paymentId)?.data;
    if(!p)fail('campaign_payment_missing');
    const a=funds.checked(paymentId,p),old=a.refundCapacity?.[operationId];
    if(old){
      if(old.amountCents!==amountCents||old.workerCents!==workerCents||old.feeCents!==feeCents)fail('refund_operation_changed');
      return {claimed:false,state:old.state};
    }
    if(p.disputeOpen||!['paid','refund_pending','refund_review_required'].includes(p.status)||
      !['healthy','held'].includes(a.sourceState))fail('refund_source_unusable');
    const v=funds.view(paymentId,p),held=active(a);
    if(workerCents+held.reduce((n,r)=>n+r.workerCents,0)>v.uncommittedWorkerCents||
      feeCents+held.reduce((n,r)=>n+r.feeCents,0)>a.origin.platformFeeCents-a.earnedPlatformFeeCents-a.refundedFeeCents)fail('earned_funds_not_refundable');
    a.refundCapacity={...a.refundCapacity,[operationId]:{operationId,amountCents,workerCents,feeCents,
      state:'reserved',paymentIntentId:a.origin.paymentIntentId,createdAtMs:now()}};
    records.find(r=>r.id===paymentId).data={...p,fundingAllocation:a};
    // Read-only provider call INSIDE each transaction attempt. A Firestore
    // conflict reruns it; a stale pre-transaction balance is never reused.
    const balance=await stripe.balance.retrieve();
    const required=records.reduce((n,r)=>n+protectedAmount(r.id,r.data),0);
    if(!Number.isSafeInteger(required)||available(balance)<required)fail('refund_capacity_insufficient');
    a.revision++;funds.persist(tx,db.doc('campaignPayments/'+paymentId),p.fundingAllocation,a,'refund_capacity_reserved',now());
    return {claimed:true,state:'reserved'};
  });
}
async function observe({db,paymentId,operationId,refund,now=Date.now}){
  return db.runTransaction(async tx=>{
    const ref=db.doc('campaignPayments/'+paymentId),p=(await tx.get(ref)).data(),a=funds.checked(paymentId,p),r=a.refundCapacity?.[operationId];
    if(!r)fail('refund_reservation_missing');
    if(!refund){ // Timeout/lost response is never permission to release/recreate.
      if(r.state!=='reserved')return;
      r.state='unknown';
    }else{
      if(refund.livemode!==true||refund.currency!=='usd'||refund.amount!==r.amountCents||
        refund.payment_intent!==r.paymentIntentId||!refund.id||
        (refund.metadata?.refundOperationId!==operationId&&refund.metadata?.paymentId!==paymentId))fail('refund_provider_identity_mismatch');
      if(r.refundId&&r.refundId!==refund.id)fail('refund_provider_identity_mismatch');
      if(r.state==='reconciled'&&refund.status==='succeeded')return;
      const state=refund.status==='succeeded'?'succeeded':['failed','canceled'].includes(refund.status)?'failed_held':'unknown';
      if(r.state===state&&r.refundId===refund.id)return;
      r.refundId=refund.id;r.state=state;
    }
    a.revision++;funds.persist(tx,ref,p.fundingAllocation,a,'refund_capacity_observed',now());
  });
}
async function reconcile({db,stripe,paymentId,operationId,now=Date.now}){
  return db.runTransaction(async tx=>{
    const records=await inventory(tx,db),p=records.find(r=>r.id===paymentId)?.data,a=funds.checked(paymentId,p),r=a.refundCapacity?.[operationId];
    if(!r||r.state==='reconciled')return;
    // No provider create here. Unknown/failed attempts remain held, including
    // after restart, until an actual provider result can be established.
    if(!r.refundId){
      const list=await stripe.refunds.list({payment_intent:r.paymentIntentId,limit:100});
      const matches=list.data.filter(x=>x.metadata?.refundOperationId===operationId||
        (operationId==='cancel_'+paymentId&&x.metadata?.paymentId===paymentId&&x.metadata?.refundReason==='unassigned_campaign_cancellation'));
      if(list.has_more||matches.length!==1)return;
      r.refundId=matches[0].id;
    }
    const refund=await stripe.refunds.retrieve(r.refundId,{expand:['balance_transaction']});
    const bt=refund.balance_transaction;
    if(refund.status!=='succeeded'||refund.livemode!==true||refund.currency!=='usd'||refund.amount!==r.amountCents||
      refund.payment_intent!==r.paymentIntentId||refund.id!==r.refundId||!bt?.id||bt.source!==refund.id||
      bt.currency!=='usd'||bt.amount!==-r.amountCents||!Number.isSafeInteger(bt.net)||bt.net>bt.amount)return;
    const ledger=a.refunds?.[operationId];
    if(!(ledger?.state==='refunded'&&ledger.workerCents===r.workerCents&&ledger.feeCents===r.feeCents)&&
       !(a.sourceState==='refunded'&&p.status==='refunded'&&a.refundedWorkerCents>=r.workerCents))return;
    const balance=await stripe.balance.retrieve();
    r.state='reconciled';r.balanceTransactionId=bt.id;r.reconciledAtMs=now();
    records.find(x=>x.id===paymentId).data={...p,fundingAllocation:a};
    if(available(balance)<records.reduce((n,x)=>n+protectedAmount(x.id,x.data),0))return;
    a.revision++;funds.persist(tx,db.doc('campaignPayments/'+paymentId),p.fundingAllocation,a,'refund_capacity_reconciled',now());
  });
}
// A quoted amount is not payout authority. No bank-payout action is provided.
async function safeWithdrawal({db,stripe,providerControlVerified=false}){
  try{return await db.runTransaction(async tx=>{
    const records=await inventory(tx,db);
    if(records.some(r=>!r.data.fundingAllocation||active(r.data.fundingAllocation).length))return 0;
    const balance=await stripe.balance.retrieve();
    return funds.withdrawal({availableCents:available(balance),allocations:records.map(r=>funds.checked(r.id,r.data)),providerControlVerified});
  });}catch(_){return 0;}
}
module.exports={reserve,observe,reconcile,protectedAmount,safeWithdrawal};
