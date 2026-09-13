'use strict';
const {test,before,after}=require('node:test'),fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc}=require('firebase/firestore');
const {ref,uploadBytes,getBytes}=require('firebase/storage');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-referral-authority',
  firestore:{rules:fs.readFileSync('../firestore.staging.rules','utf8')},storage:{rules:fs.readFileSync('../storage.staging.rules','utf8')}});});
after(async()=>env.cleanup());
test('closing/deleted UID and a fresh different UID cannot use stale identity to read old Wallet or private files',async()=>{
  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'users/deleting_rules'),{role:'scaler',active:true});
    await setDoc(doc(c.firestore(),'wallets/deleting_rules'),{availableBalance:0});
  });
  const stale=env.authenticatedContext('deleting_rules',{email_verified:true});
  await assertSucceeds(getDoc(doc(stale.firestore(),'wallets/deleting_rules')));
  const image=ref(stale.storage(),'completionProofs/campaign/deleting_rules/task/after/material.jpg');
  await assertSucceeds(uploadBytes(image,new Uint8Array([1,2,3]),{contentType:'image/jpeg'}));
  await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'accountClosures/deleting_rules'),{status:'closing'}));
  await assertFails(getDoc(doc(stale.firestore(),'wallets/deleting_rules')));
  await assertFails(getDoc(doc(stale.firestore(),'users/deleting_rules')));
  await assertFails(setDoc(doc(stale.firestore(),'users/deleting_rules'),{role:'scaler',active:true}));
  await assertFails(getBytes(image));
  const fresh=env.authenticatedContext('fresh_rules',{email_verified:true});
  await assertFails(getDoc(doc(fresh.firestore(),'wallets/deleting_rules')));
  await assertFails(setDoc(doc(fresh.firestore(),'accountClosures/deleting_rules'),{status:'restored'}));
});
