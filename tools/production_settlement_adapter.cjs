'use strict';
const {once}=require('./production_policy_patches.cjs');
function moduleSource(name,input){
 if(!['campaign_reserve_settlement.js','paused_work.js'].includes(name))return input;
 let s=input.replaceAll('\r','');
 if(name==='campaign_reserve_settlement.js'){
  s=once(s,"  function staging() { if (project !== 'scaledcircle-staging') fail('This settlement release is staging only.'); }",
   "  const authority=require('./production_work_settlement_policy');\n  function staging() { authority.environment(project); }");
  s=once(s,'    else staging();\n    if (!funded(payment)',
   '    else staging();\n    authority.contract(zoneId,zone,contract);\n    if(!payment.fundingAllocation)authority.payment(payment,contract);\n    if (!payment.fundingAllocation && !funded(payment)');
  s=once(s,'    if (workerUsed + amounts.maximumWorkerCents > paidWorker || feeUsed + amounts.maximumFeeCents > paidFee)',
    '    if (!payment.fundingAllocation && (workerUsed + amounts.maximumWorkerCents > paidWorker || feeUsed + amounts.maximumFeeCents > paidFee))');
  s=once(s,'    tx.create(settlementRef,settlement);',`    if(payment.fundingAllocation) {
      const funds=require('./campaign_fund_allocation');
      const next=funds.earn(paymentId,payment,contract,payout.transferAmountCents);
      funds.persist(tx,db.doc('campaignPayments/'+paymentId),payment.fundingAllocation,next,'work_earned',now());
      if(!funded(payment))settlement.returnStatus='funding_review_required';
    }
    tx.create(settlementRef,settlement);`);
  s=once(s,"type:'unused_work_reserve_refund',policyVersion:VERSION,status:'queued',",
    "type:'unused_work_reserve_refund',policyVersion:VERSION,status:funded(payment)?'queued':'hold_source_unusable',");
  s=once(s,"        if(wasProcessed) {",`        if(wasProcessed) {
          if(p.fundingAllocation) {
            const funds=require('./campaign_fund_allocation');
            const next=funds.refund(op.paymentId,p,{operationId:refundOperationId,workerCents:op.workerRefundCents,feeCents:op.platformFeeRefundCents,reversed:true});
            funds.persist(tx,paymentRef,p.fundingAllocation,next,'unused_return_reversed',now());
          }`);
  s=once(s,"      tx.update(db.doc('campaignSettlements/'+op.zoneId),{returnStatus:'refunded',",`      if(p.fundingAllocation) {
        const funds=require('./campaign_fund_allocation');
        const next=funds.refund(op.paymentId,p,{operationId:refundOperationId,workerCents:op.workerRefundCents,feeCents:op.platformFeeRefundCents});
        funds.persist(tx,paymentRef,p.fundingAllocation,next,'unused_return_reconciled',now());
      }
      tx.update(db.doc('campaignSettlements/'+op.zoneId),{returnStatus:'refunded',`);
  s=once(s,"      const claimed=await db.runTransaction(async tx=>",
    `      if(payment.fundingAllocation) {
        const [balance,all]=await Promise.all([provider.balance.retrieve(),db.collection('campaignPayments').limit(501).get()]);
        if(all.size>500)fail('campaign_allocation_inventory_review_required');
        require('./campaign_fund_protection').assertRefundCapacity({paymentId:op.paymentId,amountCents:op.amountCents,balance,
          workerReleaseCents:op.workerRefundCents,feeReleaseCents:op.platformFeeRefundCents,records:all.docs.map(d=>({id:d.id,data:d.data()}))});
      }
      const claimed=await db.runTransaction(async tx=>`);
  s=s.replaceAll("!== 'test'","!== 'live'").replaceAll("!=='test'","!=='live'")
   .replaceAll("(productionAuthority ? 'live' : 'test')","'live'")
   .replaceAll('Verified staging TEST funding','Verified production funding').replaceAll('verified TEST payment','verified production payment')
   .replaceAll('intent.livemode!==false','intent.livemode!==true').replaceAll('charge.livemode!==false','charge.livemode!==true')
   .replaceAll('refund.livemode===true','refund.livemode!==true');
  s=once(s,"    if(project!=='scaledcircle-staging')return false;","    authority.environment(project);");
  s=once(s,'    const provider=stripe();',`    const zone=(await db.doc('campaignZones/'+op.zoneId).get()).data();
    const accepted=(await db.doc('assignmentCompensations/'+op.zoneId).get()).data();
    authority.contract(op.zoneId,zone||{},accepted); authority.payment(payment,accepted);
    if(!op.createStarted&&!op.stripeRefundId&&!authority.createsEnabled())return {status:'held_pending_activation'};
    const provider=stripe();`);
 } else if(name==='paused_work.js'){
  s=once(s," function staging(){if(project!=='scaledcircle-staging')fail('failed-precondition','This work-pause release is staging only.');}",
   " const authority=require('./production_work_settlement_policy');\n function staging(){authority.environment(project);}");
  s=once(s,'  return {zone:z,campaign,contract};','  authority.contract(zoneId,z,contract);\n  return {zone:z,campaign,contract};');
 }
 return s;
}
function exportsSource(input){
 let s=input;
 s=once(s,"    if ((process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT)!=='scaledcircle-staging')\n      throw new HttpsError('failed-precondition','This work-pause release is staging only.');",
  "    require('./production_work_settlement_policy').environment(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT);");
 s=s.replaceAll("if((process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT)!=='scaledcircle-staging')return;",
  "require('./production_work_settlement_policy').environment(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT);");
 return s;
}
module.exports={moduleSource,exportsSource};
