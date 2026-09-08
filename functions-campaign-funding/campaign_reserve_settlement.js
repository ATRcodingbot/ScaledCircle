"use strict";

const {assertSafeCents, feeForWorkerAmount} = require('./campaign_funding_quote');
const {operationId} = require('./marketplace_finance');
const VERSION = 'EarnedWorkReserveReturnV1';
function fail(message) { const e = new Error(message); e.code = 'failed-precondition'; throw e; }
function funded(payment) {
  return payment.settlementFrozen !== true && (payment.status === 'funded' ||
    (payment.status === 'paid' && payment.paidAt && /^pi_/.test(payment.stripePaymentIntentId || '') &&
      ['test','live'].includes(payment.stripeMode)));
}
function allocation(contract, earnedCents, rate = 2000) {
  const maximumWorkerCents = assertSafeCents(contract.baseAmountCents) + assertSafeCents(contract.bonusAmountCents || 0);
  assertSafeCents(maximumWorkerCents); assertSafeCents(earnedCents);
  if (earnedCents > maximumWorkerCents) fail('Approved pay exceeds the accepted compensation.');
  const maximumFeeCents = feeForWorkerAmount(maximumWorkerCents, rate);
  const earnedFeeCents = feeForWorkerAmount(earnedCents, rate);
  const unusedWorkerCents = maximumWorkerCents - earnedCents, unusedFeeCents = maximumFeeCents - earnedFeeCents;
  return {policyVersion:VERSION, maximumWorkerCents, maximumFeeCents, earnedWorkerCents:earnedCents,
    earnedFeeCents, unusedWorkerCents, unusedFeeCents, businessReturnCents:unusedWorkerCents+unusedFeeCents,
    finalCostCents:earnedCents+earnedFeeCents, maximumCostCents:maximumWorkerCents+maximumFeeCents};
}

function createService({db, FieldValue, project, stripe}) {
  function staging() { if (project !== 'scaledcircle-staging') fail('This settlement release is staging only.'); }
  const now = () => FieldValue.serverTimestamp();
  // Internal semantic operation only. Callers must first prove ordinary evidence,
  // or an immutable paused-work offer accepted by the intended Scaler.
  async function commit(tx, {zoneId, zone, contract, paymentId, payment, payout, actorUid,
    completionId = null, source = 'ordinary_review', evidence = null}) {
    staging();
    if (!funded(payment) || payment.campaignId !== zone.campaignId || payment.businessId !== zone.businessId ||
        contract.immutable !== true || contract.zoneId !== zoneId || contract.campaignId !== zone.campaignId ||
        contract.scalerId !== zone.assignedScalerId || contract.businessId !== zone.businessId ||
        zone.settlementBlocked === true || zone.disputeOpen === true) fail('Funding, assignment or compensation needs review.');
    if (payment.stripeMode !== 'test' || !/^pi_/.test(payment.stripePaymentIntentId || '') ||
        (payment.currency && payment.currency !== 'usd')) fail('Verified staging TEST funding is required.');
    if (assertSafeCents(payout.baseAmountCents) > contract.baseAmountCents ||
        assertSafeCents(payout.bonusAmountCents) > (contract.bonusAmountCents || 0) ||
        payout.baseAmountCents + payout.bonusAmountCents !== payout.transferAmountCents) fail('Approved compensation does not reconcile.');
    const rate = payment.platformFeeRateBasisPoints ?? payment.platformFeeBasisPoints ?? 2000;
    const amounts = allocation(contract, payout.transferAmountCents, rate);
    const paidWorker = assertSafeCents(payment.workerAmountCents), paidFee = assertSafeCents(payment.platformFeeCents);
    if (assertSafeCents(payment.businessChargeCents) !== paidWorker + paidFee) fail('Funding totals do not reconcile.');
    const workerUsed = assertSafeCents(payment.reservedWorkerAmountCents || 0) + assertSafeCents(payment.transferredWorkerAmountCents || 0) +
      assertSafeCents(payment.refundedWorkerAmountCents || 0) + assertSafeCents(payment.refundReservedWorkerAmountCents || 0);
    const feeUsed = assertSafeCents(payment.platformFeeRecognizedCents || 0) + assertSafeCents(payment.platformFeeRefundedCents || 0) +
      assertSafeCents(payment.platformFeeRefundReservedCents || 0);
    const settlementRef = db.doc('campaignSettlements/'+zoneId), transferId = operationId('scaler-transfer',zoneId,1);
    const transferRef = db.doc('scalerTransfers/'+transferId), walletRef = db.doc('wallets/'+zone.assignedScalerId);
    const earningId = `earning_${zoneId}_v1`, nested = walletRef.collection('transactions').doc(earningId), global = db.doc('walletTransactions/'+earningId);
    const refundId = operationId('unused-work-reserve',paymentId,zoneId,1), refundRef = db.doc('financialOperations/'+refundId);
    const snapshots = await Promise.all([settlementRef,transferRef,walletRef,nested,global,refundRef].map(ref=>tx.get(ref)));
    if (snapshots[0].exists) {
      const prior = snapshots[0].data();
      if (prior.paymentId !== paymentId || prior.scalerId !== zone.assignedScalerId ||
          prior.earnedWorkerCents !== payout.transferAmountCents) fail('Existing settlement differs from this request.');
      return {...prior,alreadyProcessed:true};
    }
    if (workerUsed + amounts.maximumWorkerCents > paidWorker || feeUsed + amounts.maximumFeeCents > paidFee) fail('The assignment reserve has already been allocated.');
    if ([1,3,4,5].some(i=>snapshots[i].exists)) fail('Existing financial evidence conflicts with this settlement.');
    const balance = Number(snapshots[2].data()?.availableBalance || 0);
    if (!Number.isFinite(balance) || balance < 0) fail('The Scaler Wallet needs review.');
    const settlement = {...amounts,zoneId,campaignId:zone.campaignId,businessId:zone.businessId,scalerId:zone.assignedScalerId,
      paymentId,source,actorUid,evidence,refundOperationId:amounts.businessReturnCents ? refundId : null,
      returnStatus:amounts.businessReturnCents ? 'refund_pending' : 'not_required',createdAt:now()};
    tx.create(settlementRef,settlement);
    tx.update(db.doc('campaignZones/'+zoneId), {status:'completed',reviewStatus:'approved',redoRequired:false,
      approvedTransferAmountCents:payout.transferAmountCents,approvedBaseAmountCents:payout.baseAmountCents,
      approvedBonusAmountCents:payout.bonusAmountCents,reviewedBy:actorUid,reviewedAt:now(),reviewFinalizedAt:now(),
      paymentStatus:'transfer_pending',reserveSettlementId:zoneId,gpsTracking:false,
      activeTrackingSessionId:FieldValue.delete(),resumableTrackingSessionId:FieldValue.delete(),updatedAt:now()});
    if (completionId) tx.update(db.doc('campaignCompletions/'+completionId),{status:'approved',reviewStatus:'approved',
      approvedTransferAmountCents:payout.transferAmountCents,approvedAt:now(),completedAt:now(),reviewedAt:now(),updatedAt:now()});
    if (payout.transferAmountCents > 0) {
      tx.create(transferRef,{transferOperationId:transferId,paymentId,campaignId:zone.campaignId,zoneId,businessId:zone.businessId,
        scalerId:zone.assignedScalerId,currency:'usd',amountCents:payout.transferAmountCents,baseAmountCents:payout.baseAmountCents,
        bonusAmountCents:payout.bonusAmountCents,earningsVersion:1,status:'transfer_pending',bankPayoutStatus:'not_observed',
        externalExecutionAuthorized:false,createdAt:now(),updatedAt:now()});
      tx.set(walletRef,{ownerId:zone.assignedScalerId,ownerType:'scaler',availableBalance:balance+payout.transferAmountCents/100,
        updatedAt:now(),...(!snapshots[2].exists?{createdAt:now(),pendingBalance:0}:{})},{merge:true});
      const earning={type:'scaler_earnings',walletSide:'scaler',transferOperationId:transferId,campaignId:zone.campaignId,zoneId,
        businessId:zone.businessId,scalerId:zone.assignedScalerId,amount:payout.transferAmountCents/100,amountCents:payout.transferAmountCents,
        currency:'usd',status:'available',description:source==='partial_settlement'?'Accepted partial-work settlement.':'Approved campaign work earning.',createdAt:now()};
      tx.create(nested,earning);tx.create(global,earning);
    }
    tx.update(db.doc('campaignPayments/'+paymentId),{
      reservedWorkerAmountCents:FieldValue.increment(amounts.earnedWorkerCents),
      refundReservedWorkerAmountCents:FieldValue.increment(amounts.unusedWorkerCents),
      platformFeeRecognizedCents:FieldValue.increment(amounts.earnedFeeCents),
      platformFeeRefundReservedCents:FieldValue.increment(amounts.unusedFeeCents),
      platformFeePendingCents:paidFee-Number(payment.platformFeeRecognizedCents||0)-Number(payment.platformFeeRefundedCents||0)-amounts.earnedFeeCents,
      updatedAt:now()});
    if (amounts.businessReturnCents) tx.create(refundRef,{type:'unused_work_reserve_refund',policyVersion:VERSION,status:'queued',
      refundOperationId:refundId,paymentId,zoneId,campaignId:zone.campaignId,businessId:zone.businessId,currency:'usd',
      amountCents:amounts.businessReturnCents,workerRefundCents:amounts.unusedWorkerCents,platformFeeRefundCents:amounts.unusedFeeCents,
      stripePaymentIntentId:payment.stripePaymentIntentId || null,createStarted:false,createdAt:now(),updatedAt:now()});
    return {zoneId,reviewStatus:'approved',payout,settlement,transferOperationId:transferId,earningRecorded:payout.transferAmountCents>0};
  }
  async function reconcile(refundOperationId, {verifyProvider = false} = {}) {
    staging(); const ref=db.doc('financialOperations/'+refundOperationId), initial=await ref.get(), op=initial.data();
    if (!op || op.type!=='unused_work_reserve_refund' || op.policyVersion!==VERSION) fail('Return operation unavailable.');
    if (op.status==='processed' && !verifyProvider) return {status:'refunded',recovered:true};
    if (op.status==='failed_terminal') return {status:'failed_terminal'};
    const paymentRef=db.doc('campaignPayments/'+op.paymentId), payment=(await paymentRef.get()).data();
    if (!payment || payment.stripeMode!=='test' || payment.settlementFrozen===true || payment.campaignId!==op.campaignId ||
      payment.businessId!==op.businessId || payment.stripePaymentIntentId!==op.stripePaymentIntentId) fail('A verified TEST payment is required.');
    const settlement=(await db.doc('campaignSettlements/'+op.zoneId).get()).data();
    if (!settlement || settlement.refundOperationId!==refundOperationId || settlement.paymentId!==op.paymentId ||
        settlement.businessReturnCents!==op.amountCents || settlement.unusedWorkerCents!==op.workerRefundCents ||
        settlement.unusedFeeCents!==op.platformFeeRefundCents || op.amountCents<=0) fail('The immutable return allocation does not reconcile.');
    const provider=stripe();
    const intent=await provider.paymentIntents.retrieve(op.stripePaymentIntentId);
    if (intent.livemode!==false || intent.status!=='succeeded' || intent.currency!=='usd' ||
      intent.amount_received!==payment.businessChargeCents) fail('Provider payment identity or amount does not reconcile.');
    let refund=op.stripeRefundId?await provider.refunds.retrieve(op.stripeRefundId):null;
    if (!refund && op.createStarted) {
      const list=await provider.refunds.list({payment_intent:op.stripePaymentIntentId,limit:100});
      const matches=list.data.filter(x=>x.metadata?.refundOperationId===refundOperationId);
      if (matches.length!==1 || list.has_more) {await ref.update({status:'hold_unknown_outcome',updatedAt:now()});return {status:'hold_unknown_outcome'};}
      refund=matches[0];
    }
    if (!refund) {
      const claimed=await db.runTransaction(async tx=>{const fresh=(await tx.get(ref)).data();if(fresh.createStarted||fresh.status==='processed')return false;
        tx.update(ref,{createStarted:true,status:'processing',createStartedAt:now(),updatedAt:now()});return true;});
      if (!claimed) return {status:'processing'};
      try {refund=await provider.refunds.create({payment_intent:op.stripePaymentIntentId,amount:op.amountCents,
        metadata:{refundOperationId,paymentId:op.paymentId,campaignId:op.campaignId,zoneId:op.zoneId}},
      {idempotencyKey:`scaledcircle:unused-reserve:${refundOperationId}`});}
      catch (_) {await ref.update({status:'hold_unknown_outcome',updatedAt:now()});return {status:'hold_unknown_outcome'};}
    }
    if (!refund.id || refund.livemode===true || refund.payment_intent!==op.stripePaymentIntentId || refund.amount!==op.amountCents || refund.currency!=='usd' ||
        refund.metadata?.refundOperationId!==refundOperationId) fail('Provider refund does not match the reserved return.');
    await db.runTransaction(async tx=>{
      const [fresh,pay]=await Promise.all([tx.get(ref),tx.get(paymentRef)]);
      const wasProcessed=fresh.data().status==='processed';
      if(wasProcessed && !['failed','canceled','requires_action'].includes(refund.status))return;
      if (fresh.data().stripeRefundId && fresh.data().stripeRefundId!==refund.id) fail('Refund identity changed.');
      const p=pay.data(),success=refund.status==='succeeded';
      tx.update(ref,{stripeRefundId:refund.id,providerStatus:refund.status,status:success?'processed':
        ['failed','canceled'].includes(refund.status)?'failed_terminal':'processing',updatedAt:now()});
      if (!success) {
        tx.update(db.doc('campaignSettlements/'+op.zoneId),{returnStatus:['failed','canceled','requires_action'].includes(refund.status)?'refund_attention_required':'refund_pending',providerReturnStatus:refund.status});
        // A bank can reject an initially successful refund. Restore the return
        // obligation once; it never becomes platform revenue or a new create.
        if(wasProcessed) {
          tx.update(paymentRef,{refundReservedWorkerAmountCents:FieldValue.increment(op.workerRefundCents),refundedWorkerAmountCents:FieldValue.increment(-op.workerRefundCents),
            platformFeeRefundReservedCents:FieldValue.increment(op.platformFeeRefundCents),platformFeePendingCents:FieldValue.increment(op.platformFeeRefundCents),
            platformFeeRefundedCents:FieldValue.increment(-op.platformFeeRefundCents),refundedPlatformFeeCents:FieldValue.increment(-op.platformFeeRefundCents),
            refundedTotalCents:FieldValue.increment(-op.amountCents),updatedAt:now()});
          tx.update(ref,{returnReversedAt:now()});
        }
        return;
      }
      if (Number(p.refundReservedWorkerAmountCents||0)<op.workerRefundCents || Number(p.platformFeeRefundReservedCents||0)<op.platformFeeRefundCents ||
        Number(p.refundedTotalCents||0)+op.amountCents>p.businessChargeCents) fail('Return ledger does not reconcile.');
      tx.update(paymentRef,{refundReservedWorkerAmountCents:FieldValue.increment(-op.workerRefundCents),refundedWorkerAmountCents:FieldValue.increment(op.workerRefundCents),
        platformFeeRefundReservedCents:FieldValue.increment(-op.platformFeeRefundCents),platformFeePendingCents:FieldValue.increment(-op.platformFeeRefundCents),
        platformFeeRefundedCents:FieldValue.increment(op.platformFeeRefundCents),refundedPlatformFeeCents:FieldValue.increment(op.platformFeeRefundCents),
        refundedTotalCents:FieldValue.increment(op.amountCents),updatedAt:now()});
      tx.update(db.doc('campaignSettlements/'+op.zoneId),{returnStatus:'refunded',stripeRefundId:refund.id,returnedAt:now()});
    });
    return {status:refund.status==='succeeded'?'refunded':refund.status,refundOperationId};
  }
  async function handleStripeEvent(event) {
    if(project!=='scaledcircle-staging')return false;
    const object=event.data?.object||{};
    if(['refund.created','refund.updated','refund.failed'].includes(event.type)) {
      const id=object.metadata?.refundOperationId;
      if(!/^[A-Za-z0-9_-]{1,160}$/.test(id||''))return false;
      const operation=(await db.doc('financialOperations/'+id).get()).data();
      if(operation?.type!=='unused_work_reserve_refund')return false;
      await reconcile(id,{verifyProvider:true});return true;
    }
    if(event.type!=='charge.refunded'||typeof object.payment_intent!=='string')return false;
    const provider=stripe(),charge=await provider.charges.retrieve(object.id);
    if(charge.livemode!==false||charge.payment_intent!==object.payment_intent)fail('Refunded charge identity changed.');
    const refunds=await provider.refunds.list({payment_intent:object.payment_intent,limit:100});
    if(refunds.has_more||!refunds.data.length)return false;
    let returned=0;const ids=[];
    for(const refund of refunds.data) {
      const id=refund.metadata?.refundOperationId;
      if(!/^[A-Za-z0-9_-]{1,160}$/.test(id||''))return false;
      const operation=(await db.doc('financialOperations/'+id).get()).data();
      if(operation?.type!=='unused_work_reserve_refund'||operation.stripePaymentIntentId!==object.payment_intent||operation.amountCents!==refund.amount)return false;
      if(refund.status==='succeeded')returned+=refund.amount;
      ids.push(id);
    }
    if(returned!==charge.amount_refunded)fail('Provider refunded total needs reconciliation.');
    for(const id of new Set(ids))await reconcile(id,{verifyProvider:true});
    // A recognized reserve return is not campaign cancellation or lost funding.
    return true;
  }
  return {commit,reconcile,handleStripeEvent};
}
module.exports={VERSION,funded,allocation,createService};
