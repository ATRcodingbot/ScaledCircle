'use strict';
const Stripe=require('stripe');
const liability=require('./referral_liability');
const payouts=require('./referral_payouts');
const connect=require('./scaler_cashout_stripe');
// Called only after signature, TEST mode and endpoint-scope verification.
function signedPaidProof(event){
  return event.type==='payout.paid' && event.data?.object?.status==='paid'
    ?{payoutId:event.data.object.id,accountId:event.account,eventId:event.id}:null;
}
function payoutPresentation(dashboard,executionEnabled) {
  if(executionEnabled===true)return {...dashboard,heldCents:0};
  return {...dashboard,heldCents:dashboard.availableCents,availableCents:0,
    history:(dashboard.history||[]).map(row=>({...row,status:row.status==='AVAILABLE'?'HELD':row.status}))};
}
function createRuntime({db,FieldValue,auth,project,environment,key,invoiceKey,planForPrice,executionEnabled=false,now=Date.now}){
  liability.assertRuntime(project);if(environment!=='staging'&&project!=='demo-referral-authority')throw Error('referral_staging_only');
  if(!/^sk_test_/.test(key)||!/^sk_test_/.test(invoiceKey))throw Error('referral_test_credentials_required');
  const stripe=new Stripe(key,{timeout:10000,maxNetworkRetries:0}),invoiceStripe=new Stripe(invoiceKey,{timeout:10000,maxNetworkRetries:0});
  const runtime=()=>({environment:'staging',projectId:'scaledcircle-staging',enabled:true,secretKey:key});
  const provider=connect.createStripeProvider({stripe,runtime});
  const options={db,FieldValue,project,now},ledger=liability.createLedger(options);
  const business=require('./referral_business_reconciliation').createReconciler({...options,stripe:invoiceStripe,planForPrice});
  const scaler=require('./referral_scaler_reconciliation').createReconciler(options);
  const recipient=require('./referral_recipient').createRecipientService({...options,auth,stripe,provider});
  const services=proof=>payouts.createService({...options,provider,runtime,signedPayout:proof});
  async function identity(uid){if(!uid)throw Error('referral_signin_required');return recipient.actor(uid);}
  async function refresh(uid){
    await identity(uid);const rows=await db.collection('referralLiabilities').where('beneficiaryUid','==',uid).limit(401).get();
    if(rows.size>400)throw Error('referral_history_requires_review');
    for(const doc of rows.docs){const e=doc.data();
      if(e.type==='BUSINESS_SUBSCRIPTION_REFERRAL')await business.reconcile(e.sourceId);else await scaler.reconcile(e.sourceId);
    }
    const account=await recipient.current(uid);
    if(executionEnabled && account.ready)for(const doc of rows.docs){const fresh=(await doc.ref.get()).data();
      await ledger.release(doc.id,{providerHealthy:true,authorityDigest:fresh.authorityDigest});}
    return {account,dashboard:await ledger.dashboard(uid)};
  }
  return {
    ledger,business,scaler,recipient,
    async dashboard(uid){const result=await refresh(uid);
      const ops=await db.collection('financialOperations').where('ownerId','==',uid).limit(401).get();
      if(ops.size>400)throw Error('referral_operation_inventory_requires_review');
      return {...payoutPresentation(result.dashboard,executionEnabled),recipientStatus:result.account.status,recipientReady:result.account.ready===true,
        executionEnabled,operations:ops.docs.filter(d=>d.data().kind===payouts.KIND).map(d=>({
          operationId:d.id,status:require('./scaler_cashout').projection(d.data()).status,
          amountCents:d.data().amountCents,payoutFailed:d.data().state==='payout_failed'}))};
    },
    async setup(uid){await identity(uid);return recipient.setup(uid);},
    async request(uid,data){
      if(!executionEnabled)throw Error('referral_test_execution_disabled');
      if(Object.keys(data||{}).some(k=>!['requestId','amountCents'].includes(k)))throw Error('referral_request_invalid');
      const result=await refresh(uid);if(!result.account.ready)throw Error('referral_recipient_not_ready');
      return services().service.request(uid,data,result.account.record);
    },
    async reconcilePayout(uid,data){
      await identity(uid);if(!/^referral_[a-f0-9]{64}$/.test(data?.operationId||'')||
        Object.keys(data).some(k=>!['operationId','retry'].includes(k)))throw Error('referral_operation_invalid');
      if(data.retry===true){if(!executionEnabled)throw Error('referral_test_execution_disabled');await refresh(uid);}
      return services().service.run(data.operationId,uid,{readOnly:data.retry!==true,retryPayout:data.retry===true});
    },
    async payoutWebhook({secret,rawBody,signature,endpointScope}){
      const event=connect.verifyWebhookEvent({stripe,runtime,secret,rawBody,signature,endpointScope});
      if(!['transfer.created','transfer.reversed','payout.created','payout.updated','payout.paid','payout.failed','payout.canceled'].includes(event.type))return {ignored:true};
      const id=event.data?.object?.metadata?.cashoutId;if(!/^referral_[a-f0-9]{64}$/.test(id||''))return {ignored:true};
      const proof=signedPaidProof(event);
      const {store,service}=services(proof),op=await store.lookup(id);
      if((event.type.startsWith('payout.')&&event.account!==op.accountId)||(event.type.startsWith('transfer.')&&event.account))throw Error('referral_webhook_account_mismatch');
      return store.event(event.id,()=>service.run(id,op.ownerId,{readOnly:true}));
    },
    async economicWebhook({secret,rawBody,signature}){
      const event=invoiceStripe.webhooks.constructEvent(rawBody,signature,secret);
      if(event.livemode!==false||event.account)throw Error('referral_webhook_mode_mismatch');
      if(!['invoice.paid','invoice.updated','invoice.voided','credit_note.created','credit_note.updated','credit_note.voided',
        'charge.refunded','refund.updated','charge.dispute.created','charge.dispute.updated','charge.dispute.closed',
        'customer.subscription.updated','customer.subscription.deleted'].includes(event.type))return {ignored:true};
      return business.handleSignedEvent(event);
    },
    async refreshAll(){const users=await db.collection('referralBalances').limit(101).get();if(users.size>100)throw Error('referral_release_inventory_requires_review');
      const results=[];for(const d of users.docs){try{await refresh(d.id);results.push({ok:true});}catch(_){results.push({ok:false});}}return results;},
  };
}
module.exports={createRuntime,signedPaidProof,payoutPresentation};
