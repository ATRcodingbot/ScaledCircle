'use strict';
const {test}=require('node:test'),fs=require('fs'),path=require('path');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc}=require('firebase/firestore');
test('production clients cannot grant, extend or restore operations authority',async()=>{
 const e=await initializeTestEnvironment({projectId:'demo-ops-grant-'+Date.now(),firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.production.rules'),'utf8')}});
 try{await e.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'users/assistant'),{role:'business',accountType:'business',activeView:'business',active:true,adminOperationsAccess:{mode:'revoked',expiresAtMs:0}}));
 const db=e.authenticatedContext('assistant',{email_verified:true}).firestore();
 await assertFails(updateDoc(doc(db,'users/assistant'),{adminOperationsAccess:{mode:'read_only',expiresAtMs:Date.now()+86400000}}));
 await assertFails(updateDoc(doc(db,'users/assistant'),{role:'admin'}));
 const other=e.authenticatedContext('other',{email_verified:true}).firestore();
 await assertFails(setDoc(doc(other,'users/other'),{role:'business',adminOperationsAccess:{mode:'read_only',expiresAtMs:Date.now()+86400000}}));
 }finally{await e.cleanup();}
});
