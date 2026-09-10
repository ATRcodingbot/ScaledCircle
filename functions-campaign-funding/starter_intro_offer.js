'use strict';
// One ordinary Starter introductory purchase path. Rollout is server-only;
// pilot mode permits only the explicitly configured Business owners.
const crypto=require('node:crypto');
const catalog=require('./subscription_contract');
const OFFER='starter_intro_1_dollar_v1';
const CONFIG='subscriptionOffers/'+OFFER;
const CLAIMS='subscriptionIntroClaims';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const id=v=>typeof v==='string'?v:v?.id;
function fail(message,code='failed-precondition'){const e=new Error(message);e.code=code;throw e;}
function need(ok,message='Introductory pricing could not be verified. No payment should be made.'){if(!ok)fail(message);}
function identity(email){let [name,domain]=String(email||'').trim().toLowerCase().split('@');need(name&&domain);if(['gmail.com','googlemail.com'].includes(domain)){domain='gmail.com';name=name.split('+')[0].replaceAll('.','');}return hash(OFFER+':'+name+'@'+domain);}
function permitted(g,uid,now){return g?.enabled===true&&g.offerId===OFFER&&['pilot','public'].includes(g.rollout)&&
 Number.isSafeInteger(g.startsAtMs)&&Number.isSafeInteger(g.endsAtMs)&&g.startsAtMs<=now&&g.endsAtMs>now&&g.endsAtMs-g.startsAtMs<=30*86400000&&
 Number.isSafeInteger(g.maximumBusinesses)&&g.maximumBusinesses>0&&g.maximumBusinesses<=25&&
 (g.rollout==='public'||Array.isArray(g.pilotBusinessIds)&&g.pilotBusinessIds.includes(uid));}
function couponValid(c,q){need(c&&!c.deleted&&c.id===q.couponId&&c.livemode===q.livemode&&c.amount_off===9800&&c.currency==='usd'&&c.duration==='once'&&c.max_redemptions===1&&c.redeem_by===Math.floor(q.expiresAtMs/1000)&&c.metadata?.offerId===OFFER&&c.metadata?.claimId===q.claimId&&c.applies_to?.products?.length===1&&c.applies_to.products[0]===q.productId);}
function sessionValid(s,lines,q,complete=false){need(s.livemode===q.livemode&&s.mode==='subscription'&&id(s.customer)===q.customerId&&s.metadata?.firebaseUid===q.businessId&&s.metadata?.introClaimId===q.claimId&&s.metadata?.offerId===OFFER&&s.currency==='usd'&&s.amount_subtotal===9900&&s.amount_total===100&&s.total_details?.amount_discount===9800&&(s.total_details?.amount_tax||0)===0&&s.total_details?.amount_shipping===0&&s.allow_promotion_codes!==true&&s.payment_method_collection==='always'&&s.discounts?.length===1&&id(s.discounts[0].coupon)===q.couponId&&!s.discounts[0].promotion_code&&!lines.has_more&&lines.data?.length===1&&id(lines.data[0].price)===q.priceId&&lines.data[0].quantity===1&&lines.data[0].amount_subtotal===9900&&lines.data[0].amount_total===100&&(complete?s.status==='complete'&&s.payment_status==='paid':s.status==='open'));}
function createService({db,FieldValue,workspace,legal,stripe,environment,projectId,priceId,ensureCustomer,now=Date.now}){
 const live=environment==='production';
 async function owner(uid,businessId){need(['production','staging','test'].includes(environment)&&(!live||projectId==='scaled-circle'));const actor=await workspace.actor(uid);const a=await workspace.authority({uid,businessId,permission:'billing',allowExpired:true});need(a.isOwner&&uid===a.businessId,'Only the Business owner may use this offer.');await legal.requireCurrent({uid,agreementTypes:['terms','privacy']});return {actor,a};}
 async function gate(uid){const g=(await db.doc(CONFIG).get()).data();need(permitted(g,uid,now())&&g.priceId===priceId&&/^acct_[A-Za-z0-9]+$/.test(g.accountId||''),'This introductory offer is not available for this Business.');return g;}
 async function cleanLocal(uid,tx){const read=r=>tx?tx.get(r):r.get();const [w,e,inv]=await Promise.all([read(db.doc('wallets/'+uid)),read(db.doc('businessSubscriptions/'+uid)),workspace.inventory(uid,tx)]);const v=w.data()||{};need(!e.exists&&!v.stripeSubscriptionId&&!v.subscriptionComped&&!v.pendingSubscriptionCertificationIntentId&&!(v.pendingSubscriptionExpiresMs>now())&&!v.pendingStarterIntroClaimId,'Existing membership or billing activity needs review first.');need(inv.members.length===0&&!inv.invitations.some(i=>i.status==='pending'),'This Starter offer requires an owner-only workspace.');return v;}
 async function providerClean(customerId,uid){const [c,subs,invoices,items]=await Promise.all([stripe.customers.retrieve(customerId),stripe.subscriptions.list({customer:customerId,status:'all',limit:100}),stripe.invoices.list({customer:customerId,limit:100}),stripe.invoiceItems.list({customer:customerId,pending:true,limit:1})]);need(c&&!c.deleted&&c.livemode===live&&c.metadata?.firebaseUid===uid&&c.balance===0&&!c.discount&&!(c.discounts?.length)&&!c.default_source&&!c.invoice_settings?.default_payment_method&&!subs.has_more&&subs.data.length===0&&!invoices.has_more&&invoices.data.length===0&&!items.has_more&&items.data.length===0,'Existing Customer, subscription, credit or invoice history prevents this introductory purchase.');return c;}
 async function readback(q){need(q.checkoutSessionId,'An introductory purchase is already being reconciled. Do not start another.');const [s,lines]=await Promise.all([stripe.checkout.sessions.retrieve(q.checkoutSessionId,{expand:['discounts.coupon']}),stripe.checkout.sessions.listLineItems(q.checkoutSessionId,{limit:100})]);sessionValid(s,lines,q);need(s.expires_at*1000>now(),'This Checkout expired. Contact support; no second offer is created automatically.');return {url:s.url,sessionId:s.id,offerId:OFFER,monthlyCents:9900,discountCents:9800,amountDueCents:100,renewalPreviewAtMs:q.renewalPreviewAtMs,renewalDateBasis:'Stripe invoice preview; the final billing period starts when Checkout is completed.',expiresAtMs:s.expires_at*1000};}
 async function finishCheckout(q,selected){const uid=q.businessId,claimId=q.claimId,attemptId=q.attemptId,ref=db.doc(CLAIMS+'/'+claimId);
    const metadata={firebaseUid:uid,purchaseType:'subscription',offerId:OFFER,introClaimId:claimId,...catalog.selectionMetadata(selected)};
    const s=await stripe.checkout.sessions.create({mode:'subscription',customer:q.customerId,line_items:[{price:priceId,quantity:1}],discounts:[{coupon:q.couponId}],payment_method_collection:'always',payment_method_types:['card'],automatic_tax:{enabled:false},expires_at:q.checkoutExpiresAtSeconds||Math.floor(now()/1000)+31*60,success_url:'https://scaledcircle.com/?billing=success',cancel_url:'https://scaledcircle.com/?billing=cancelled',metadata,subscription_data:{metadata:{...metadata,checkoutRequestId:attemptId}}},{idempotencyKey:'starter_intro_checkout_'+attemptId+(q.checkoutRequestVersion?'_'+q.checkoutRequestVersion:'')});
    q.checkoutSessionId=s.id;await ref.update({checkoutSessionId:s.id});const verified=await readback(q);
    await db.runTransaction(async tx=>{const w=await tx.get(db.doc('wallets/'+uid));need(w.data()?.stripeCustomerId===q.customerId&&!w.data()?.stripeSubscriptionId);tx.update(ref,{status:'prepared',phase:'checkout_ready',checkoutVerifiedAt:FieldValue.serverTimestamp()});tx.set(db.doc('wallets/'+uid),{pendingStarterIntroClaimId:claimId,pendingSubscriptionRequestId:attemptId,pendingSubscriptionPlan:'starter',pendingSubscriptionExpiresMs:q.expiresAtMs},{merge:true});});return verified;
 }
 function recoveryAllowed(q,g){return g?.rollout==='pilot'&&q?.status==='hold'&&!q.checkoutSessionId&&(
  (!q.recoveryStartedAt&&g.resumeCouponExpansionClaims?.includes(q.claimId))||
  (q.recoveryStartedAt&&!q.parameterRecoveryStartedAt&&/^req_[A-Za-z0-9]+$/.test(g.rejectedParameterClaims?.[q.claimId]||'')));
 }
 async function resumeExpandedCoupon(q,selected,g){
  need(recoveryAllowed(q,g)&&q.customerId&&q.renewalPreviewAtMs,'This purchase requires operator reconciliation.');
  need(q.priceId===priceId&&q.livemode===live&&q.expiresAtMs>now()+32*60000);
  const account=await stripe.accounts.retrieve();need(account.id===g.accountId&&account.charges_enabled);
  await catalog.certifyPrice(stripe,priceId,{environment,requireActive:true,planForPrice:p=>p===priceId?'starter':null});
  await providerClean(q.customerId,q.businessId);
  const c=await stripe.coupons.retrieve(q.couponId,{expand:['applies_to']});couponValid(c,q);need(c.valid&&c.times_redeemed===0);
  const sessions=await stripe.checkout.sessions.list({customer:q.customerId,limit:100});need(!sessions.has_more&&sessions.data.length===0,'Existing Checkout requires read-only reconciliation.');
  const ref=db.doc(CLAIMS+'/'+q.claimId);
  await db.runTransaction(async tx=>{const [prior,w,e,cfg]=await Promise.all([tx.get(ref),tx.get(db.doc('wallets/'+q.businessId)),tx.get(db.doc('businessSubscriptions/'+q.businessId)),tx.get(db.doc(CONFIG))]);
   need(recoveryAllowed(prior.data(),cfg.data())&&prior.data()?.attemptId===q.attemptId);
   need(permitted(cfg.data(),q.businessId,now())&&cfg.data().rollout==='pilot');
   need(!e.exists&&w.data()?.stripeCustomerId===q.customerId&&w.data()?.pendingStarterIntroClaimId===q.claimId&&!w.data()?.stripeSubscriptionId&&!w.data()?.subscriptionComped);
   const inv=await workspace.inventory(q.businessId,tx);need(inv.members.length===0&&!inv.invitations.some(i=>i.status==='pending'));
   await workspace.authority({uid:q.businessId,businessId:q.businessId,permission:'billing',allowExpired:true,transaction:tx});
   q.checkoutExpiresAtSeconds=Math.floor(now()/1000)+31*60;
   const recovery=q.recoveryStartedAt?{parameterRecoveryStartedAt:FieldValue.serverTimestamp(),rejectedProviderRequestId:cfg.data().rejectedParameterClaims[q.claimId],checkoutRequestVersion:'discount_only_v1'}:{recoveryReason:'coupon_applies_to_expansion',recoveryStartedAt:FieldValue.serverTimestamp()};
   if(recovery.checkoutRequestVersion)q.checkoutRequestVersion=recovery.checkoutRequestVersion;
   tx.update(ref,{status:'recovering',...recovery,checkoutExpiresAtSeconds:q.checkoutExpiresAtSeconds});
  });
  try{return await finishCheckout(q,selected);}catch(e){await ref.update({status:'hold',phase:'reconciliation_required'});throw e;}
 }
 return {
  async availability({uid,businessId}){await owner(uid,businessId);const g=(await db.doc(CONFIG).get()).data();if(!permitted(g,uid,now()))return {offerId:OFFER,eligible:false};try{const actor=await workspace.actor(uid);const prior=(await db.doc(CLAIMS+'/'+identity(actor.email)).get()).data();if(prior?.businessId===uid&&recoveryAllowed(prior,g))return {offerId:OFFER,eligible:true,monthlyCents:9900,amountDueCents:100,discountCents:9800,endsAtMs:g.endsAtMs};await cleanLocal(uid);if((await db.doc(CLAIMS+'/'+identity(actor.email)).get()).exists)return {offerId:OFFER,eligible:false};return {offerId:OFFER,eligible:true,monthlyCents:9900,amountDueCents:100,discountCents:9800,endsAtMs:g.endsAtMs};}catch(e){if(e.code==='failed-precondition')return {offerId:OFFER,eligible:false};throw e;}},
  async checkout({uid,businessId,selection,data={}}){require('./subscription_certification').rejectClientDiscounts(data);need(data.offerId===OFFER);const selected=catalog.selectionTerms(selection);need(selected.plan==='starter'&&!selected.bundle&&selected.addons.length===0&&selected.items.length===1,'This offer applies only to Starter without add-ons.');const {actor}=await owner(uid,businessId);await gate(uid);const claimId=identity(actor.email),ref=db.doc(CLAIMS+'/'+claimId);const previous=(await ref.get()).data();if(previous){need(previous.businessId===uid,'This introductory offer has already been used.');const g=await gate(uid);if(recoveryAllowed(previous,g))return resumeExpandedCoupon(previous,selected,g);return readback(previous);}
   need(Object.keys(data).every(k=>['offerId','plan','selection','businessId'].includes(k)),'Only the selected offer and plan may be supplied.');
   const localWallet=await cleanLocal(uid);const {price,terms}=await catalog.certifyPrice(stripe,priceId,{environment,requireActive:true,planForPrice:p=>p===priceId?'starter':null});need(price.unit_amount===9900);const g=await gate(uid);
   const account=await stripe.accounts.retrieve();need(account.id===g.accountId&&account.charges_enabled===true&&account.default_currency==='usd'&&account.capabilities?.card_payments==='active');
   const matches=await stripe.customers.list({email:actor.email,limit:100});need(!matches.has_more&&matches.data.every(c=>c.id===localWallet.stripeCustomerId&&c.metadata?.firebaseUid===uid),'Existing Customer history needs reconciliation before creating another Customer.');
   // Reserve before Customer/coupon/Checkout creation. An ambiguous provider
   // outcome stays held; automatic retries never create another object.
   const attemptId=crypto.randomUUID();let q;
   await db.runTransaction(async tx=>{
    const [seen,cfg]=await Promise.all([tx.get(ref),tx.get(db.doc(CONFIG))]);
    need(!seen.exists,'This introductory purchase is already being prepared.');
    const current=cfg.data();
    need(permitted(current,uid,now())&&current.accountId===g.accountId&&current.priceId===priceId&&Number.isSafeInteger(current.reservedBusinesses||0)&&(current.reservedBusinesses||0)<current.maximumBusinesses,'The introductory offer limit has been reached.');
    await cleanLocal(uid,tx);
    await workspace.authority({uid,businessId:uid,permission:'billing',allowExpired:true,transaction:tx});
    q={offerId:OFFER,claimId,businessId:uid,ownerUid:uid,environment,livemode:live,priceId,productId:terms.productId,quantity:1,monthlyCents:9900,discountCents:9800,amountDueCents:100,attemptId,status:'reserved',phase:'customer_binding',createdAtMs:now(),expiresAtMs:Math.min(now()+7200000,current.endsAtMs),couponId:'starter_intro_'+claimId.slice(0,40)};
    need(q.expiresAtMs-now()>3600000,'The offer window is ending.');
    tx.create(ref,{...q,createdAt:FieldValue.serverTimestamp()});
    tx.update(db.doc(CONFIG),{reservedBusinesses:FieldValue.increment(1)});
    tx.set(db.doc('wallets/'+uid),{ownerId:uid,pendingStarterIntroClaimId:claimId,pendingSubscriptionRequestId:attemptId,pendingSubscriptionPlan:'starter',pendingSubscriptionExpiresMs:q.expiresAtMs},{merge:true});
   });
   try{
    q.customerId=await ensureCustomer(uid);await ref.update({customerId:q.customerId,phase:'customer_verified'});const bound=(await db.doc('wallets/'+uid).get()).data();need(bound?.stripeCustomerId===q.customerId);await providerClean(q.customerId,uid);
    // Stripe computes the calendar month. Do not invent a 30-day renewal or
    // use a future billing anchor (which would defer the initial payment).
    const preview=await stripe.invoices.createPreview({customer:q.customerId,subscription_details:{items:[{price:priceId,quantity:1}]}});need(preview.currency==='usd'&&preview.amount_due===9900&&preview.total===9900&&!preview.lines.has_more&&preview.lines.data.length===1&&Number.isInteger(preview.lines.data[0].period?.end));q.renewalPreviewAtMs=preview.lines.data[0].period.end*1000;await ref.update({renewalPreviewAtMs:q.renewalPreviewAtMs,phase:'coupon_creating'});
    const coupon=await stripe.coupons.create({id:q.couponId,name:'Starter first month for $1',amount_off:9800,currency:'usd',duration:'once',max_redemptions:1,redeem_by:Math.floor(q.expiresAtMs/1000),applies_to:{products:[q.productId]},metadata:{offerId:OFFER,claimId},expand:['applies_to']}, {idempotencyKey:'starter_intro_coupon_'+attemptId});couponValid(coupon,q);need(coupon.valid&&coupon.times_redeemed===0);await ref.update({phase:'checkout_creating'});
    return await finishCheckout(q,selected);
   }catch(e){await ref.update({status:'hold',phase:'reconciliation_required',heldAt:FieldValue.serverTimestamp()});fail('This introductory purchase needs reconciliation. Do not create another Checkout.','unavailable');}
  },
 };
}
async function reconcile({db,FieldValue,stripe,subscription,invoice}){
 if(subscription.metadata?.offerId!==OFFER)return false;const claimId=subscription.metadata.introClaimId;need(/^[a-f0-9]{64}$/.test(claimId||''));const ref=db.doc(CLAIMS+'/'+claimId),q=(await ref.get()).data();need(q&&q.customerId===id(subscription.customer)&&q.businessId===subscription.metadata.firebaseUid&&q.attemptId===subscription.metadata.checkoutRequestId&&q.livemode===subscription.livemode);
 if(q.status==='consumed'){need(q.subscriptionId===subscription.id);return true;}
 need(q.checkoutSessionId);const [s,lines,c]=await Promise.all([stripe.checkout.sessions.retrieve(q.checkoutSessionId,{expand:['discounts.coupon']}),stripe.checkout.sessions.listLineItems(q.checkoutSessionId,{limit:100}),stripe.coupons.retrieve(q.couponId,{expand:['applies_to']})]);sessionValid(s,lines,q,true);couponValid(c,q);need(c.times_redeemed===1&&id(s.subscription)===subscription.id&&subscription.items.data.length===1&&subscription.items.data[0].price.id===q.priceId&&subscription.items.data[0].quantity===1);
 const initial=invoice?.billing_reason==='subscription_create'?invoice:await stripe.invoices.retrieve(id(subscription.latest_invoice));need(initial.billing_reason==='subscription_create'&&initial.status==='paid'&&initial.currency==='usd'&&initial.subtotal===9900&&initial.total===100&&initial.amount_paid===100&&initial.amount_remaining===0&&initial.total_discount_amounts?.reduce((n,d)=>n+d.amount,0)===9800&&id(initial.customer)===q.customerId);
 await db.runTransaction(async tx=>{const prior=await tx.get(ref);need(prior.data()?.attemptId===q.attemptId);if(prior.data().status==='consumed'){need(prior.data().subscriptionId===subscription.id);return;}tx.update(ref,{status:'consumed',subscriptionId:subscription.id,invoiceId:initial.id,amountCollectedCents:100,consumedAt:FieldValue.serverTimestamp()});});return true;
}
module.exports={OFFER,CONFIG,CLAIMS,identity,permitted,couponValid,sessionValid,createService,reconcile};
