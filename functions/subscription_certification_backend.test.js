'use strict';
// All provider responses are local fixtures; all persistence is emulator-only.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const cert = require('./subscription_certification');
const {createWorkspaceService, seats} = require('./business_workspace');
const {createLegalConsentService} = require('./legal_consent');
const {createHandler} = require('./workspace_subscription_events');
const {createBillingService} = require('./workspace_billing');
const {createSubscriptionSync} = require('./workspace_subscription_sync');
let app, db, auth, count = 0;
before(() => {
  for (const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/);
  app = admin.initializeApp({projectId:'demo-founder-certification'}, 'founder-certification'); db = app.firestore(); auth = app.auth();
});
after(async () => { await db.terminate(); await app.delete(); });
async function fixture() {
  const n=++count, uid='cert_owner_'+n, intentId='local_certification_intent_'+n, customerId='cus_local'+n;
  const now=Date.now(), runtime={enabled:true,environment:'production',projectId:'scaled-circle',sourceSha:'a'.repeat(40),packageSeal:'b'.repeat(64)};
  await auth.createUser({uid,email:uid+'@example.test',emailVerified:true});
  await db.doc('users/'+uid).set({role:'business',active:true,email:uid+'@example.test'});
  for(const [type,version] of [['terms','terms-2026-08-v1'],['privacy','privacy-2026-08-v1']]) await db.doc(`legalConsents/${uid}_${type}_${version}`).set({uid,agreementType:type,agreementVersion:version,acceptedAt:admin.firestore.Timestamp.now()});
  await db.doc('wallets/'+uid).set({stripeCustomerId:customerId,balance:123});
  await db.doc('campaigns/'+uid).set({businessId:uid,status:'open',fundingStatus:'funded'});
  await db.doc('assignmentCompensations/'+uid).set({immutable:true,baseAmountCents:1500});
  const intent={version:cert.VERSION,purpose:cert.PURPOSE,environment:'production',ownerUid:uid,businessId:uid,customerId,accountId:'acct_local',
    priceId:'price_localstarter',quantity:1,plan:'starter',currency:'usd',subtotalCents:9900,totalDueCents:0,sourceSha:runtime.sourceSha,packageSeal:runtime.packageSeal,createdAtMs:now-1000,expiresAtMs:now+3600000,status:'unused'};
  const ref=db.doc(`${cert.COLLECTION}/${intentId}`), gate=db.doc(cert.CONFIG);
  await ref.set(intent); await gate.set({enabled:true,version:cert.VERSION,activeIntentId:intentId,sourceSha:runtime.sourceSha,packageSeal:runtime.packageSeal,starterPriceId:intent.priceId,accountId:intent.accountId});
  const price={id:intent.priceId,active:true,livemode:true,currency:'usd',unit_amount:9900,product:'scaledcircle_workspace_production_v1',metadata:{plan:'starter',purpose:'workspace_membership_production_v1'},recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  let coupon, session, subscription, invoice, params, creates=0, checkoutCreates=0, updates=0, loseCoupon=false, loseCheckout=false, wrongTotal=false, cards=[];
  const customer={id:customerId,livemode:true,metadata:{firebaseUid:uid},balance:0,invoice_settings:{}};
  const lines=()=>({has_more:false,data:[{price,quantity:1,amount_subtotal:9900,amount_total:wrongTotal?9900:0}]});
  const stripe={accounts:{retrieve:async()=>({id:'acct_local'})},customers:{retrieve:async()=>customer},
    paymentMethods:{list:async()=>({data:cards,has_more:false})},invoiceItems:{list:async()=>({data:[],has_more:false})},
    prices:{retrieve:async()=>price},products:{retrieve:async()=>({id:price.product,active:true,livemode:true,metadata:{purpose:'workspace_membership_production_v1'}})},
    coupons:{create:async(p,o)=>{assert.ok(o.idempotencyKey);creates++;coupon={...p,livemode:true,valid:true,times_redeemed:0};if(loseCoupon)throw Error('unknown_coupon_outcome');return coupon;},retrieve:async()=>coupon},
    invoices:{list:async()=>({data:[],has_more:false}),retrieve:async()=>invoice},
    subscriptions:{list:async()=>({data:[],has_more:false}),retrieve:async()=>subscription,update:async(id,p)=>{assert.equal(id,subscription.id);updates++;subscription={...subscription,...p};return subscription;}},
    checkout:{sessions:{create:async(p,o)=>{checkoutCreates++;params=p;assert.ok(o.idempotencyKey);session={...p,id:'cs_live_local'+n,livemode:true,status:'open',currency:'usd',amount_subtotal:9900,amount_total:wrongTotal?9900:0,total_details:{amount_discount:wrongTotal?0:9900},url:'https://checkout.stripe.com/c/pay/local_fixture',payment_status:'unpaid'};if(loseCheckout)throw Error('unknown_checkout_outcome');return session;},retrieve:async()=>session,listLineItems:async()=>lines()}}};
  const workspace=createWorkspaceService({db,auth,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp,now:()=>now});
  const service=cert.createService({db,FieldValue:admin.firestore.FieldValue,workspace,legal:createLegalConsentService({db,FieldValue:admin.firestore.FieldValue}),stripe,runtime,priceId:price.id,now:()=>now});
  const input={uid,businessId:uid,intentId,selection:{plan:'starter'}};
  const config={environment:'production',planForPrice:id=>id===price.id?'starter':null};
  const handler=createHandler({db,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp,auth:{getUserByEmail:async()=>({uid:'cert_admin'})},stripe,...config});
  async function signed(type) {
    const event={id:'evt_local_'+n+'_'+type,type,livemode:true,data:{object:type.startsWith('invoice')?{id:invoice.id}:{...session}}};
    const secret='emulator_signature_fixture',payload=JSON.stringify(event),header=Stripe.webhooks.generateTestHeaderString({payload,secret});
    return handler(Stripe.webhooks.constructEvent(payload,header,secret));
  }
  return {uid,intentId,intent,input,service,runtime,ref,gate,stripe,workspace,price,customer,
    get coupon(){return coupon;},get session(){return session;},get invoice(){return invoice;},get params(){return params;},
    get effects(){return {coupons:creates,checkouts:checkoutCreates,subscriptionUpdates:updates};},
    loseCoupon(){loseCoupon=true;},loseCheckout(){loseCheckout=true;},wrongTotal(){wrongTotal=true;},savedCard(){cards=[{id:'pm_existing'}];},
    complete(){session={...session,status:'complete',payment_status:'no_payment_required',subscription:'sub_local'+n};coupon={...coupon,times_redeemed:1,valid:false};
      subscription={id:session.subscription,livemode:true,status:'active',customer:customerId,metadata:params.subscription_data.metadata,cancel_at_period_end:false,items:{data:[{id:'si_local',price,quantity:1,current_period_end:Math.floor(now/1000)+2592000}]}};
      invoice={id:'in_local'+n,livemode:true,customer:customerId,parent:{subscription_details:{subscription:subscription.id}},status:'paid',currency:'usd',billing_reason:'subscription_create',subtotal:9900,total:0,amount_paid:0,amount_due:0,amount_remaining:0,total_discount_amounts:[{amount:9900}]};},signed,
    billing(){return createBillingService({db,FieldValue:admin.firestore.FieldValue,workspace,stripe:()=>stripe,planForPrice:config.planForPrice,priceForPlan:()=>price.id,sync:createSubscriptionSync({db,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp,...config})});},
    async unchanged(){assert.equal((await db.doc('wallets/'+uid).get()).data().balance,123);assert.equal((await db.doc('campaigns/'+uid).get()).data().fundingStatus,'funded');assert.equal((await db.doc('assignmentCompensations/'+uid).get()).data().baseAmountCents,1500);},
  };
}
test('exact owner/Starter: one reserved coupon and Checkout, server-only discount and $0 readback',async()=>{
  const f=await fixture(),r=await f.service.checkout(f.input); assert.equal(r.amountDueCents,0);assert.equal(r.monthlyCents,9900);
  assert.equal(f.params.allow_promotion_codes,false);assert.equal(f.params.payment_method_collection,'if_required');assert.equal(f.params.line_items.length,1);
  assert.equal(f.coupon.percent_off,100);assert.equal(f.coupon.duration,'once');assert.equal(f.coupon.max_redemptions,1);assert.equal(f.coupon.applies_to.products[0],'scaledcircle_workspace_production_v1');
  await f.service.checkout(f.input);assert.deepEqual(f.effects,{coupons:1,checkouts:1,subscriptionUpdates:0});await f.unchanged();
});
test('concurrent calls cannot produce another coupon or Checkout',async()=>{
  const f=await fixture(),results=await Promise.allSettled(Array.from({length:6},()=>f.service.checkout(f.input)));
  assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.effects.coupons,1);assert.equal(f.effects.checkouts,1);await f.unchanged();
});
for(const selection of [{plan:'growth'},{plan:'scale'},{plan:'managed_growth'},{bundle:'growth_department'},{plan:'starter',addons:['business_assistant']}])
  test('shared Product cannot discount selection '+JSON.stringify(selection),async()=>{const f=await fixture();await assert.rejects(f.service.checkout({...f.input,selection}));assert.equal(f.effects.coupons,0);});
for(const field of ['coupon','couponId','discount','discounts','promotionCode','promotion_code','quantity','allow_promotion_codes'])
  test('reject client-supplied '+field,async()=>{const f=await fixture();await assert.rejects(f.service.checkout({...f.input,data:{[field]:'untrusted'}}),{code:'invalid-argument'});assert.equal(f.effects.coupons,0);});
for(const change of [{enabled:false},{environment:'staging'},{projectId:'wrong-project'},{sourceSha:'c'.repeat(40)},{packageSeal:'d'.repeat(64)}])
  test('runtime fails closed '+Object.keys(change)[0],async()=>{const f=await fixture();Object.assign(f.runtime,change);await assert.rejects(f.service.checkout(f.input));assert.equal(f.effects.coupons,0);});
for(const change of [{ownerUid:'another-owner'},{businessId:'another-workspace'},{priceId:'price_other'},{expiresAtMs:1},{quantity:2},{customerId:'cus_other'},{accountId:'acct_other'}])
  test('private binding fails closed '+Object.keys(change)[0],async()=>{const f=await fixture();await f.ref.update(change);await assert.rejects(f.service.checkout(f.input));assert.equal(f.effects.coupons,0);});
test('non-owner and missing consent are denied',async()=>{const f=await fixture();await assert.rejects(f.service.checkout({...f.input,uid:'unrelated'}));await db.doc(`legalConsents/${f.uid}_privacy_privacy-2026-08-v1`).delete();await assert.rejects(f.service.checkout(f.input));assert.equal(f.effects.coupons,0);});
test('owner-only seat and saved payment-method safeguards',async()=>{const f=await fixture();await db.doc(`businessWorkspaces/${f.uid}/members/member`).set({status:'active',uid:'member'});await assert.rejects(f.service.checkout(f.input));assert.equal(f.effects.coupons,0);const g=await fixture();g.savedCard();await assert.rejects(g.service.checkout(g.input));assert.equal(g.effects.coupons,0);});
test('lost coupon response remains HOLD, never blind creates on repeated calls',async()=>{const f=await fixture();f.loseCoupon();await assert.rejects(f.service.checkout(f.input),{code:'unavailable'});await assert.rejects(f.service.checkout(f.input));assert.equal(f.effects.coupons,1);assert.equal(f.effects.checkouts,0);assert.equal((await f.ref.get()).data().status,'hold');});
test('lost Checkout response recovers known ID from signed provider event, no second create',async()=>{const f=await fixture();f.loseCheckout();await assert.rejects(f.service.checkout(f.input));await assert.rejects(f.service.checkout(f.input));f.complete();await f.signed('checkout.session.completed');assert.equal((await f.ref.get()).data().checkoutSessionId,f.session.id);assert.equal((await f.ref.get()).data().status,'consumed');assert.equal(f.effects.checkouts,1);});
test('unexpected nonzero Checkout is held and no link returned',async()=>{const f=await fixture();f.wrongTotal();await assert.rejects(f.service.checkout(f.input),{code:'unavailable'});assert.equal((await f.ref.get()).data().status,'hold');assert.equal((await db.doc('businessSubscriptions/'+f.uid).get()).exists,false);await f.unchanged();});
test('real handler: signed $0 invoice, full Starter/one seat, one $0 receipt, exhausted discount, cancel/reactivate/re-cancel',async()=>{
  const f=await fixture();await f.service.checkout(f.input);f.complete();await f.signed('checkout.session.completed');await Promise.all([f.signed('invoice.paid'),f.signed('invoice.paid')]);
  const ent=(await db.doc('businessSubscriptions/'+f.uid).get()).data(),receipt=(await db.doc('subscriptionPaymentReceipts/'+f.invoice.id).get()).data();
  assert.equal(ent.plan,'starter');assert.equal(ent.monthlyCents,9900);assert.equal(seats(ent),1);assert.equal(receipt.amountCents,0);assert.equal(receipt.revenueCents,0);assert.equal(receipt.positiveAmountCollected,false);assert.equal(receipt.internalCertification,true);
  assert.equal((await db.collection('subscriptionPaymentReceipts').where('businessId','==',f.uid).get()).size,1);
  assert.equal((await f.gate.get()).data().enabled,false);assert.equal((await f.ref.get()).data().couponExhausted,true);
  await assert.rejects(f.service.checkout(f.input));assert.equal(f.effects.coupons,1);assert.equal(f.effects.checkouts,1);
  const billing=f.billing();for(const [action,requestId]of [['cancel','cert_cancel_first_123456'],['reactivate','cert_reactivate_1234567'],['cancel','cert_cancel_final_123456']])await billing.change({uid:f.uid,businessId:f.uid,action,requestId});
  assert.equal((await billing.get({uid:f.uid})).cancelAtPeriodEnd,true);assert.equal(f.effects.subscriptionUpdates,3);await f.unchanged();
});
test('wrong certification invoice discount cannot grant entitlement',async()=>{const f=await fixture();await f.service.checkout(f.input);f.complete();f.invoice.total_discount_amounts[0].amount=9800;await assert.rejects(f.signed('invoice.paid'));assert.equal((await db.doc('businessSubscriptions/'+f.uid).get()).exists,false);assert.equal((await db.doc('subscriptionPaymentReceipts/'+f.invoice.id).get()).exists,false);});
test('provider coupon not exhausted cannot consume intent',async()=>{const f=await fixture();await f.service.checkout(f.input);f.complete();f.coupon.valid=true;await assert.rejects(f.signed('checkout.session.completed'));assert.equal((await f.ref.get()).data().status,'reserved');});
