'use strict';
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-production-engineering'},'refund-capacity'),db=getFirestore(app);
const f=require('./campaign_fund_allocation'),r=require('./campaign_refund_capacity');
let cash,reads;
const stripe={balance:{retrieve:async()=>{reads++;return {livemode:true,available:[{currency:'usd',amount:cash}]};}},refunds:{retrieve:async()=>result('succeeded')}};
const req=id=>({db,stripe,paymentId:id,operationId:'refund_'+id,amountCents:12000,workerCents:10000,feeCents:2000});
const contract=id=>({immutable:true,contractDigest:'digest_'+id,campaignId:id,businessId:'business',zoneId:id,scalerId:'scaler',currency:'usd',baseAmountCents:10000,bonusAmountCents:0});
async function seed(id){const p={campaignId:id,businessId:'business',status:'paid',paidAt:1,stripeMode:'live',currency:'usd',stripePaymentIntentId:'pi_'+id,businessChargeCents:12000,workerAmountCents:10000,platformFeeCents:2000};p.fundingAllocation=f.create(id,p);await db.doc('campaignPayments/'+id).set(p);return p;}
async function get(id='a'){return (await db.doc('campaignPayments/'+id).get()).data();}
async function mutate(id,fn){return db.runTransaction(async tx=>{const ref=db.doc('campaignPayments/'+id),p=(await tx.get(ref)).data(),next=fn(p);f.persist(tx,ref,p.fundingAllocation,next,'test_fixture',Date.now());});}
function result(status){return {id:'re_a',livemode:true,currency:'usd',amount:12000,payment_intent:'pi_a',metadata:{paymentId:'a'},status,balance_transaction:{id:'txn_refund',source:'re_a',currency:'usd',amount:-12000,net:-12000}};}
beforeEach(async()=>{await db.recursiveDelete(db.collection('campaignPayments'));cash=36000;reads=0;await Promise.all(['a','b','c'].map(seed));});
after(()=>deleteApp(app));
test('original race: two campaigns cannot consume third campaign backing at $335',async()=>{
 await mutate('c',p=>f.reserve('c',p,contract('c')));cash=33500;
 const outcomes=await Promise.allSettled([r.reserve(req('a')),r.reserve(req('b'))]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,0);
 assert(outcomes.every(x=>/insufficient/.test(x.reason.message)));
 assert.equal(f.view('c',await get('c')).workerReserveCents,10000);
});
test('two funded refunds reserve atomically; distinct operation cannot double-reserve same worker money',async()=>{
 const outcomes=await Promise.all([r.reserve(req('a')),r.reserve(req('b'))]);assert(outcomes.every(x=>x.claimed));
 assert.equal(f.view('c',await get('c')).uncommittedWorkerCents,10000);
 await assert.rejects(r.reserve({...req('a'),operationId:'different'}),/earned_funds_not_refundable/);
 const all=await db.collection('campaignPayments').get();assert.equal(all.docs.reduce((n,d)=>n+r.protectedAmount(d.id,d.data()),0),36000);
});
test('duplicate concurrent requests claim once; timeout retains capacity and retry cannot create again',async()=>{
 const out=await Promise.all([r.reserve(req('a')),r.reserve(req('a'))]);assert.equal(out.filter(x=>x.claimed).length,1);
 await r.observe({db,paymentId:'a',operationId:'refund_a'});
 assert.deepEqual(await r.reserve(req('a')),{claimed:false,state:'unknown'});
 assert.equal(Object.keys((await get()).fundingAllocation.refundCapacity).length,1);
 assert.equal(await r.safeWithdrawal({db,stripe,providerControlVerified:true}),0);
});
test('provider success twice preserves capacity until both ledger and provider debit reconcile',async()=>{
 await r.reserve(req('a'));const args={db,paymentId:'a',operationId:'refund_a',refund:result('succeeded')};
 await r.observe(args);const revision=(await get()).fundingAllocation.revision;await r.observe(args);
 assert.equal((await get()).fundingAllocation.revision,revision);
 await r.reconcile({...req('a')});assert.equal((await get()).fundingAllocation.refundCapacity.refund_a.state,'succeeded');
 await mutate('a',p=>f.sourceState('a',p,'refunded'));await db.doc('campaignPayments/a').update({status:'refunded'});cash=24000;
 await r.reconcile(req('a'));assert.equal((await get()).fundingAllocation.refundCapacity.refund_a.state,'reconciled');
 await r.observe(args);await r.reconcile(req('a'));assert.equal((await get()).fundingAllocation.refundCapacity.refund_a.state,'reconciled');
});
test('definitive provider failure followed by retry stays held; no second operation or automatic recreate',async()=>{
 await r.reserve(req('a'));await r.observe({db,paymentId:'a',operationId:'refund_a',refund:result('failed')});
 assert.deepEqual(await r.reserve(req('a')),{claimed:false,state:'failed_held'});
 assert.equal(await r.safeWithdrawal({db,stripe,providerControlVerified:true}),0);
 await assert.rejects(r.reserve({...req('a'),operationId:'new_retry'}),/earned_funds_not_refundable/);
});
test('refund versus assignment: exactly one wins, earned backing cannot be released',async()=>{
 const out=await Promise.allSettled([r.reserve(req('a')),mutate('a',p=>f.reserve('a',p,contract('a')))]);
 assert.equal(out.filter(x=>x.status==='fulfilled').length,1);
 await mutate('b',p=>f.reserve('b',p,contract('b')));
 await assert.rejects(r.reserve(req('b')),/earned_funds_not_refundable/);
 await mutate('b',p=>{const a=f.checked('b',p);a.assignments.b.started=true;a.revision++;return a;});
 await mutate('b',p=>f.earn('b',p,contract('b'),10000));
 await assert.rejects(r.reserve(req('b')),/earned_funds_not_refundable/);
 assert.equal(f.view('b',await get('b')).workerEarnedCents,10000);
});
test('replacement cash present or absent cannot authorize refund of earned compensation',async()=>{
 await mutate('a',p=>f.reserve('a',p,contract('a')));
 await mutate('a',p=>{const a=f.checked('a',p);a.assignments.a.started=true;a.revision++;return a;});
 await mutate('a',p=>f.earn('a',p,contract('a'),10000));
 for(cash of [0,100000])await assert.rejects(r.reserve(req('a')),/earned_funds_not_refundable/);
});
test('safe withdrawal concurrent with reservation fails closed; uncertain attempts never expire',async()=>{
 const out=await Promise.all([r.reserve(req('a')),r.safeWithdrawal({db,stripe,providerControlVerified:true})]);assert.equal(out[1],0);
 await r.observe({db,paymentId:'a',operationId:'refund_a'});
 await assert.rejects(r.reserve({...req('a'),amountCents:11000,workerCents:9000}),/operation_changed/);
 assert.equal(await r.safeWithdrawal({db,stripe,providerControlVerified:true}),0);
});
test('a lost successful response is reconciled by exact provider operation without another create',async()=>{
 const args={...req('a'),operationId:'cancel_a'};await r.reserve(args);await r.observe({db,paymentId:'a',operationId:'cancel_a'});
 const provider={balance:stripe.balance,refunds:{list:async()=>({has_more:false,data:[{...result('succeeded'),metadata:{paymentId:'a',refundReason:'unassigned_campaign_cancellation'}}]}),retrieve:stripe.refunds.retrieve}};
 await mutate('a',p=>f.sourceState('a',p,'refunded'));await db.doc('campaignPayments/a').update({status:'refunded'});cash=24000;
 await r.reconcile({...args,stripe:provider});assert.equal((await get()).fundingAllocation.refundCapacity.cancel_a.state,'reconciled');
 assert.equal((await r.reserve(args)).claimed,false);
});
test('concurrent withdrawal quote excludes unused return and earned obligation even before reservation wins',async()=>{
 await db.recursiveDelete(db.doc('campaignPayments/b'));await db.recursiveDelete(db.doc('campaignPayments/c'));
 await mutate('a',p=>f.reserve('a',p,contract('a')));
 await mutate('a',p=>{const a=f.checked('a',p);a.assignments.a.started=true;a.providerFeeCents=400;a.providerAvailableCents=11600;a.revision++;return a;});
 await mutate('a',p=>f.earn('a',p,contract('a'),8000));cash=11600;
 const args={...req('a'),amountCents:2400,workerCents:2000,feeCents:400};
 const out=await Promise.all([r.reserve(args),r.safeWithdrawal({db,stripe,providerControlVerified:true})]);
 assert(out[1]>=0&&out[1]<=1200);assert(cash-out[1]-2400>=8000);
 assert.equal(await r.safeWithdrawal({db,stripe,providerControlVerified:true}),0);
});
test('unknown balance, unrepresented legacy obligations and failed provider read fail closed',async()=>{
 cash=NaN;await assert.rejects(r.reserve(req('a')),/funds_unknown/);
 cash=36000;await db.doc('campaignPayments/legacy').set({status:'paid'});
 await assert.rejects(r.reserve(req('a')),/legacy_campaign/);
 assert.equal(await r.safeWithdrawal({db,stripe,providerControlVerified:true}),0);
 assert.equal(await r.safeWithdrawal({db,stripe:{balance:{retrieve:async()=>{throw Error('timeout');}}},providerControlVerified:true}),0);
});
