'use strict';
const crypto=require('node:crypto');
const {PLANS}=require('./business_workspace');
function error(code,message){const e=new Error(message);e.code=code;throw e;}
function subscriptionView(subscription,expected,{planForPrice,now=Date.now()}) {
 const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id;
 if(subscription.id!==expected.subscriptionId||customer!==expected.customerId||subscription.metadata?.firebaseUid!==expected.businessId)error('permission-denied','The subscription is not bound to this Business.');
 const item=subscription.items?.data?.[0];
 const plan=planForPrice(item?.price?.id);
 const end=Number(item?.current_period_end||subscription.current_period_end)*1000;
 if(!PLANS[plan]||!Number.isFinite(end)||end<=0)error('failed-precondition','The subscription terms need reconciliation.');
 const active=['active','trialing'].includes(subscription.status)&&end>now;
 return {businessId:expected.businessId,subscriptionId:subscription.id,plan,planName:PLANS[plan].name,price:PLANS[plan].price,
  status:subscription.status,cancelAtPeriodEnd:subscription.cancel_at_period_end===true,periodEndMs:end,paidAccess:active,
  canWithdrawCancellation:active&&subscription.cancel_at_period_end===true,canCancel:active&&subscription.cancel_at_period_end!==true};
}
function createBillingService({db,FieldValue,workspace,stripe,planForPrice,priceForPlan,sync,validateProvider,validatePrice,now=Date.now}) {
 async function context(uid,businessId) {
  await workspace.actor(uid);const a=await workspace.authority({uid,businessId,permission:'billing',allowExpired:true});
  const wallet=(await db.doc(`wallets/${a.businessId}`).get()).data()||{};
  const subscriptionId=a.entitlement.stripeSubscriptionId||wallet.stripeSubscriptionId,customerId=wallet.stripeCustomerId;
  if(!subscriptionId||!customerId)error('failed-precondition','No Stripe membership is linked. Choose a plan to activate membership.');
  return {...a,subscriptionId,customerId};
 }
 async function read(uid,businessId) {const a=await context(uid,businessId);let provider=await stripe().subscriptions.retrieve(a.subscriptionId);if(validateProvider)provider=await validateProvider(provider);return {a,provider,view:subscriptionView(provider,a,{planForPrice,now:now()})};}
 const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const terms=provider=>digest({id:provider.id,status:provider.status,cancel:provider.cancel_at_period_end,items:provider.items.data.map(i=>({id:i.id,price:i.price.id,quantity:i.quantity||1,end:i.current_period_end||provider.current_period_end}))});
 async function finish(ref,a,result,action) {
   await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.status==='succeeded')return;
     const workspaceRef=db.doc(`businessWorkspaces/${a.businessId}`),w=await tx.get(workspaceRef);
     const inv=action==='changePlan'?await workspace.inventory(a.businessId,tx):null;
     tx.update(ref,{status:'succeeded',result,completedAt:FieldValue.serverTimestamp()});
     if(w.data()?.billingOperationId===ref.id)tx.set(workspaceRef,{billingOperationId:FieldValue.delete(),pendingSeatLimit:FieldValue.delete(),revision:FieldValue.increment(1)},{merge:true});
     // Keep selected active members in valid seats after a capacity reduction.
     if(inv)inv.members.sort((x,y)=>x.seatIndex-y.seatIndex).forEach((m,i)=>tx.update(db.doc(`businessWorkspaces/${a.businessId}/members/${m.uid}`),{seatIndex:i+1}));
     tx.create(db.doc(`businessWorkspaces/${a.businessId}/activity/billing_${ref.id}`),{businessId:a.businessId,actorUid:a.actorUid,action:`membership_${action}`,createdAt:FieldValue.serverTimestamp(),subscriptionId:a.subscriptionId});});
 }
 async function reconcile(a,provider,view) {
   const w=(await db.doc(`businessWorkspaces/${a.businessId}`).get()).data()||{};
   if(!w.billingOperationId)return view;
   const ref=db.doc(`businessBillingOperations/${w.billingOperationId}`),op=(await ref.get()).data();
   if(!op||op.subscriptionId!==a.subscriptionId)return {...view,changePending:true};
   const matches=op.action==='cancel'?view.cancelAtPeriodEnd:op.action==='reactivate'?!view.cancelAtPeriodEnd:op.action==='changePlan'?op.plan===view.plan:false;
   if(matches){await sync(provider,`workspace_billing_${ref.id}`);await finish(ref,{...a,actorUid:op.actorUid},view,op.action);return view;}
   return {...view,changePending:true};
 }

 return {
  async get({uid,businessId}) {const r=await read(uid,businessId);return reconcile(r.a,r.provider,r.view);},
  async preview({uid,businessId,plan}) {
   const {a,provider,view}=await read(uid,businessId);
   if(!PLANS[plan]||!priceForPlan(plan)||!view.paidAccess||plan===view.plan||provider.items.data.length!==1||provider.schedule)error('failed-precondition','Choose a different plan for this active membership.');
   if(validatePrice)await validatePrice(priceForPlan(plan));
   const prorationDate=Math.floor(now()/1000),upgrade=PLANS[plan].price>PLANS[view.plan].price;
   const params={items:[{id:provider.items.data[0].id,price:priceForPlan(plan)}],metadata:{...provider.metadata,plan},proration_behavior:upgrade?'always_invoice':'create_prorations',proration_date:prorationDate,payment_behavior:'error_if_incomplete'};
   const invoice=await stripe().invoices.createPreview({customer:a.customerId,subscription:a.subscriptionId,subscription_details:{items:params.items,proration_behavior:params.proration_behavior,proration_date:prorationDate}});
   if(invoice.currency!=='usd'||!Number.isSafeInteger(invoice.amount_due)||!Number.isSafeInteger(invoice.total))error('failed-precondition','The invoice preview needs verification.');
   const ref=db.collection('businessBillingQuotes').doc(),quote={businessId:a.businessId,actorUid:uid,subscriptionId:a.subscriptionId,plan,sourceTerms:terms(provider),params,expiresAtMs:now()+300000,amountDueCents:invoice.amount_due,totalCents:invoice.total,upgrade,createdAt:FieldValue.serverTimestamp()};
   await ref.create(quote);
   return {quoteId:ref.id,plan,planName:PLANS[plan].name,price:PLANS[plan].price,seatLimit:PLANS[plan].seats,amountDueCents:invoice.amount_due,totalCents:invoice.total,upgrade,expiresAtMs:quote.expiresAtMs};
  },
  async change({uid,businessId,action,requestId,plan,quoteId}) {
   if(!['cancel','reactivate','changePlan'].includes(action))error('invalid-argument','Choose a supported membership action.');
   if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))error('invalid-argument','A unique request is required.');
   const {a,provider,view}=await read(uid,businessId);
   if(action==='changePlan' && validatePrice)await validatePrice(priceForPlan(plan));
   await reconcile(a,provider,view);
   const operationId=crypto.createHash('sha256').update(`${a.businessId}:${requestId}`).digest('hex'),ref=db.doc(`businessBillingOperations/${operationId}`);
   const inputDigest=crypto.createHash('sha256').update(JSON.stringify({uid,action,plan:plan||null,quoteId:quoteId||null})).digest('hex');
   let params,duplicate;
   await db.runTransaction(async tx=>{
    await workspace.authority({uid,businessId:a.businessId,permission:'billing',transaction:tx,allowExpired:true});
    const existing=(await tx.get(ref)).data();
    if(existing&&existing.inputDigest!==inputDigest)error('already-exists','This request was already used for another action.');
    if(existing?.status==='succeeded'){duplicate=existing.result;return;}
    if(existing?.status==='processing'||existing?.status==='reconcile_required') {
      const created=existing.createdAt?.toMillis?.(),claimed=existing.claimedAt?.toMillis?.()||created;
      if(!Number.isFinite(created)||now()-created>=23*3600000||now()-claimed<30000||existing.sourceTerms!==terms(provider))error('aborted','The previous request is being reconciled. Refresh membership before retrying.');
      // Explicit retry only, after a provider read. Stripe receives exactly the
      // original parameters and still-live idempotency key, never a new charge.
      params=existing.params;tx.update(ref,{status:'processing',claimedAt:FieldValue.serverTimestamp()});return;
    }
    const workspaceRef=db.doc(`businessWorkspaces/${a.businessId}`),w=await tx.get(workspaceRef);
    if(w.data()?.billingOperationId && w.data().billingOperationId!==operationId)error('aborted','Another membership change is being reconciled. Refresh before retrying.');
    if(action==='cancel'){if(!view.paidAccess)error('failed-precondition','This membership is no longer active.');params={cancel_at_period_end:true};}
    if(action==='reactivate'){if(!view.paidAccess||!view.cancelAtPeriodEnd)error('failed-precondition','Choose a plan to reactivate an ended membership.');params={cancel_at_period_end:false};}
    if(action==='changePlan') {
      if(!PLANS[plan]||!priceForPlan(plan)||!view.paidAccess)error('invalid-argument','Choose an available plan for this active membership.');
      if(typeof quoteId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(quoteId))error('invalid-argument','Review the invoice preview first.');
      const quote=(await tx.get(db.doc(`businessBillingQuotes/${quoteId}`))).data();
      if(!quote||quote.businessId!==a.businessId||quote.actorUid!==uid||quote.plan!==plan||quote.expiresAtMs<=now()||quote.sourceTerms!==terms(provider))error('failed-precondition','The preview expired or terms changed. Review a fresh preview.');
      const {members,invitations}=await workspace.inventory(a.businessId,tx),active=members.filter(m=>m.status==='active');
      const target=PLANS[plan].seats;
      if(active.length+1+invitations.filter(i=>i.status==='pending'&&i.expiresAt?.toMillis()>now()).length>target)error('failed-precondition','Review Team first: choose which members remain and revoke extra invitations before reducing seats. The owner always remains.');
      params=quote.params;
      tx.set(workspaceRef,{pendingSeatLimit:target},{merge:true});
    }
    tx.set(workspaceRef,{billingOperationId:operationId,revision:FieldValue.increment(1)},{merge:true});
    tx.set(ref,{plan:plan||null,params,businessId:a.businessId,actorUid:uid,action,inputDigest,status:'processing',sourceTerms:terms(provider),claimedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),subscriptionId:a.subscriptionId},{merge:true});
   });
   if(duplicate)return {...duplicate,duplicate:true};
   try {
    const updated=await stripe().subscriptions.update(a.subscriptionId,params,{idempotencyKey:`workspace_billing_${operationId}`});
    const result=subscriptionView(updated,a,{planForPrice,now:now()});
    await sync(updated,`workspace_billing_${operationId}`);
    await finish(ref,a,result,action);
    return result;
   }catch(e){
    if(e?.type==='StripeCardError'||(e?.type==='StripeInvalidRequestError'&&Number(e.statusCode)<500)) {
      await db.runTransaction(async tx=>{const wref=db.doc(`businessWorkspaces/${a.businessId}`),w=await tx.get(wref);tx.update(ref,{status:'failed',updatedAt:FieldValue.serverTimestamp()});if(w.data()?.billingOperationId===operationId)tx.update(wref,{billingOperationId:FieldValue.delete(),pendingSeatLimit:FieldValue.delete()});});
      error('failed-precondition','Stripe did not apply the change. Update your payment method if needed, then review a fresh preview.');
    }
    // An unknown provider outcome stays held; it is reconciled read-only using
    // the same operation ID rather than performing a second mutation.
    await ref.set({status:'reconcile_required',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    error('unavailable','Membership change needs verification. Refresh to see the provider-confirmed status.');
   }
  },
 };
}
module.exports={subscriptionView,createBillingService};
