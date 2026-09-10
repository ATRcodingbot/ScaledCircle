'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {initializeApp}=require('firebase-admin/app'),{getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-subscription-finance'},'subscription-finance'),db=getFirestore(app);
const {createHandler}=require('./workspace_subscription_events'),{PLANS}=require('./subscription_contract'),{seats}=require('./business_workspace');
let n=0;
async function fixture(plan='growth'){
 const uid='subscription-user-'+(++n),purpose='workspace_membership_staging_v1',price={id:'price_'+plan.replace('_',''),active:true,livemode:false,currency:'usd',unit_amount:PLANS[plan].cents,product:'scaledcircle_workspace_staging_v1',metadata:{plan,purpose},recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 let subscription={id:'sub_'+n,livemode:false,customer:'cus_'+n,metadata:{firebaseUid:uid,plan},status:'active',cancel_at_period_end:false,items:{data:[{id:'si_'+n,quantity:1,price,current_period_end:Math.floor(Date.now()/1000)+86400}]}},invoice={id:'in_'+n,livemode:false,parent:{subscription_details:{subscription:subscription.id}},customer:subscription.customer,currency:'usd',status:'paid',amount_paid:PLANS[plan].cents,amount_remaining:0,total_taxes:[]};
 await db.doc('users/'+uid).set({role:'business',active:true});await db.doc('wallets/'+uid).set({stripeCustomerId:subscription.customer,balance:42});
 await db.doc('campaigns/'+uid).set({businessId:uid,status:'open',fundingStatus:'funded'});await db.doc('assignmentCompensations/'+uid).set({immutable:true,baseAmountCents:1500});
 const stripe={prices:{retrieve:async()=>price},products:{retrieve:async()=>({id:price.product,livemode:false,active:true,metadata:{purpose}})},
  subscriptions:{retrieve:async()=>subscription},invoices:{retrieve:async()=>invoice},checkout:{sessions:{retrieve:async()=>({id:'cs_'+n,livemode:false,mode:'subscription',metadata:{purchaseType:'subscription'},subscription:subscription.id})}}};
 const handler=createHandler({db,FieldValue,Timestamp,auth:{getUserByEmail:async()=>({uid:'support'}),getUser:async()=>({email:'owner@example.com',emailVerified:true,disabled:false})},stripe,environment:'staging',planForPrice:id=>id===price.id?plan:null});
 let seq=0;const event=(type,id)=>({id:id||`evt_${uid}_${++seq}`,created:1788948284+seq,type,livemode:false,data:{object:type.startsWith('invoice')?{id:invoice.id}:type.startsWith('checkout')?{id:'cs_'+n,mode:'subscription',metadata:{purchaseType:'subscription'}}:{id:subscription.id}}});
 return {uid,price,handler,event,get subscription(){return subscription;},get invoice(){return invoice;},get stripe(){return stripe;},changePlan(next){plan=next;price.id='price_'+next.replace('_','');price.unit_amount=PLANS[next].cents;price.metadata.plan=next;subscription.metadata.plan=next;},renew(){invoice={...invoice,id:invoice.id+'r',billing_reason:'subscription_cycle'};subscription.items.data[0].current_period_end+=86400;}};
}
for(const plan of Object.keys(PLANS))test(`${plan}: signed creation, invoice and renewal reconcile exact price/seats with zero Wallet mutations`,async()=>{
 const f=await fixture(plan);f.subscription.status='incomplete';await f.handler(f.event('customer.subscription.created'));
 assert.equal(seats((await db.doc('businessSubscriptions/'+f.uid).get()).data()),1);
 f.subscription.status='active';await f.handler(f.event('checkout.session.completed'));assert.equal((await db.collection('subscriptionPaymentReceipts').where('businessId','==',f.uid).get()).size,0);
 const e=f.event('invoice.paid');await Promise.all([f.handler(e),f.handler(e)]);await f.handler(f.event('invoice.paid'));
 assert.equal((await db.collection('subscriptionPaymentReceipts').where('businessId','==',f.uid).get()).size,1);
 assert.equal((await db.doc('subscriptionPaymentReceipts/'+f.invoice.id).get()).data().revenueCents,PLANS[plan].cents);
 let record=(await db.doc('businessSubscriptions/'+f.uid).get()).data();assert.equal(record.plan,plan);assert.equal(seats(record),PLANS[plan].seats);
 const expires=record.expiresAt.toMillis();f.renew();await f.handler(f.event('invoice.paid'));record=(await db.doc('businessSubscriptions/'+f.uid).get()).data();assert.ok(record.expiresAt.toMillis()>expires);
 assert.equal((await db.collection('subscriptionPaymentReceipts').where('businessId','==',f.uid).get()).size,2);
 assert.equal((await db.doc('wallets/'+f.uid).get()).data().balance,42);assert.equal((await db.doc('campaigns/'+f.uid).get()).data().fundingStatus,'funded');assert.equal((await db.doc('assignmentCompensations/'+f.uid).get()).data().baseAmountCents,1500);
});
test('failed renewal removes paid entitlement; later success, cancel at period end, withdrawal and deletion follow current provider state',async()=>{
 const f=await fixture();await f.handler(f.event('invoice.paid'));f.subscription.status='past_due';f.invoice.status='open';await f.handler(f.event('invoice.payment_failed'));
 let e=(await db.doc('businessSubscriptions/'+f.uid).get()).data();assert.equal(e.status,'past_due');assert.equal(seats(e),1);
 f.subscription.status='active';f.invoice.status='paid';await f.handler(f.event('invoice.paid'));
 f.subscription.cancel_at_period_end=true;await f.handler(f.event('customer.subscription.updated'));e=(await db.doc('businessSubscriptions/'+f.uid).get()).data();assert.equal(e.status,'active');assert.equal(e.cancelAtPeriodEnd,true);assert.equal(seats(e),3);
 f.subscription.cancel_at_period_end=false;await f.handler(f.event('customer.subscription.updated'));assert.equal((await db.doc('businessSubscriptions/'+f.uid).get()).data().cancelAtPeriodEnd,false);
 f.subscription.status='canceled';await f.handler(f.event('customer.subscription.deleted'));assert.equal(seats((await db.doc('businessSubscriptions/'+f.uid).get()).data()),1);
 assert.equal((await db.doc('wallets/'+f.uid).get()).data().balance,42);
});
test('wrong mode, price identity, invoice customer and failed invoice cannot post a revenue receipt',async()=>{
 const f=await fixture();await assert.rejects(f.handler({...f.event('invoice.paid'),livemode:true}),/mode_mismatch/);
 f.price.id='price_rogue';f.price.metadata.plan='scale';await assert.rejects(f.handler(f.event('invoice.paid')),/binding_mismatch/);
 f.price.id='price_growth';f.price.metadata.plan='growth';f.invoice.customer='cus_unrelated';await assert.rejects(f.handler(f.event('invoice.paid')),/invoice_binding_mismatch/);
 assert.equal((await db.collection('subscriptionPaymentReceipts').where('businessId','==',f.uid).get()).size,0);
});
test('signed current invoice revenue excludes collected tax; duplicate notification is never rewritten',async()=>{
 const f=await fixture('starter');f.invoice.amount_paid=10000;f.invoice.total_taxes=[{amount:100}];await f.handler(f.event('invoice.paid'));
 const notification=db.doc('notifications/subscription_revenue_'+f.invoice.id),before=await notification.get();assert.equal(before.data().revenueCents,9900);
 await f.handler(f.event('invoice.paid'));assert.ok(before.updateTime.isEqual((await notification.get()).updateTime));
});
test('concurrent paid events queue one customer welcome and receipt; transitions never duplicate mail',async()=>{
 const f=await fixture('starter');f.invoice.amount_paid=100;f.invoice.billing_reason='subscription_create';
 const e=f.event('invoice.paid');await Promise.all([f.handler(e),f.handler(e)]);await f.handler(f.event('invoice.paid'));
 const mails=async()=> (await db.collection('outboundEmailJobs').where('businessId','==',f.uid).get()).docs.map(d=>d.data());
 let jobs=await mails();assert.equal(jobs.filter(j=>j.template==='billing_welcome_v1').length,1);assert.equal(jobs.filter(j=>j.template==='billing_receipt_v1').length,1);
 assert.match(jobs.find(j=>j.template==='billing_receipt_v1').text,/Payment received: \$1.00/);
 f.subscription.cancel_at_period_end=true;await f.handler(f.event('customer.subscription.updated'));await f.handler(f.event('customer.subscription.updated'));
 f.subscription.cancel_at_period_end=false;await f.handler(f.event('customer.subscription.updated'));
 jobs=await mails();assert.equal(jobs.filter(j=>j.template==='billing_cancellation_v1').length,1);assert.equal(jobs.filter(j=>j.template==='billing_reactivation_v1').length,1);
 const before=jobs.length;await f.handler(e);assert.equal((await mails()).length,before);
 f.changePlan('managed_growth');await f.handler(f.event('customer.subscription.updated'));await f.handler(f.event('customer.subscription.updated'));
 jobs=await mails();assert.equal(jobs.filter(j=>j.template==='billing_plan_changed_v1').length,1);assert.match(jobs.find(j=>j.template==='billing_plan_changed_v1').text,/\$999.00/);
 f.invoice.status='open';f.invoice.amount_remaining=99900;await f.handler(f.event('invoice.payment_failed'));await f.handler(f.event('invoice.payment_failed'));
 jobs=await mails();assert.equal(jobs.filter(j=>j.template==='billing_payment_failed_v1').length,1);
 assert.equal((await db.doc('wallets/'+f.uid).get()).data().balance,42);
});
after(async()=>{await db.terminate();await app.delete();});
