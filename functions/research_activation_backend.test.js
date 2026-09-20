'use strict';
if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required');
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),admin=require('firebase-admin'),crypto=require('node:crypto');
const app=admin.initializeApp({projectId:'demo-research-activation'},'pilot-activation'),db=app.firestore();
const authority=require('../functions-creative-media/research_pilot_authority');const at=1789915000000;
beforeEach(async()=>{for(const c of ['researchRuntimeAccess','researchOperatingGrants','researchOperatingUsage','researchOperatingReservations'])await db.recursiveDelete(db.collection(c));});after(()=>app.delete());
async function proofs(){for(const [email,workspace]of Object.entries(authority.PRINCIPALS))await db.doc('researchRuntimeAccess/'+crypto.createHash('sha256').update(workspace).digest('hex')).set({email,workspace,listed:true,at});}
test('activation cannot start before both exact deployed runtime proofs exist',async()=>{await assert.rejects(authority.activateAndValidate({db,operator:'admin',now:()=>at,clientFactory:()=>assert.fail('no paid call')}),/preflight_required/);assert.equal((await db.doc('researchOperatingGrants/'+authority.PILOT).get()).exists,false);});
test('one access validation counts inside fixed seven-day shared grant; replay cannot restart or spend again',async()=>{
 await proofs();let paid=0;const clientFactory=async()=>({responses:{create:async(_,options)=>{assert.equal(options.maxRetries,0);paid++;return {output:[{type:'web_search_call'}],usage:{input_tokens:1000,output_tokens:100}};}}});
 const args={db,operator:'admin',now:()=>at,clientFactory};const result=await authority.activateAndValidate(args);
 assert.equal(result.grant.startsAt,at);assert.equal(result.grant.expiresAt,at+7*86400000);assert.equal(result.purpose,'access_validation_not_scheduled_research');assert.equal(result.accountedCostMicros,13760);
 const replay=await authority.activateAndValidate({...args,now:()=>at+1000});assert.equal(replay.reused,true);assert.equal(replay.grant.startsAt,at);assert.equal(paid,1);
 const usage=(await db.doc('researchOperatingUsage/'+authority.PILOT).get()).data();assert.equal(usage.attempts,1);assert.equal(usage.actualCostMicros,13760);
});
test('failed paid check retains reservation, stays disabled and cannot auto-retry',async()=>{
 await proofs();let calls=0;const args={db,operator:'admin',now:()=>at,clientFactory:async()=>({responses:{create:async()=>{calls++;throw Error('timeout');}}})};
 await assert.rejects(authority.activateAndValidate(args),/requires_reconciliation/);await assert.rejects(authority.activateAndValidate(args),/already_dispatched/);assert.equal(calls,1);
 assert.equal((await db.doc('researchOperatingGrants/'+authority.PILOT).get()).data().recurringEnabled,false);assert.equal((await db.doc('researchOperatingUsage/'+authority.PILOT).get()).data().outstandingCostMicros,100000);
});
