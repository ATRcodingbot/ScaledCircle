'use strict';
const {hash,cents,createLedger,assertRuntime}=require('./referral_liability');
const contract=require('./subscription_contract');
const id=v=>typeof v==='string'?v:v?.id;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const ratio=(amount,numerator,denominator)=>denominator?Number((BigInt(cents(amount))*BigInt(cents(numerator))+BigInt(denominator)/2n)/BigInt(denominator)):0;
function retainedBasis({invoice,subscription,payments,refunds,creditNotes,disputes,certifiedPriceIds}) {
  for(const o of [invoice,subscription,...payments,...refunds,...creditNotes,...disputes])
    if(o.livemode!==false)fail('referral_provider_mode_mismatch');
  const subId=id(invoice.parent?.subscription_details?.subscription||invoice.subscription);
  if(!subId||subId!==subscription.id||id(invoice.customer)!==id(subscription.customer)||invoice.currency!=='usd' ||
    invoice.status!=='paid'||invoice.amount_remaining!==0||!invoice.status_transitions?.paid_at ||
    !['subscription_create','subscription_cycle'].includes(invoice.billing_reason))fail('referral_invoice_not_qualifying');
  if(subscription.canceled_at && invoice.created>subscription.canceled_at)fail('referral_invoice_after_cancellation');
  if(!invoice.lines?.data?.length||invoice.lines.has_more)fail('referral_invoice_lines_incomplete');
  // Only certified recurring ScaledCircle lines participate. Mixed invoices are
  // held for allocation review; pass-through items never become commissions.
  if(invoice.lines.data.some(l=>!certifiedPriceIds.includes(id(l.pricing?.price_details?.price||l.price)) ||
    l.parent?.subscription_item_details?.proration===true || l.proration===true || l.amount<0))
    fail('referral_invoice_allocation_review');
  if(invoice.amount_shipping || invoice.amount_paid_off_stripe || invoice.amount_overpaid || invoice.starting_balance>0)
    fail('referral_invoice_allocation_review');
  const collected=payments.reduce((n,p)=>{
    if(p.status!=='paid'||id(p.invoice)!==invoice.id||!p.chargeVerified)fail('referral_collection_unverified');
    return n+cents(p.amount_paid);
  },0);
  if(collected!==cents(invoice.amount_paid))fail('referral_collection_unverified');
  const tax=(invoice.total_taxes||invoice.total_tax_amounts||[]).reduce((n,t)=>n+cents(t.amount),0);
  const grossBasisCents=Math.max(0,Math.min(cents(invoice.total_excluding_tax),collected-tax));
  let reduction=0;const linked=new Map();
  for(const note of creditNotes){
    if(id(note.invoice)!==invoice.id)fail('referral_credit_binding_mismatch');
    if(note.status==='void'||note.type==='pre_payment')continue;
    if(note.status!=='issued'||note.type!=='post_payment'||note.pre_payment_amount>0)fail('referral_credit_requires_review');
    const noteTax=(note.total_taxes||note.tax_amounts||[]).reduce((n,t)=>n+cents(t.amount),0);
    reduction+=Math.min(grossBasisCents,Math.max(0,cents(note.amount)-noteTax));
    if(note.refund && !note.refunds?.length)fail('referral_credit_refund_allocation_required');
    for(const part of note.refunds||[]){
      const ref=id(part.refund);if(!ref || part.payment_record_refund)fail('referral_credit_refund_ambiguous');
      linked.set(ref,(linked.get(ref)||0)+cents(part.amount_refunded));
    }
  }
  if(creditNotes.filter(n=>n.status==='issued'&&n.type==='post_payment').reduce((n,c)=>n+cents(c.amount),0)!==cents(invoice.post_payment_credit_notes_amount||0))
    fail('referral_credit_inventory_incomplete');
  for(const r of refunds){
    if(['failed','canceled'].includes(r.status))continue;
    if(r.status!=='succeeded')fail('referral_refund_pending');
    const linkedAmount=linked.get(r.id)||0;if(linkedAmount>cents(r.amount))fail('referral_credit_refund_ambiguous');
    reduction+=ratio(r.amount-linkedAmount,grossBasisCents,collected);
  }
  const disputed=disputes.some(d=>!['won','warning_closed'].includes(d.status));
  return {grossBasisCents,currentBasisCents:disputed?0:Math.max(0,grossBasisCents-reduction),
    paidAtMillis:invoice.status_transitions.paid_at*1000,reason:disputed?'economic_dispute':reduction?'economic_adjustment':null};
}
async function all(list,params){
  const rows=[];let after;
  do{const page=await list({...params,limit:100,...(after?{starting_after:after}:{})});
    if(!Array.isArray(page.data))fail('referral_provider_inventory_invalid');rows.push(...page.data);
    if(rows.length>400)fail('referral_provider_inventory_requires_review');
    if(!page.has_more)return rows;if(!page.data.length)fail('referral_provider_pagination_invalid');after=page.data.at(-1).id;
  }while(true);
}
function createReconciler({db,FieldValue,project,stripe,planForPrice,now=Date.now}){
  assertRuntime(project);const ledger=createLedger({db,FieldValue,project,now});
  async function reconcile(invoiceId){
    if(!/^in_[A-Za-z0-9]+$/.test(invoiceId||''))fail('referral_invoice_id_invalid');
    const claimRef=db.doc('referralEconomicClaims/'+hash('invoice',invoiceId)),token=hash(invoiceId,now(),Math.random());
    await db.runTransaction(async tx=>{const c=await tx.get(claimRef);if(c.data()?.until>now())fail('referral_reconciliation_busy');tx.set(claimRef,{token,until:now()+120000});});
    try{
      const receipt=(await db.doc('referralInvoiceSignatures/'+invoiceId).get()).data();
      if(!receipt?.eventId||receipt.mode!=='test')fail('referral_signed_invoice_required');
      const invoice=await stripe.invoices.retrieve(invoiceId);
      const subscription=await stripe.subscriptions.retrieve(id(invoice.parent?.subscription_details?.subscription||invoice.subscription));
      const businessId=subscription.metadata?.firebaseUid;
      if(!businessId)fail('referral_workspace_binding_missing');
      const [a,u,w,f]=await Promise.all(['businessReferralAttributions/'+businessId,'users/'+businessId,
        'wallets/'+businessId,'businessWorkspaces/'+businessId].map(p=>db.doc(p).get()));
      const attribution=a.data();if(!attribution)return {status:'not_referred'};
      if(attribution.businessUid!==businessId||u.data()?.role!=='business'||u.data()?.signupPurpose==='team_invitation'||
        (u.data()?.activeBusinessId&&u.data().activeBusinessId!==businessId)||
        (f.exists&&f.data().ownerId!==businessId)||w.data()?.stripeCustomerId!==id(subscription.customer)||
        !attribution.attributedAt?.toMillis || attribution.attributedAt.toMillis()>invoice.created*1000)
        fail('referral_workspace_binding_invalid');
      const affiliate=(await db.doc('scalerAffiliateProfiles/'+attribution.affiliateUid).get()).data();
      const certifiedPriceIds=[];
      for(const line of invoice.lines?.data||[]){const priceId=id(line.pricing?.price_details?.price||line.price);
        await contract.certifyPrice(stripe,priceId,{environment:'staging',planForPrice});certifiedPriceIds.push(priceId);}
      const invoicePayments=await all(p=>stripe.invoicePayments.list(p),{invoice:invoiceId});
      const payments=[],refunds=[],disputes=[];
      for(const payment of invoicePayments.filter(p=>p.status==='paid')){
        contract.assertMode(payment,'staging');
        const piId=id(payment.payment?.payment_intent);if(!piId)fail('referral_payment_type_requires_review');
        const pi=await stripe.paymentIntents.retrieve(piId);contract.assertMode(pi,'staging');
        if(pi.status!=='succeeded'||id(pi.customer)!==id(invoice.customer)||pi.amount_received!==payment.amount_paid||pi.currency!=='usd')fail('referral_collection_unverified');
        const charge=await stripe.charges.retrieve(id(pi.latest_charge));contract.assertMode(charge,'staging');
        if(!charge.paid||!charge.captured||id(charge.payment_intent)!==piId||id(charge.customer)!==id(invoice.customer))fail('referral_charge_unverified');
        payments.push({...payment,chargeVerified:true});
        refunds.push(...await all(p=>stripe.refunds.list(p),{payment_intent:piId}));
        disputes.push(...await all(p=>stripe.disputes.list(p),{payment_intent:piId}));
      }
      const creditNotes=await all(p=>stripe.creditNotes.list(p),{invoice:invoiceId});
      const economics=retainedBasis({invoice,subscription,payments,refunds,creditNotes,disputes,certifiedPriceIds});
      if(affiliate?.status!=='active')economics.currentBasisCents=0;
      const e={...economics,type:'BUSINESS_SUBSCRIPTION_REFERRAL',beneficiaryUid:attribution.affiliateUid,
        referredId:businessId,relationshipId:a.id,sourceId:invoiceId,providerSubscriptionId:subscription.id,
        authorityDigest:hash(invoiceId,economics,refunds.map(r=>[r.id,r.status,r.amount]),creditNotes.map(c=>[c.id,c.status,c.amount]),disputes.map(d=>[d.id,d.status]),affiliate?.status)};
      return await ledger.reconcile(e,{claimRef,claimToken:token});
    }finally{await db.runTransaction(async tx=>{if((await tx.get(claimRef)).data()?.token===token)tx.update(claimRef,{until:0});});}
  }
  async function handleSignedEvent(event){
    contract.assertMode(event,'staging');if(!/^evt_/.test(event.id||''))fail('referral_signed_event_required');
    const object=event.data?.object;if(event.type==='invoice.paid'){
      const ref=db.doc('referralInvoiceSignatures/'+object.id);
      await db.runTransaction(async tx=>{if(!(await tx.get(ref)).exists)tx.create(ref,{eventId:event.id,mode:'test',createdAt:FieldValue.serverTimestamp()});});
      return reconcile(object.id);
    }
    if(event.type.startsWith('invoice.')||event.type.startsWith('credit_note.')){
      const invoiceId=event.type.startsWith('invoice.')?object.id:id(object.invoice);
      if(invoiceId && (await db.doc('referralInvoiceSignatures/'+invoiceId).get()).exists)return reconcile(invoiceId);
      return {ignored:true};
    }
    // Refund/dispute/subscription events trigger a bounded inventory of known
    // referred invoices; every calculation rereads current provider resources.
    const signatures=await db.collection('referralInvoiceSignatures').limit(401).get();
    if(signatures.size>400)fail('referral_invoice_inventory_requires_review');
    const results=[];for(const doc of signatures.docs)results.push(await reconcile(doc.id));return results;
  }
  return {reconcile,handleSignedEvent};
}
module.exports={retainedBasis,all,createReconciler};
