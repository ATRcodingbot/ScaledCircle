"use strict";
const {test,before,after}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const market=require("./market_rollout"),{states}=require("./market_states");
const id=code=>states.find(s=>s.code===code).id;
let app,db,service,env;
before(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error("Emulator required");
  const projectId="demo-market-rollout";
  app=initializeApp({projectId},projectId);db=getFirestore(app);
  env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync(require("node:path").join(__dirname,"../firestore.production.rules"),"utf8")}});
  await env.clearFirestore();
  service=market.createService({db,FieldValue,getUser:async uid=>({disabled:uid==="disabled"}),requireAdmin:async r=>{
    if(r.auth?.uid!=="admin")throw Object.assign(Error("Denied"),{code:"permission-denied"});}});
  for(const [uid,role]of[["md","business"],["pa","business"],["scaler","scaler"],["disabled","scaler"],["admin","admin"]])
    await db.doc(`users/${uid}`).set({role,active:true,accountType:role,activeView:role});
});
after(async()=>{await env?.cleanup();if(app)await deleteApp(app);});
test("only maintained Admin can initialize; initialization is idempotent and never overwrites a pause",async()=>{
  await assert.rejects(service.administer({auth:{uid:"md"},data:{action:"initialize"}}));
  await service.administer({auth:{uid:"admin"},data:{action:"initialize"}});
  await service.administer({auth:{uid:"admin"},data:{action:"initialize"}});
  assert.equal((await db.collection("marketRolloutAudit").get()).size,1);
  assert.equal((await service.catalog()).states.find(s=>s.code==="MD").status,"ACTIVE");
});
test("out-of-state account can explicitly confirm state; no identity, consent, preferences or financial writes",async()=>{
  await db.doc("discoveryPreferences/scaler").set({areas:[{name:"Existing county"}]});
  for(const c of["wallets","campaigns","earnings","legalConsents"])
    await db.doc(`${c}/preserved`).set({sentinel:"unchanged"});
  const usersBefore=(await db.collection("users").get()).docs.map(d=>d.data());
  const result=await service.save("scaler",{stateId:id("PA"),launchNotifications:true});
  assert.equal(result.status,"PRELAUNCH");assert.equal(result.stateConfirmed,true);
  assert.deepEqual((await db.collection("users").get()).docs.map(d=>d.data()),usersBefore);
  assert.deepEqual((await db.doc("discoveryPreferences/scaler").get()).data(),{areas:[{name:"Existing county"}]});
  for(const c of["wallets","campaigns","earnings","legalConsents"]){
    assert.equal((await db.collection(c).get()).size,1);
    assert.deepEqual((await db.doc(`${c}/preserved`).get()).data(),{sentinel:"unchanged"});
  }
});
test("anonymous, disabled, wrong role, free-text state and forged authoritative fields are denied",async()=>{
  for(const uid of[undefined,"disabled","admin"])await assert.rejects(service.save(uid,{stateId:id("MD"),launchNotifications:false}));
  for(const input of[{stateId:"Maryland",launchNotifications:false},
    {stateId:id("MD"),launchNotifications:false,role:"admin"},
    {stateId:id("MD"),launchNotifications:false,uid:"other"},
    {stateId:id("MD"),launchNotifications:false,updatedAt:"yesterday"}])await assert.rejects(service.save("md",input));
});
test("activation preserves accounts and preferences; concurrent stale Admin update fails; no messages sent",async()=>{
  const profile=(await db.doc("marketProfiles/scaler").get()).data();
  const config=await service.catalog();
  const input={auth:{uid:"admin"},data:{action:"setStatus",stateId:id("PA"),status:"ACTIVE",expectedRevision:config.revision}};
  const results=await Promise.allSettled([service.administer(input),service.administer({...input,data:{...input.data,status:"PAUSED"}})]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.deepEqual((await db.doc("marketProfiles/scaler").get()).data(),profile);
  assert.equal((await db.collection("notifications").get()).size,0);
  assert.equal((await db.collection("outboundEmailJobs").get()).size,0);
  const next=await service.catalog();
  await service.administer({auth:{uid:"admin"},data:{action:"setStatus",stateId:id("PA"),status:"PRELAUNCH",expectedRevision:next.revision}});
});
test("Rules reject forged state/config/aggregate writes and PRELAUNCH draft creation; ACTIVE draft allowed",async()=>{
  await service.save("md",{stateId:id("MD"),launchNotifications:false});
  await service.save("pa",{stateId:id("PA"),launchNotifications:false});
  const auth=uid=>env.authenticatedContext(uid,{email_verified:true}).firestore();
  for(const uid of["md","pa","admin"])for(const path of["marketProfiles/md",market.CONFIG,"marketRolloutAudit/forged"]){
    await assertFails(auth(uid).doc(path).set({stateId:id("MD"),status:"ACTIVE"}));
    await assertFails(auth(uid).doc(path).get());
  }
  const {serverTimestamp}=require("firebase/firestore");
  for(const uid of["md","pa"]){
    const write=auth(uid).doc(`campaigns/new_${uid}`).set({businessId:uid,status:"draft",createdAt:serverTimestamp()});
    if(uid==="md")await assertSucceeds(write);else await assertFails(write);
  }
  await assertFails(env.unauthenticatedContext().firestore().doc("campaigns/anonymous").set({businessId:"md",status:"draft"}));
  await assertFails(auth('md').doc('campaigns/forged_open').set({businessId:'md',status:'open',createdAt:serverTimestamp()}));
  await db.doc("campaigns/old_pa_draft").set({businessId:"pa",status:"draft"});
  await assertFails(auth("pa").doc("campaigns/old_pa_draft").update({status:"open"}));
  const current=await service.catalog();
  await service.administer({auth:{uid:"admin"},data:{action:"setStatus",stateId:id("MD"),status:"PAUSED",expectedRevision:current.revision}});
  await assertFails(auth("md").doc("campaigns/paused_md").set({businessId:"md",status:"draft",createdAt:serverTimestamp()}));
  await service.administer({auth:{uid:"admin"},data:{action:"initialize"}});
  assert.equal((await service.catalog()).states.find(s=>s.code==='MD').status,'PAUSED');
});
test('staging legacy campaign rules also deny direct open creation and state forgery',async()=>{
  const staging=await initializeTestEnvironment({projectId:'demo-market-staging',firestore:{rules:fs.readFileSync(require('node:path').join(__dirname,'../firestore.staging.rules'),'utf8')}});
  try {
    await staging.withSecurityRulesDisabled(async context=>{
      const store=context.firestore();
      await store.doc('users/owner').set({role:'business',active:true,accountType:'business',activeView:'business'});
      await store.doc(market.CONFIG).set(market.initialConfig());
      await store.doc('marketProfiles/owner').set({role:'business',stateId:id('MD'),selectionSource:'explicit_user_selection'});
    });
    const store=staging.authenticatedContext('owner',{email_verified:true}).firestore();
    await assertFails(store.doc('campaigns/forged_open').set({businessId:'owner',status:'open'}));
    await assertFails(store.doc('marketProfiles/owner').update({stateId:id('PA')}));
  } finally {await staging.cleanup();}
});
