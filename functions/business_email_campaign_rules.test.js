'use strict';
const {test}=require('node:test'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection}=require('firebase/firestore');
test('campaign history, suppression and unsubscribe capabilities are server-only in production Rules',async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 const env=await initializeTestEnvironment({projectId:'demo-campaign-rules',firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.production.rules'),'utf8')}});
 try{for(const uid of ['owner','admin','other',null]){const db=uid?env.authenticatedContext(uid,{email_verified:true,admin:uid==='admin'}).firestore():env.unauthenticatedContext().firestore();for(const p of ['businessMailboxes/owner/campaignCandidates/contact','businessMailboxes/owner/campaigns/review','businessMailboxes/owner/contactHistory/event','businessMailboxes/owner/suppression/email','businessEmailUnsubscribeLinks/token']){await assertFails(getDoc(doc(db,p)));await assertFails(setDoc(doc(db,p),{businessId:'owner'}));}await assertFails(getDocs(collection(db,'businessMailboxes/owner/campaignCandidates')));}}
 finally{await env.cleanup();}
});
