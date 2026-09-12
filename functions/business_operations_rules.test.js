'use strict';
const {test}=require('node:test'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection}=require('firebase/firestore');
for(const name of ['staging','production'])test(name+' Rules prohibit every direct CRM read/write, including owner and Admin',async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 const env=await initializeTestEnvironment({projectId:'demo-core-rules-'+name,firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.'+name+'.rules'),'utf8')}});
 try{await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'businessOperations/owner/customers/customer'),{name:'Private'});for(const [uid,role]of [['owner','business'],['admin','admin'],['other','business']])await setDoc(doc(c.firestore(),'users/'+uid),{role,active:true});});
 for(const uid of ['owner','admin','other',null]){const db=uid?env.authenticatedContext(uid,{email_verified:true}).firestore():env.unauthenticatedContext().firestore();await assertFails(getDoc(doc(db,'businessOperations/owner/customers/customer')));await assertFails(getDocs(collection(db,'businessOperations/owner/customers')));for(const col of ['customers','items','resources','timeline','preferences','requests'])await assertFails(setDoc(doc(db,`businessOperations/owner/${col}/attempt`),{businessId:'owner'}));}
 }finally{await env.cleanup();}
});
