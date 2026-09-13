'use strict';
const {test,before,after}=require('node:test'),fs=require('fs'),path=require('path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,updateDoc}=require('firebase/firestore');
let environments=[];
before(async()=>{for(const edition of ['staging','production']){
 const env=await initializeTestEnvironment({projectId:'demo-push-rules-'+edition,firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.'+edition+'.rules'),'utf8')}});
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const uid of ['owner','other'])await setDoc(doc(db,'users/'+uid),{role:'scaler',active:true});await setDoc(doc(db,'notifications/notice'),{userId:'owner',read:false});for(const col of ['mobilePushDevices','mobilePushTokenBindings','mobilePushReceipts','mobileNotificationPreferences'])await setDoc(doc(db,col+'/record'),{uid:'owner',token:'never-client-visible'});});environments.push(env);
}});
after(async()=>Promise.all(environments.map(e=>e.cleanup())));
test('both deployed rule models deny every client token/receipt/preference read or write',async()=>{for(const e of environments){for(const uid of ['owner','other']){const db=e.authenticatedContext(uid,{email_verified:true}).firestore();for(const col of ['mobilePushDevices','mobilePushTokenBindings','mobilePushReceipts','mobileNotificationPreferences']){await assertFails(getDoc(doc(db,col+'/record')));await assertFails(setDoc(doc(db,col+'/forged'),{uid,token:'forged'}));}}}});
test('one existing notification stays recipient scoped and only read state is writable',async()=>{for(const e of environments){const owner=e.authenticatedContext('owner',{email_verified:true}).firestore(),other=e.authenticatedContext('other',{email_verified:true}).firestore();await assertSucceeds(getDoc(doc(owner,'notifications/notice')));await assertSucceeds(updateDoc(doc(owner,'notifications/notice'),{read:true}));await assertFails(getDoc(doc(other,'notifications/notice')));await assertFails(updateDoc(doc(owner,'notifications/notice'),{push:{status:'provider_accepted'}}));}});
