'use strict';
const {reservationTransition}=require('./shared/generation_budget');
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const LIMIT=1000000,RESERVE=4800,REQUESTS=100,TERM=7*86400000;
const WORKSPACES=Object.freeze(['p1tigN2XE9ascVN4es3RBncw6nf1','IqRjZYHKOzXYuJcSyL68LYNwtDg1']);
function valid(g,businessId,at,allowed=WORKSPACES){return g?.purpose==='lead_email_assistance'&&g.status==='active'&&
 g.authorizedBy&&g.authorizationReference&&g.provider==='openai'&&g.model==='gpt-4.1-mini'&&
 g.maximumCostMicros===LIMIT&&g.maximumRequests===REQUESTS&&g.renewal===false&&g.topUp===false&&
 Number.isSafeInteger(g.startsAt)&&g.startsAt<=at&&g.expiresAt===g.startsAt+TERM&&at<g.expiresAt&&
 !g.revokedAt&&g.businessIds?.length===2&&g.businessIds.every(x=>allowed.includes(x))&&new Set(g.businessIds).size===2&&g.businessIds.includes(businessId);}
function createStore({db,grantId,now=Date.now,allowedWorkspaces=WORKSPACES}){
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(grantId))throw Error('invalid_inference_grant');
 const grant=db.doc('emailAssistanceOperatingGrants/'+grantId),usage=grant.collection('usage').doc('shared');
 async function reserve({businessId,requestId,inputDigest}){
  if(!requestId||!inputDigest||!allowedWorkspaces.includes(businessId))throw Error('inference_binding_invalid');
  const ref=grant.collection('reservations').doc(hash([businessId,requestId]));
  return db.runTransaction(async tx=>{
   const [g,r,u]=await Promise.all([tx.get(grant),tx.get(ref),tx.get(usage)]);
   if(!valid(g.data(),businessId,now(),allowedWorkspaces))throw Error('inference_not_authorized');
   if(r.exists){if(r.data().inputDigest!==inputDigest)throw Error('inference_request_changed');return {...r.data(),reused:true};}
   const v=u.data()||{};
   if((v.requests||0)>=REQUESTS)throw Error('inference_request_limit');
   if((v.actualCostMicros||0)+(v.outstandingCostMicros||0)+RESERVE>LIMIT)throw Error('inference_budget_exhausted');
   const record={id:ref.id,grantId,businessId,inputDigest,status:'reserved',reservedUnits:1,reservedCostMicros:RESERVE,createdAt:now()};
   tx.create(ref,record);tx.set(usage,{requests:(v.requests||0)+1,outstandingCostMicros:(v.outstandingCostMicros||0)+RESERVE},{merge:true});return record;
  });
 }
 async function claim(reservation){return db.runTransaction(async tx=>{
  const ref=grant.collection('reservations').doc(reservation.id),[r,g]=await Promise.all([tx.get(ref),tx.get(grant)]),v=r.data();
  if(!v||v.businessId!==reservation.businessId||v.inputDigest!==reservation.inputDigest||!valid(g.data(),v.businessId,now(),allowedWorkspaces))throw Error('inference_not_authorized');
  if(v.status!=='reserved'||v.dispatchedAt)return false;tx.update(ref,{dispatchedAt:now()});return true;
 });}
 async function settle(reservation,providerUsage){return db.runTransaction(async tx=>{
  const ref=grant.collection('reservations').doc(reservation.id),[r,u]=await Promise.all([tx.get(ref),tx.get(usage)]),v=r.data();
  if(!v||v.businessId!==reservation.businessId||v.inputDigest!==reservation.inputDigest)throw Error('inference_binding_invalid');
  const input=providerUsage?.input_tokens,output=providerUsage?.output_tokens;
  const known=Number.isSafeInteger(input)&&input>=0&&input<=8000&&Number.isSafeInteger(output)&&output>=0&&output<=1000;
  const cost=known?{actualCostMicros:Math.ceil(input*0.4+output*1.6)}:null;
  const status=known?'settled':'unknown_provider_outcome';
  const delta=reservationTransition(v,{status,cost,providerAccepted:known});if(!delta.apply)return {status:v.status,reused:true};
  const old=u.data()||{};tx.set(usage,{outstandingCostMicros:(old.outstandingCostMicros||0)+delta.outstandingCostMicrosDelta,
   actualCostMicros:(old.actualCostMicros||0)+delta.actualCostMicrosDelta},{merge:true});
  tx.update(ref,{status,...(known?{cost,providerUsage:{input_tokens:input,output_tokens:output}}:{}),reconciledAt:now()});return {status};
 });}
 return {reserve,claim,settle};
}
module.exports={createStore,valid,LIMIT,RESERVE,REQUESTS,TERM,WORKSPACES};
