'use strict';
const contract=require('./subscription_contract');
const {createSubscriptionSync}=require('./workspace_subscription_sync');
const INVOICE_EVENTS=new Set(['invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.finalization_failed']);
const id=value=>typeof value==='string'?value:value?.id;
function subscriptionId(invoice){return id(invoice.parent?.subscription_details?.subscription || invoice.subscription);}
function handles(event){return event.type?.startsWith('customer.subscription.') || INVOICE_EVENTS.has(event.type) ||
  (event.type?.startsWith('checkout.session.') && (event.data?.object?.mode==='subscription' || event.data?.object?.metadata?.purchaseType==='subscription'));}
function createHandler({db,FieldValue,Timestamp,auth,stripe,environment,planForPrice}) {
 const config={environment,planForPrice},sync=createSubscriptionSync({db,FieldValue,Timestamp,...config});
 return async event=>{
  if(!handles(event))return false;
  contract.assertMode(event,environment);
  let invoice,subId,checkoutSession;
  if(INVOICE_EVENTS.has(event.type)){
   invoice=await stripe.invoices.retrieve(event.data.object.id);contract.assertMode(invoice,environment);subId=subscriptionId(invoice);
   if(!subId)return true; // A non-subscription invoice must not become a campaign payment.
  } else if(event.type.startsWith('checkout.session.')){
   const session=await stripe.checkout.sessions.retrieve(event.data.object.id);contract.assertMode(session,environment);
   checkoutSession=session;
   if(session.mode!=='subscription' || session.metadata?.purchaseType!=='subscription')throw Error('subscription_checkout_binding_mismatch');
   subId=id(session.subscription);if(!subId)return true; // Expired/unpaid Checkout grants nothing.
  } else subId=event.data.object.id;
  let subscription=await stripe.subscriptions.retrieve(subId);
  subscription=await contract.certifySubscription(stripe,subscription,config);
  if(invoice && (id(invoice.customer)!==id(subscription.customer) || subscriptionId(invoice)!==subscription.id))throw Error('subscription_invoice_binding_mismatch');
  await require('./subscription_certification').reconcile({db,FieldValue,stripe,subscription,invoice,session:checkoutSession});
  const result=await sync(subscription,`${event.id}_subscription`);
  if(result.ignored || !invoice || event.type!=='invoice.paid')return true;
  if(invoice.status!=='paid' || invoice.currency!=='usd' || !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid<0 || invoice.amount_remaining!==0)
   throw Error('subscription_invoice_not_paid');
  const tax=(invoice.total_taxes || invoice.total_tax_amounts || []).reduce((n,t)=>n+Number(t.amount||0),0);
  if(!Number.isSafeInteger(tax)||tax<0)throw Error('subscription_invoice_tax_invalid');
  const revenue=Math.max(0,invoice.amount_paid-tax),uid=subscription.metadata.firebaseUid;
  const ref=db.doc(`subscriptionPaymentReceipts/${invoice.id}`),notification=db.doc(`notifications/subscription_revenue_${invoice.id}`),mail=db.doc(`outboundEmailJobs/subscription_revenue_${invoice.id}`);
  const admin=auth?await auth.getUserByEmail('support@scaledcircle.com'):null;
  await db.runTransaction(async tx=>{
   const [seen,e,w]=await Promise.all([tx.get(ref),tx.get(db.doc(`businessSubscriptions/${uid}`)),tx.get(db.doc(`wallets/${uid}`))]);
   if(seen.exists){if(seen.data().subscriptionId!==subscription.id||seen.data().amountCents!==invoice.amount_paid)throw Error('subscription_receipt_conflict');return;}
   if(e.data()?.stripeSubscriptionId!==subscription.id || w.data()?.stripeCustomerId!==id(invoice.customer))throw Error('subscription_receipt_authority_changed');
   const text=`Subscription payment received\nCustomer charge: USD ${(invoice.amount_paid/100).toFixed(2)}\nSubscription revenue: USD ${(revenue/100).toFixed(2)}\nTax collected: USD ${(tax/100).toFixed(2)}\nStripe mode: ${environment==='production'?'LIVE':'TEST'}`;
   tx.create(ref,{invoiceId:invoice.id,subscriptionId:subscription.id,businessId:uid,eventId:event.id,
    amountCents:invoice.amount_paid,revenueCents:revenue,taxCents:tax,currency:'usd',stripeMode:environment==='production'?'live':'test',
    positiveAmountCollected:invoice.amount_paid>0,internalCertification:subscription.metadata?.purpose==='INTERNAL_LIVE_CERTIFICATION',createdAt:FieldValue.serverTimestamp()});
   if(admin){
    tx.create(notification,{userId:admin.uid,type:'admin_subscription_payment_received',title:'Subscription payment received',message:text,read:false,invoiceId:invoice.id,revenueCents:revenue,createdAt:FieldValue.serverTimestamp()});
    tx.create(mail,{to:'support@scaledcircle.com',fromAddress:'support@scaledcircle.com',fromName:'Scaled Circle Support',replyTo:'support@scaledcircle.com',subject:'Subscription payment received',text,
     template:'support_subscription_payment_received',eventType:'subscription.invoice.paid',status:'queued',attempts:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
   }
  });return true;
 };
}
module.exports={INVOICE_EVENTS,subscriptionId,handles,createHandler};
