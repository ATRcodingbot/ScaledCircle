'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
test('isolated LIVE entry exports only reviewed cash-out and single-job responsibilities',()=>{
 const source=fs.readFileSync(path.join(root,'functions-scaler-cashout/index.js'),'utf8');
 assert.deepEqual([...source.matchAll(/exports\.(\w+)\s*=/g)].map(m=>m[1]).sort(),['getScalerCashoutV1','setupScalerPayoutsV1','requestScalerCashoutV1','reconcileScalerCashoutV1','adminScalerCashoutsV1','adminReconcileScalerCashoutV1','scalerCashoutLiveWebhookV1','scalerCashoutLiveConnectWebhookV1','recheckScalerCashoutsV1','liveWorkCertificationV1'].sort());
 assert.doesNotMatch(source,/STRIPE_TEST_SECRET_KEY|staging_payment_certification|scaler_cashout'|scaler_cashout_stripe|publishFundedCampaign\s*=/);
 for(const name of ['scaler_cashout_engine.js','scaler_cashout_shared.js','scaler_cashout_provider.js','scaler_cashout_live.js','scaler_cashout_live_store.js','live_work_certification.js','live_work_certification_policy.js','campaign_reserve_settlement.js'])assert.equal(fs.readFileSync(path.join(root,'functions-scaler-cashout',name),'utf8'),fs.readFileSync(path.join(__dirname,name),'utf8'));
});
test('unsigned callable request cannot construct provider, create recipient or inspect Wallet',async()=>{
 let constructed=0;const exported={};const fakeRequire=name=>{
  if(name==='firebase-admin/app')return {initializeApp(){}};
  if(name==='firebase-admin/firestore')return {getFirestore(){throw Error('No database access');}};
  if(name==='firebase-admin/auth')return {getAuth(){throw Error('No Auth access');}};
  if(name==='firebase-admin/storage')return {getStorage(){throw Error('No Storage access');}};
  if(name==='firebase-functions/v2/https')return {onCall:(_o,f)=>f,onRequest:(_o,f)=>f,HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}}};
  if(name==='firebase-functions/v2/scheduler')return {onSchedule:()=>null};
  if(name==='firebase-functions/params')return {defineSecret:()=>({value:()=>{throw Error('No secret access');}})};
  if(name==='firebase-functions/logger')return {warn(){}};
  if(name==='stripe')return class{constructor(){constructed++;}};
  throw Error('Unexpected '+name);
 };
 vm.runInNewContext(fs.readFileSync(path.join(root,'functions-scaler-cashout/index.js'),'utf8'),{exports:exported,require:fakeRequire,process:{env:{}}});
 for(const name of ['getScalerCashoutV1','setupScalerPayoutsV1','requestScalerCashoutV1','reconcileScalerCashoutV1','adminScalerCashoutsV1','adminReconcileScalerCashoutV1','liveWorkCertificationV1'])await assert.rejects(exported[name]({}),e=>e.code==='unauthenticated');assert.equal(constructed,0);
});
