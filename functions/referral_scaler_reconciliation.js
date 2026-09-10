'use strict';
const {createLedger,hash,assertRuntime}=require('./referral_liability');
const {qualify}=require('./scaler_referral_rewards');
function createReconciler(options){
  const {db,project}=options;assertRuntime(project);const ledger=createLedger(options);
  return {async reconcile(zoneId){
    if(!/^[A-Za-z0-9_-]{1,160}$/.test(zoneId||''))throw Error('referral_zone_invalid');
    const docs=[];const read=async path=>{const d=await db.doc(path).get();docs.push(d);return d.data();};
    const settlement=await read('campaignSettlements/'+zoneId);if(!settlement?.scalerId)return {status:'not_qualified'};
    const attribution=await read('scalerReferralAttributions/'+settlement.scalerId);if(!attribution?.affiliateUid)return {status:'not_referred'};
    const [zone,payment,contract,affiliate,transfer,earning,refund]=await Promise.all([
      read('campaignZones/'+zoneId),read('campaignPayments/'+settlement.paymentId),read('assignmentCompensations/'+zoneId),
      read('scalerAffiliateProfiles/'+attribution.affiliateUid),
      read('scalerTransfers/'+require('./marketplace_finance').operationId('scaler-transfer',zoneId,1)),
      read('walletTransactions/earning_'+zoneId+'_v1'),
      settlement.refundOperationId?read('financialOperations/'+settlement.refundOperationId):null,
    ]);
    const result=qualify({zoneId,settlement,zone,payment,contract,affiliate,transfer,attribution,refund,mode:'test'});
    const sourceId=zoneId,type='SCALER_COMPLETED_WORK_REFERRAL';
    const prior=(await db.doc('referralLiabilities/'+hash('ReferralLiabilityV1',type,sourceId)).get()).data();
    const posted=earning?.status==='available' && earning.scalerId===settlement.scalerId &&
      earning.zoneId===zoneId && earning.amountCents===settlement.earnedWorkerCents;
    if(!prior && (!result.qualifies||!posted))return {status:'not_qualified',reason:result.reason||'worker_earning_not_settled'};
    const basis=result.qualifies&&posted?settlement.earnedWorkerCents:0;
    const sourceNotificationId='referral_earned_'+require('node:crypto').createHash('sha256').update('ScalerReferralOnePercentV1:'+zoneId).digest('hex');
    const notice=await read('notifications/'+sourceNotificationId);
    const e={type,sourceId,...(notice?{sourceNotificationId}:{}),beneficiaryUid:attribution.affiliateUid,referredId:settlement.scalerId,
      relationshipId:settlement.scalerId,grossBasisCents:prior?.grossBasisCents??settlement.earnedWorkerCents,
      currentBasisCents:basis,paidAtMillis:prior?.paidAtMillis??settlement.createdAt.toMillis(),
      reason:result.reason,authorityDigest:hash(zoneId,basis,docs.map(d=>[d.ref.path,d.updateTime?.toMillis()||null]))};
    return ledger.reconcile(e,{expectedDocuments:docs});
  }};
}
module.exports={createReconciler};
