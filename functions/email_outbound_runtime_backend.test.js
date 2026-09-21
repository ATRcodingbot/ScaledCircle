'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const app=admin.initializeApp({projectId:'demo-email-outbound-runtime'},'outbound-runtime'),db=app.firestore();
const budget=require('../functions-business-email/inference_budget'),{createRuntime,PURPOSE}=require('../functions-business-email/outbound_runtime');
const at=Date.parse('2026-09-21T15:00:00Z'),businessId=budget.WORKSPACES[0],grant=db.doc('emailAssistanceOperatingGrants/fixture');
let calls,run;
const a={businessId,beta:{leadAssistanceGrant:{inferenceGrantId:'fixture'}}};
const input={a,requestId:'one',recheck:async()=>{},context:{businessId,name:'Fixture',services:['Business organization'],claims:[],destinations:[],audiences:['requested'],objective:'qualified_conversation'},existing:{baseline:{subject:'Hello',body:'Discuss Business organization.'}}};
beforeEach(async()=>{
 await db.recursiveDelete(grant);calls=0;
 await grant.set({purpose:'lead_email_assistance',status:'active',authorizedBy:'fixture',authorizationReference:'fixture',provider:'openai',model:'gpt-4.1-mini',maximumCostMicros:budget.LIMIT,maximumRequests:100,renewal:false,topUp:false,businessIds:budget.WORKSPACES,startsAt:at,expiresAt:at+budget.TERM,allowedPurposes:[PURPOSE],purposeAuthorization:{[PURPOSE]:{authorizedBy:'fixture',reference:'fixture'}}});
 await db.doc('emailAssistanceProviderReviews/openai_gmail_v1').set({status:'verified',organization:'fixture',project:'fixture',evidenceRef:'fixture',outboundEvidenceRef:'fixture',outboundBusinessContextPermitted:true,gmailProcessingPermitted:false,trainingSharingDisabled:true,loggingMode:'per_call_store_false'});
 run=createRuntime({db,apiKey:'fixture-only',now:()=>at,fetchImpl:async(_url,options)=>{
  calls++;const payload=JSON.parse(options.body);assert.equal(payload.store,false);
  const value=payload.text.format.name==='outbound_quality'?{factsSupported:true,purposeAppropriate:true,distinctApproach:true,publicCopySafe:true}:{subject:'A useful next step',body:'Which part of organizing your Business would you like to discuss?'};
  return new Response(JSON.stringify({id:'fixture'+calls,status:'completed',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
 }});
});
after(()=>app.delete());
test('purpose, inactive clock, data assessment and workspace gates prevent provider calls',async()=>{
 await grant.update({allowedPurposes:[]});assert.equal(await run.preflight(a),'outbound_purpose_extension_required');await assert.rejects(run(input));
 await grant.update({allowedPurposes:[PURPOSE],status:'prepared',startsAt:null,expiresAt:null});await assert.rejects(run(input),/inactive/);
 await grant.update({status:'active',startsAt:at,expiresAt:at+budget.TERM});await db.doc('emailAssistanceProviderReviews/openai_gmail_v1').update({outboundBusinessContextPermitted:false});await assert.rejects(run(input),/data_assessment/);
 await assert.rejects(run({...input,a:{...a,businessId:'other'}}));assert.equal(calls,0);
});
test('generation plus independent review use two shared reservations; replay cannot call provider again',async()=>{
 const result=await run(input);assert.equal(result.state,'quality_passed');assert.equal(calls,2);
 const usage=(await grant.collection('usage').doc('shared').get()).data();assert.equal(usage.requests,2);assert.equal(usage.actualCostMicros,1120);assert.equal(usage.outstandingCostMicros,0);
 await run(input);assert.equal(calls,2);
});
test('insufficient remaining review budget cannot attach an unreviewed candidate or overspend',async()=>{
 await grant.collection('usage').doc('shared').set({requests:99,outstandingCostMicros:0,actualCostMicros:0});
 await assert.rejects(run(input),/request_limit/);assert.equal(calls,1);assert.equal((await grant.collection('usage').doc('shared').get()).data().requests,100);
});
