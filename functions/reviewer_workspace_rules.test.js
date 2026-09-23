'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,Timestamp}=require('firebase/firestore');

for(const mode of ['production','staging']) test(`${mode}: durable review seats require exact provenance and retain workspace boundaries`,async()=>{
  assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
  const env=await initializeTestEnvironment({projectId:`demo-reviewer-${mode}`,firestore:{rules:fs.readFileSync(`../firestore.${mode}.rules`,'utf8')}});
  const grant={status:'active',plan:'scale',comped:true,billingStatus:'comped',source:'internal_qa',purpose:'store_review',paidProviderUsageAllowed:false,accessTerm:'until_revoked',expiresAt:null,revokedAt:null};
  const seedGrant=record=>env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'businessSubscriptions/reviewer'),record));
  const read=(uid,owner='reviewer')=>getDoc(doc(env.authenticatedContext(uid,{email_verified:true}).firestore(),`businessWorkspaces/${owner}/activity/entry`));
  try {
    await env.withSecurityRulesDisabled(async c=>{
      const db=c.firestore();
      await setDoc(doc(db,'users/reviewer'),{role:'business',active:true});
      await setDoc(doc(db,'users/other'),{role:'business',active:true});
      for(const owner of ['reviewer','other'])await setDoc(doc(db,`businessWorkspaces/${owner}/activity/entry`),{kind:'controlled_fixture'});
      for(const seatIndex of [1,4,5])await setDoc(doc(db,`businessWorkspaces/reviewer/members/member${seatIndex}`),{uid:`member${seatIndex}`,businessId:'reviewer',status:'active',seatIndex,permissions:['teamManagement']});
    });
    await seedGrant(grant);
    await assertSucceeds(read('member1'));
    await assertSucceeds(read('member4')); // owner plus four members
    await assertFails(read('member5'));
    await assertFails(read('member4','other'));
    for(const patch of [{status:'revoked'},{revokedAt:Timestamp.now()},{source:'internal_beta'},{purpose:'dogfood'},{paidProviderUsageAllowed:true},{comped:false},{accessTerm:'monthly'},{plan:'managed_growth'}]){
      await seedGrant({...grant,...patch});await assertFails(read('member1'));
    }
    for(const key of ['source','purpose','paidProviderUsageAllowed','accessTerm']){
      const malformed={...grant};delete malformed[key];await seedGrant(malformed);await assertFails(read('member1'));
    }
    for(const record of [
      {status:'active',plan:'scale'},
      {status:'active',plan:'scale',expiresAt:null},
      {status:'active',plan:'scale',source:'stripe',expiresAt:Timestamp.fromMillis(Date.now()-60000)},
      {status:'active',plan:'scale',source:'trial',expiresAt:Timestamp.fromMillis(Date.now()-60000)},
    ]){await seedGrant(record);await assertFails(read('member1'));}
    await seedGrant({status:'active',plan:'scale',source:'stripe',expiresAt:Timestamp.fromMillis(Date.now()+60000)});
    await assertSucceeds(read('member4'));
    await assertFails(read('member5'));
  }finally{await env.cleanup();}
});
