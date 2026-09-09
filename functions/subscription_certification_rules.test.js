'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,getDocs,collection}=require('firebase/firestore');
for(const filename of ['firestore.rules','firestore.staging.rules','firestore.production.rules'])test('private certification denies all client access under '+filename,async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 const env=await initializeTestEnvironment({projectId:'demo-cert-rules-'+filename.split('.')[1],firestore:{rules:fs.readFileSync(path.join(__dirname,'..',filename),'utf8')}});
 try{
  await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();for(const [uid,role] of [['owner','business'],['other','business'],['admin','admin']])await setDoc(doc(db,'users/'+uid),{role,active:true});
   await setDoc(doc(db,'internalSubscriptionCertification/config'),{enabled:false,activeIntentId:'private_intent'});
   await setDoc(doc(db,'internalSubscriptionCertificationIntents/private_intent'),{ownerUid:'owner',status:'unused'});
  });
  for(const uid of [null,'owner','other','admin']){
   const db=uid?env.authenticatedContext(uid,{email_verified:true,email:uid+'@example.test'}).firestore():env.unauthenticatedContext().firestore();
   for(const target of ['internalSubscriptionCertification/config','internalSubscriptionCertificationIntents/private_intent']){
    await assertFails(getDoc(doc(db,target)));await assertFails(updateDoc(doc(db,target),{enabled:true,status:'unused',ownerUid:uid}));await assertFails(deleteDoc(doc(db,target)));
    await assertFails(setDoc(doc(db,target+'_new'),{ownerUid:uid,status:'unused',enabled:true}));
    await assertFails(getDocs(collection(db,target.split('/')[0])));
   }
  }
 }finally{await env.cleanup();}
});
