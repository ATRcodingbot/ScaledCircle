"use strict";
const assert = require('node:assert/strict');
const {before, after, test} = require('node:test');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Local emulator required');
process.env.GCLOUD_PROJECT = 'demo-scaledcircle';
const fft = require('firebase-functions-test')({projectId:'demo-scaledcircle'});
const functions = require('./index');
const {getFirestore} = require('firebase-admin/firestore');
const {getApps} = require('firebase-admin/app');
const db = getFirestore();
const call = (name, uid, data={}) => fft.wrap(functions[name])({data,auth:{uid,token:{email_verified:true}}});
before(async()=>{
  for(const [uid,role,active] of [['profile-pending','scaler',false],['profile-business','business',false],['profile-approved','scaler',true]]) {
    await db.doc(`users/${uid}`).set({role,active,betaAccess:active?'approved':'pending'});
  }
});
after(async()=>{fft.cleanup();await Promise.all(getApps().map(a=>a.delete()));});
test('pending first-time Scaler receives null and server work taxonomy',async()=>{
  assert.deepEqual(await call('getPendingScalerPreferences','profile-pending'),{preferences:null});
  assert.ok((await call('getMarketplaceWorkTypes','profile-pending')).workTypes.length>0);
});
test('pending reads/writes remain owner-bound and never approve',async()=>{
  await call('savePendingScalerPreferences','profile-pending',{uid:'profile-business',preferences:{areas:[],otherWorkInterests:'Saved interest'}});
  const result=await call('getPendingScalerPreferences','profile-pending',{uid:'profile-business'});
  assert.equal(result.preferences.otherWorkInterests,'Saved interest');
  assert.equal((await db.doc('discoveryPreferences/profile-business').get()).exists,false);
  assert.equal((await db.doc('users/profile-pending').get()).data().active,false);
  assert.equal((await db.doc('users/profile-pending').get()).data().betaAccess,'pending');
});
test('wrong role and approved account cannot use pending authority',async()=>{
  for(const uid of ['profile-business','profile-approved']) {
    for(const name of ['getPendingScalerPreferences','savePendingScalerPreferences']) {
      await assert.rejects(call(name,uid,{preferences:{areas:[]}}),e=>e.code==='permission-denied');
    }
  }
});
