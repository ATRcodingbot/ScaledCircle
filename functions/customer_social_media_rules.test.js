'use strict';
const fs=require('node:fs'),{test,before,after}=require('node:test');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('local_emulator_required');
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-social-media-rules',firestore:{rules:fs.readFileSync(require('node:path').join(__dirname,'../firestore.production.rules'),'utf8')}});
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  for(const [uid,role] of [['owner','business'],['other','business'],['scaler','scaler'],['admin','admin']])await db.doc('users/'+uid).set({role,active:true});
  await db.doc('customerSocialMedia/delivery').set({businessUid:'owner',status:'approved_for_social',path:'private storage locator'});
 });
});
after(async()=>env?.cleanup());
test('delivery manifests and private-media authority are server-only, including owner and Admin clients',async()=>{
 for(const context of [env.unauthenticatedContext(),...['owner','other','scaler','admin'].map(uid=>env.authenticatedContext(uid,{email_verified:true}))]){
  const db=context.firestore();
  await assertFails(db.doc('customerSocialMedia/delivery').get());
  await assertFails(db.collection('customerSocialMedia').get());
  await assertFails(db.doc('customerSocialMedia/forged').set({businessUid:'owner',status:'approved_for_social'}));
  await assertFails(db.doc('customerSocialMedia/delivery').update({status:'approved_for_social'}));
  await assertFails(db.doc('customerSocialMedia/delivery').delete());
 }
});
