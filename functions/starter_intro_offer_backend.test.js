'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),offer=require('./starter_intro_offer');
const {createWorkspaceService}=require('./business_workspace');
const {createLegalConsentService}=require('./legal_consent');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,updateDoc}=require('firebase/firestore');
let app,db,auth,rules,n=0;
before(async()=>{for(const k of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[k]||'',/^(localhost|127\.0\.0\.1):\d+$/);app=admin.initializeApp({projectId:'demo-starter-intro'},'starter-intro');db=app.firestore();auth=app.auth();rules=await initializeTestEnvironment({projectId:'demo-starter-intro',firestore:{rules:require('node:fs').readFileSync('../firestore.production.rules','utf8')}});});
after(async()=>{await rules?.cleanup();await db?.terminate();await app?.delete();});
async function fixture(){
 const uid='intro_owner_'+(++n),email=uid+'@example.test',now=Date.now(),customerId='cus_intro'+n;
 await auth.createUser({uid,email,emailVerified:true});await db.doc('users/'+uid).set({role:'business',active:true,betaAccess:'approved'});
 for(const type of ['terms','privacy'])await db.doc(`legalConsents/${uid}_${type}_${type}-2026-08-v1`).set({uid,agreementType:type,agreementVersion:type+'-2026-08-v1',acceptedAt:admin.firestore.Timestamp.now()});
 const price={id:'price_introstarter',active:true,livemode:true,currency:'usd',unit_amount:9900,product:'scaledcircle_workspace_production_v1',metadata:{plan:'starter',purpose:'workspace_membership_production_v1'},recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 const gate={offerId:offer.OFFER,enabled:true,rollout:'pilot',pilotBusinessIds:[uid],accountId:'acct_intro',priceId:price.id,startsAtMs:now-1000,endsAtMs:now+86400000,maximumBusinesses:25,reservedBusinesses:0};await db.doc(offer.CONFIG).set(gate);
 let customer,coupon,session,params,invoice,subscription,badTotal=false,loseCheckout=false,loseCustomer=false,customerCreates=0,couponCreates=0,checkoutCreates=0,priorSubs=[],priorCustomers=[];
 const lines=()=>({has_more:false,data:[{price,quantity:1,amount_subtotal:9900,amount_total:badTotal?9900:100}]});
 const stripe={accounts:{retrieve:async()=>({id:'acct_intro',charges_enabled:true,default_currency:'usd',capabilities:{card_payments:'active'}})},
  prices:{retrieve:async()=>price},products:{retrieve:async()=>({id:price.product,livemode:true,active:true,metadata:{purpose:'workspace_membership_production_v1'}})},
  customers:{list:async()=>({data:priorCustomers,has_more:false}),retrieve:async()=>customer},subscriptions:{list:async()=>({data:priorSubs,has_more:false})},invoiceItems:{list:async()=>({data:[],has_more:false})},
  invoices:{list:async()=>({data:[],has_more:false}),createPreview:async()=>({currency:'usd',amount_due:9900,total:9900,lines:{has_more:false,data:[{period:{end:Math.floor(now/1000)+2678400}}]}}),retrieve:async()=>invoice},
  coupons:{create:async(p,o)=>{couponCreates++;assert.ok(o.idempotencyKey);assert.deepEqual(p.expand,['applies_to']);coupon={...p,livemode:true,valid:true,times_redeemed:0};return coupon;},retrieve:async(id,p)=>{assert.deepEqual(p.expand,['applies_to']);return coupon;}},
  checkout:{sessions:{create:async(p,o)=>{checkoutCreates++;assert.ok(o.idempotencyKey);assert.equal(p.allow_promotion_codes,undefined);params=p;session={...p,id:'cs_live_intro'+n,livemode:true,currency:'usd',amount_subtotal:9900,amount_total:badTotal?9900:100,total_details:{amount_discount:9800,amount_tax:0,amount_shipping:0},status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/local_test'};if(loseCheckout)throw Error('unknown');return session;},retrieve:async()=>session,listLineItems:async()=>lines()}}};
 const deps={db,auth,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp};
 const service=offer.createService({...deps,workspace:createWorkspaceService({...deps,now:()=>now}),legal:createLegalConsentService(deps),stripe,environment:'production',projectId:'scaled-circle',priceId:price.id,now:()=>now,ensureCustomer:async()=>{customerCreates++;customer={id:customerId,livemode:true,metadata:{firebaseUid:uid},balance:0,invoice_settings:{}};if(loseCustomer)throw Error('unknown');await db.doc('wallets/'+uid).set({ownerId:uid,stripeCustomerId:customerId},{merge:true});return customerId;}});
 const input={uid,businessId:uid,selection:{plan:'starter'},data:{offerId:offer.OFFER,plan:'starter'}};
 return {uid,email,gate,service,input,stripe,price,now,get effects(){return {customerCreates,couponCreates,checkoutCreates};},get params(){return params;},get session(){return session;},get coupon(){return coupon;},get subscription(){return subscription;},get invoice(){return invoice;},bad(){badTotal=true;},lose(){loseCheckout=true;},loseCustomer(){loseCustomer=true;},priorCustomer(){priorCustomers=[{id:'cus_old',metadata:{firebaseUid:'old_owner'}}];},priorSub(){priorSubs=[{id:'sub_old',status:'canceled'}];},async claim(){return (await db.doc(offer.CLAIMS+'/'+offer.identity(email)).get()).data();},complete(){coupon.times_redeemed=1;coupon.valid=false;session.status='complete';session.payment_status='paid';session.subscription='sub_intro'+n;subscription={id:session.subscription,livemode:true,customer:customerId,metadata:params.subscription_data.metadata,status:'active',latest_invoice:'in_intro'+n,items:{data:[{price,quantity:1,current_period_end:Math.floor(now/1000)+2678400}]}};invoice={id:subscription.latest_invoice,billing_reason:'subscription_create',status:'paid',currency:'usd',customer:customerId,subtotal:9900,total:100,amount_paid:100,amount_remaining:0,total_discount_amounts:[{amount:9800}]};}};
}
test('pilot eligibility, exact $1 Checkout, $99 recurring Price and durable read-only repeat',async()=>{const f=await fixture();assert.equal((await f.service.availability(f.input)).eligible,true);const r=await f.service.checkout(f.input);assert.equal(r.amountDueCents,100);assert.equal(r.monthlyCents,9900);assert.equal(r.discountCents,9800);assert.ok(r.renewalPreviewAtMs>f.now);assert.equal(f.coupon.amount_off,9800);assert.equal(f.coupon.duration,'once');assert.equal(f.params.allow_promotion_codes,undefined);assert.equal(f.params.payment_method_collection,'always');assert.equal(f.params.subscription_data.billing_cycle_anchor,undefined);assert.deepEqual(await f.service.checkout(f.input),r);assert.deepEqual(f.effects,{customerCreates:1,couponCreates:1,checkoutCreates:1});assert.equal((await db.doc('businessSubscriptions/'+f.uid).get()).exists,false);});
test('pilot is not public and disabled/expired/capped windows fail closed',async()=>{for(const change of [{enabled:false},{pilotBusinessIds:[]},{endsAtMs:0},{maximumBusinesses:1,reservedBusinesses:1}]){const f=await fixture();await db.doc(offer.CONFIG).update(change);await assert.rejects(f.service.checkout(f.input));assert.deepEqual(f.effects,{customerCreates:0,couponCreates:0,checkoutCreates:0});}});
test('wrong roles, delegation, missing consent and existing comped plan denied',async()=>{for(const kind of ['scaler','disabled','consent','comped','delegate']){const f=await fixture();if(kind==='scaler')await db.doc('users/'+f.uid).update({role:'scaler'});if(kind==='disabled')await auth.updateUser(f.uid,{disabled:true});if(kind==='consent')await db.doc(`legalConsents/${f.uid}_privacy_privacy-2026-08-v1`).delete();if(kind==='comped')await db.doc('businessSubscriptions/'+f.uid).set({comped:true,plan:'managed_growth'});if(kind==='delegate')f.input.businessId='unrelated';await assert.rejects(f.service.checkout(f.input));assert.equal(f.effects.customerCreates,0);}});
test('other plans/add-ons/bundle and arbitrary discounts/price rejected',async()=>{for(const selection of [{plan:'growth'},{plan:'scale'},{plan:'managed_growth'},{plan:'starter',addons:['business_assistant']},{plan:'starter',addons:['lead_generation_research']},{bundle:'growth_department'}]){const f=await fixture();await assert.rejects(f.service.checkout({...f.input,selection}));assert.equal(f.effects.customerCreates,0);}for(const field of ['coupon','discounts','quantity','priceId']){const f=await fixture();await assert.rejects(f.service.checkout({...f.input,data:{...f.input.data,[field]:'malicious'}}));assert.equal(f.effects.customerCreates,0);}});
test('previous Customer or any subscription history cannot be recycled',async()=>{const a=await fixture();a.priorCustomer();await assert.rejects(a.service.checkout(a.input));assert.equal(a.effects.customerCreates,0);const b=await fixture();b.priorSub();await assert.rejects(b.service.checkout(b.input));assert.equal(b.effects.checkoutCreates,0);assert.equal((await b.claim()).status,'hold');});
test('same identity and offer cap protected against concurrent attempts',async()=>{const f=await fixture();const r=await Promise.allSettled([f.service.checkout(f.input),f.service.checkout(f.input)]);assert.ok(r.some(x=>x.status==='fulfilled'));assert.equal(f.effects.checkoutCreates,1);assert.equal((await db.doc(offer.CONFIG).get()).data().reservedBusinesses,1);assert.equal(offer.identity('First.Last+one@gmail.com'),offer.identity('firstlast@googlemail.com'));});
test('two eligible owners cannot race beyond the remaining offer capacity',async()=>{const a=await fixture(),b=await fixture();await db.doc(offer.CONFIG).update({pilotBusinessIds:[a.uid,b.uid],maximumBusinesses:1});const results=await Promise.allSettled([a.service.checkout(a.input),b.service.checkout(b.input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.effects.checkoutCreates+b.effects.checkoutCreates,1);assert.equal((await db.doc(offer.CONFIG).get()).data().reservedBusinesses,1);});
test('uncertain Customer, uncertain Checkout and wrong amount remain held without duplicate create',async()=>{for(const kind of ['loseCustomer','lose','bad']){const f=await fixture();f[kind]();await assert.rejects(f.service.checkout(f.input));const before={...f.effects};await assert.rejects(f.service.checkout(f.input)).catch(e=>{if(kind!=='lose')throw e;});assert.deepEqual(f.effects,before);assert.equal((await f.claim()).status,'hold');}});
test('paid first invoice consumes promotion once; $0/$99 invoices cannot grant intro entitlement',async()=>{const f=await fixture();await f.service.checkout(f.input);f.complete();f.invoice.amount_paid=0;await assert.rejects(offer.reconcile({db,FieldValue:admin.firestore.FieldValue,stripe:f.stripe,subscription:f.subscription,invoice:f.invoice}));f.invoice.amount_paid=100;const call=()=>offer.reconcile({db,FieldValue:admin.firestore.FieldValue,stripe:f.stripe,subscription:f.subscription,invoice:f.invoice});await call();const first=await f.claim();await call();assert.deepEqual(await f.claim(),first);assert.equal(first.status,'consumed');assert.equal(first.amountCollectedCents,100);assert.equal((await db.collection('walletTransactions').get()).size,0);});
test('clients cannot read/create/update gate or claim, including approved owner',async()=>{const f=await fixture();await f.service.checkout(f.input);for(const ctx of [rules.unauthenticatedContext(),rules.authenticatedContext(f.uid,{email_verified:true})]){for(const p of [offer.CONFIG,offer.CLAIMS+'/'+offer.identity(f.email)]){const r=doc(ctx.firestore(),p);await assertFails(getDoc(r));await assertFails(setDoc(r,{enabled:true}));await assertFails(updateDoc(r,{status:'unused'}));}}});
test('signed positive invoice creates one $1 receipt, one notification and Starter seat authority',async()=>{
 const f=await fixture();await f.service.checkout(f.input);f.complete();
 f.invoice.livemode=true;f.invoice.parent={subscription_details:{subscription:f.subscription.id}};
 f.stripe.subscriptions.retrieve=async()=>f.subscription;
 const handler=require('./workspace_subscription_events').createHandler({db,FieldValue:admin.firestore.FieldValue,Timestamp:admin.firestore.Timestamp,auth:{getUserByEmail:async()=>({uid:'test_intro_admin'}),getUser:async()=>({email:'owner@example.com',emailVerified:true,disabled:false})},stripe:f.stripe,environment:'production',planForPrice:p=>p===f.price.id?'starter':null});
 const Stripe=require('stripe'),secret='local_emulator_signing_fixture';
 const payload=JSON.stringify({id:'evt_intro_paid_'+f.uid,created:1788948284,type:'invoice.paid',livemode:true,data:{object:{id:f.invoice.id}}});
 const header=Stripe.webhooks.generateTestHeaderString({payload,secret});
 const event=Stripe.webhooks.constructEvent(payload,header,secret);
 await handler(event);await handler(event);
 const entitlement=(await db.doc('businessSubscriptions/'+f.uid).get()).data();
 assert.equal(entitlement.plan,'starter');assert.equal(entitlement.seatLimit,1);assert.equal(entitlement.monthlyCents,9900);
 const receipts=await db.collection('subscriptionPaymentReceipts').where('businessId','==',f.uid).get();assert.equal(receipts.size,1);assert.equal(receipts.docs[0].data().amountCents,100);assert.equal(receipts.docs[0].data().revenueCents,100);assert.equal(receipts.docs[0].data().positiveAmountCollected,true);
 assert.equal((await db.collection('notifications').where('invoiceId','==',f.invoice.id).get()).size,1);
 assert.equal((await f.claim()).status,'consumed');
 assert.equal((await db.doc('wallets/'+f.uid).get()).data().balance,undefined);
});

 test('operator-scoped coupon expansion recovery reuses Customer/coupon and creates only one Checkout',async()=>{
 const f=await fixture(),create=f.stripe.coupons.create;
 f.stripe.coupons.create=async(...args)=>{const c=await create(...args);const response={...c};delete response.applies_to;return response;};
 f.stripe.checkout.sessions.list=async()=>({has_more:false,data:[]});
 await assert.rejects(f.service.checkout(f.input));assert.deepEqual(f.effects,{customerCreates:1,couponCreates:1,checkoutCreates:0});
 await assert.rejects(f.service.checkout(f.input));
 const q=await f.claim();await db.doc(offer.CONFIG).update({resumeCouponExpansionClaims:[q.claimId]});
 assert.equal((await f.service.availability(f.input)).eligible,true);
 const r=await Promise.allSettled([f.service.checkout(f.input),f.service.checkout(f.input)]);assert.ok(r.some(x=>x.status==='fulfilled'));
 assert.deepEqual(f.effects,{customerCreates:1,couponCreates:1,checkoutCreates:1});assert.equal((await f.claim()).recoveryReason,'coupon_applies_to_expansion');
 assert.equal((await f.service.checkout(f.input)).amountDueCents,100);assert.equal(f.effects.checkoutCreates,1);
 });
 test('coupon recovery denies an existing Checkout and never creates a second one',async()=>{
 const f=await fixture(),create=f.stripe.coupons.create;f.stripe.coupons.create=async(...args)=>{const c=await create(...args);return {...c,applies_to:undefined};};
 await assert.rejects(f.service.checkout(f.input));const q=await f.claim();await db.doc(offer.CONFIG).update({resumeCouponExpansionClaims:[q.claimId]});
 f.stripe.checkout.sessions.list=async()=>({has_more:false,data:[{id:'cs_existing'}]});await assert.rejects(f.service.checkout(f.input));assert.equal(f.effects.checkoutCreates,0);
 });

test('verified rejected-parameter recovery has a separate exactly-once lease and reuses the contract',async()=>{
 const f=await fixture(),couponCreate=f.stripe.coupons.create;
 f.stripe.coupons.create=async(...args)=>{const c=await couponCreate(...args);return {...c,applies_to:undefined};};
 await assert.rejects(f.service.checkout(f.input));const q=await f.claim();
 await db.doc(offer.CLAIMS+'/'+q.claimId).update({recoveryStartedAt:admin.firestore.Timestamp.now()});
 f.stripe.checkout.sessions.list=async()=>({has_more:false,data:[]});
 await assert.rejects(f.service.checkout(f.input));
 await db.doc(offer.CONFIG).update({rejectedParameterClaims:{[q.claimId]:'req_reviewed'}});
 const original=f.stripe.checkout.sessions.create;f.stripe.checkout.sessions.create=async(p,o)=>{assert.equal(o.idempotencyKey,'starter_intro_checkout_'+q.attemptId+'_discount_only_v1');return original(p,o);};
 const results=await Promise.allSettled([f.service.checkout(f.input),f.service.checkout(f.input)]);
 assert.ok(results.some(x=>x.status==='fulfilled'));assert.deepEqual(f.effects,{customerCreates:1,couponCreates:1,checkoutCreates:1});
 const after=await f.claim();assert.ok(after.recoveryStartedAt);assert.ok(after.parameterRecoveryStartedAt);assert.equal(after.rejectedProviderRequestId,'req_reviewed');assert.equal(after.attemptId,q.attemptId);
 assert.equal((await f.service.checkout(f.input)).amountDueCents,100);assert.equal(f.effects.checkoutCreates,1);
});
