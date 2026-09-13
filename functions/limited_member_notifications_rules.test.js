'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,where,orderBy,updateDoc,deleteDoc,serverTimestamp}=require('firebase/firestore');
let env;
before(async()=>{
 assert(process.env.FIRESTORE_EMULATOR_HOST);
 env=await initializeTestEnvironment({projectId:'demo-limited-notifications',firestore:{rules:fs.readFileSync('../firestore.staging.rules','utf8')}});
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  for(const uid of ['fresh_member','owner','unrelated','removed','disabled','deleted']) await setDoc(doc(d,'users/'+uid),{role:'business',active:false,betaAccess:'pending',disabled:uid==='disabled'});
  await setDoc(doc(d,'accountClosures/deleted'),{status:'completed'});
  await setDoc(doc(d,'businessWorkspaces/owner/members/fresh_member'),{uid:'fresh_member',businessId:'owner',status:'active',seatIndex:1,permissions:['scheduleView','scheduleEdit']});
  for(const uid of ['fresh_member','owner','unrelated','removed','disabled','deleted'])await setDoc(doc(d,'notifications/'+uid),{userId:uid,title:'Account notice',read:false,createdAt:serverTimestamp()});
  await setDoc(doc(d,'campaigns/private'),{businessId:'owner',certificationFixture:false});
  await setDoc(doc(d,'wallets/deleted'),{availableBalance:0});
 });
});
after(async()=>env.cleanup());
const db=uid=>env.authenticatedContext(uid,{email_verified:true}).firestore();
test('pending personal profile and limited workspace member can read and acknowledge only own notifications',async()=>{
 const d=db('fresh_member');
 await assertSucceeds(getDoc(doc(d,'notifications/fresh_member')));
 await assertSucceeds(getDocs(query(collection(d,'notifications'),where('userId','==','fresh_member'),orderBy('createdAt','desc'))));
 await assertSucceeds(updateDoc(doc(d,'notifications/fresh_member'),{read:true,readAt:serverTimestamp()}));
 await assertFails(getDoc(doc(d,'notifications/owner')));
 await assertFails(getDocs(query(collection(d,'notifications'),where('userId','==','owner'))));
 await assertFails(getDocs(collection(d,'notifications')));
 await assertFails(getDoc(doc(d,'campaigns/private')));
 await assertFails(getDoc(doc(d,'wallets/deleted')));
});
test('no impersonation, private-field edits, recipient transfer, delete or injected event',async()=>{
 const d=db('fresh_member'),r=doc(d,'notifications/fresh_member');
 for(const changes of [{userId:'owner'},{title:'Fake payment'},{amountCents:10000},{read:false},{deepLink:{destination:'billing'}}])await assertFails(updateDoc(r,changes));
 await assertFails(setDoc(doc(d,'notifications/fake'),{userId:'fresh_member',read:false}));
 await assertFails(deleteDoc(r));await assertFails(updateDoc(doc(d,'notifications/owner'),{read:true}));
});
test('signed-out, disabled, closing/deleted identities denied; removal does not erase personal account notices',async()=>{
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'notifications/fresh_member')));
 for(const uid of ['disabled','deleted'])await assertFails(getDoc(doc(db(uid),'notifications/'+uid)));
 await assertSucceeds(getDoc(doc(db('removed'),'notifications/removed')));
});
