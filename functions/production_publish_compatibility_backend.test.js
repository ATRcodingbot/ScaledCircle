'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']) {
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key]||'')) throw Error('Loopback emulators required; no cloud test permitted');
}
// Exercise the production branch in a loopback-only emulator namespace. There
// is no Stripe request: these are synthetic emulator payment authority records.
process.env.GCLOUD_PROJECT='scaled-circle';
process.env.APP_ENV='production';
const fft=require('firebase-functions-test')({projectId:'scaled-circle'});
const entry=require.resolve('../functions-campaign-funding');
const localRequire=require('node:module').createRequire(entry);
const fn=require(entry).publishFundedCampaign;
const {getFirestore}=localRequire('firebase-admin/firestore');
const {getApps}=localRequire('firebase-admin/app');
const db=getFirestore();
const invoke=id=>fft.wrap(fn)({data:{campaignId:id},auth:{uid:'business',token:{email_verified:true}}});
before(async()=>{
 await db.doc('users/business').set({role:'business',active:true});
 for(const id of ['mixed','invalid']) {
  await db.doc('campaigns/'+id).set({businessId:'business',status:'draft',fundingStatus:'funded',fundingPaymentId:'payment-'+id});
  await db.doc('campaignPayments/payment-'+id).set({businessUid:'business',campaignId:id,status:'paid',stripeMode:'live',amountTotalCents:1800});
  await db.doc('campaignZones/'+id+'-invalid').set({campaignId:id,businessId:'business',mapped:false,pointCount:2});
 }
 await db.doc('campaignZones/mixed-valid').set({campaignId:'mixed',businessId:'business',mapped:true});
});
after(async()=>{fft.cleanup();for(const app of getApps())await app.delete();});
test('production handler filters invalid zones and preserves paid authority without additional economic effect',async()=>{
 const payment=(await db.doc('campaignPayments/payment-mixed').get()).data();
 assert.deepEqual(await invoke('mixed'),{campaignId:'mixed',status:'open',zonesLocked:1});
 assert.equal((await db.doc('campaignZones/mixed-valid').get()).data().mapLocked,true);
 assert.equal((await db.doc('campaignZones/mixed-invalid').get()).data().mapLocked,undefined);
 assert.deepEqual(await invoke('mixed'),{campaignId:'mixed',status:'open'});
 assert.deepEqual((await db.doc('campaignPayments/payment-mixed').get()).data(),payment);
 for(const collection of ['walletTransactions','scalerEarnings','trackingSessions'])assert.equal((await db.collection(collection).get()).empty,true);
});
test('production handler rejects all-invalid campaign with the deployed payment/zone failure',async()=>{
 await assert.rejects(invoke('invalid'),e=>e.code==='failed-precondition'&&e.message==='Signed Stripe payment and a valid mapped Zone are required.');
 assert.equal((await db.doc('campaigns/invalid').get()).data().status,'draft');
});
