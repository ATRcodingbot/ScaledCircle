'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-production-engineering'},'allocation-tests'),db=getFirestore(app);
const f=require('./campaign_fund_allocation');
after(()=>deleteApp(app));
test('concurrent assignment transactions reserve only once and retain immutable audit',async()=>{
 const ref=db.doc('campaignPayments/allocation-concurrency');
 const p={campaignId:'campaign',businessId:'business',currency:'usd',status:'paid',paidAt:1,stripeMode:'live',
 stripePaymentIntentId:'pi_fixture',businessChargeCents:12000,workerAmountCents:10000,platformFeeCents:2000};
 await db.recursiveDelete(ref);p.fundingAllocation=f.create(ref.id,p);await ref.set(p);
 const contract={immutable:true,contractDigest:'digest',campaignId:'campaign',businessId:'business',zoneId:'zone',scalerId:'scaler',currency:'usd',baseAmountCents:8000,bonusAmountCents:2000};
 async function reserve(zoneId){return db.runTransaction(async tx=>{
   const before=(await tx.get(ref)).data(),next=f.reserve(ref.id,before,{...contract,zoneId});
   f.persist(tx,ref,before.fundingAllocation,next,'assignment_reserved',Date.now());
 });}
 const results=await Promise.allSettled([reserve('one'),reserve('two')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.match(results.find(x=>x.status==='rejected').reason.message,/exhausted/);
 const saved=(await ref.get()).data();assert.equal(Object.keys(saved.fundingAllocation.assignments).length,1);
 assert.equal((await ref.collection('allocationEvents').get()).size,1);
 await reserve(Object.keys(saved.fundingAllocation.assignments)[0]);
 assert.equal((await ref.collection('allocationEvents').get()).size,1);
});
