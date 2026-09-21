'use strict';
const {digest}=require('./lead_assistance_policy');
const fail=m=>{throw Object.assign(Error(m),{code:'failed-precondition'});};
function validateCopy(t,p){
 if(!t||typeof t.subject!=='string'||!t.subject.trim()||t.subject.length>200||/[\r\n\0]/.test(t.subject)||typeof t.body!=='string'||!t.body.trim()||t.body.length>6500||t.body.includes('\0'))return 'complete_message_required';
 const text=t.subject+' '+t.body;
 if(/INITIAL_EXPERIMENT|generation provenance|confidence score|automated workflow|AI.generated|product explanation,? business value|two.sided business.scaler model/i.test(text))return 'internal_planning_language';
 if(/guarantee|homeowners need|you (?:reached out|asked us|are interested)|we (?:completed|earned|won)|testimonial|award.winning|\$\d/i.test(text))return 'unsupported_claim_requires_owner_review';
 const urls=text.match(/https?:\/\/[^\s]+/g)||[];
 if(urls.some(u=>!p.destinations?.includes(u)))return 'destination_outside_strategy';
 return null;
}
function needCandidate(e){
 if(!e||e.reason==='Evidence window incomplete; no learning adjustment'||!e.comparable)return {ready:false,reason:'HOLD — insufficient comparable complete evidence'};
 if(e.groups.baseline.n>=20&&e.groups.alternative.n>=20&&e.groups.baseline.positive===0&&e.groups.alternative.positive===0)return {ready:true,reason:'Both approaches have at least 20 mature prospects and no qualified outcomes; prepare one new approach, not more contacts'};
 return {ready:false,reason:'Retain usable approaches; no supported preparation trigger'};
}
function createPreparation({db,now=Date.now,runOutbound=null}){
 return async(a,saved,strategyId,evidence)=>{
  const p=saved.policy,root=db.doc('businessMailboxes/'+a.businessId),stateRef=root.collection('outreachPreparation').doc(strategyId);
  if(saved.businessId!==a.businessId||saved.approvedBy!==a.businessId||saved.status!=='active'||saved.revokedAt||p.expiresAt<=now())fail('Current strategy authorization required');
  const initial={baseline:p.templates?.introduction,alternative:p.adaptiveOutreach?.alternative};
  const ids=Object.fromEntries(Object.entries(initial).filter(([,t])=>t?.subject&&t?.body).map(([kind,t])=>[kind,digest([a.businessId,strategyId,kind,t])]));
  await db.runTransaction(async tx=>{
   const policy=(await tx.get(db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`))).data();
   const refs=Object.entries(ids).map(([kind,id])=>({kind,ref:root.collection('outreachVariants').doc(id)}));
   const rows=await Promise.all(refs.map(x=>tx.get(x.ref)));
   if(policy?.digest!==saved.digest||policy.status!=='active')fail('Strategy changed');
   refs.forEach((x,i)=>{if(!rows[i].exists)tx.create(x.ref,{businessId:a.businessId,strategyId,policyVersion:saved.version||0,policyDigest:saved.digest,objective:p.adaptiveOutreach?.objective||'qualified_conversation',audiences:p.audiences||[],kind:x.kind,template:initial[x.kind],cta:'reply',contextRefs:['owner-reviewed-policy/'+(saved.version||0)],origin:p.messageOrigin==='prepared'?'maintained_business_proposal':'owner_written',validation:validateCopy(initial[x.kind],p)||'passed',authorizationSource:'owner_strategy',authorizedBy:saved.approvedBy,createdAt:now()});});
  });
  const state=(await stateRef.get()).data();
  if(state?.state==='ready'&&state.policyDigest===saved.digest){const row=(await root.collection('outreachVariants').doc(state.variantId).get()).data();if(row?.validation==='passed')return {ids:{...ids,alternative:state.variantId},alternative:row.template,experimentId:state.experimentId};}
  const trigger=needCandidate(evidence);
  if(!p.messagePreparation?.enabled||!p.messagePreparation.contextReviewed||!p.adaptiveOutreach?.enabled||!p.adaptiveOutreach.explorationEnabled||!trigger.ready||state)return {ids,limitation:state?.state||trigger.reason};
  if(runOutbound?.preflight){const blocked=await runOutbound.preflight(a);if(blocked)return {ids,limitation:blocked};}
  if(!runOutbound)return {ids,limitation:'Outbound model preparation pending provider/data/purpose activation; existing messages preserved'};
  const requestId=digest([a.businessId,strategyId,'bounded_candidate_1']),claim=await db.runTransaction(async tx=>{
   const current=(await tx.get(stateRef)).data(),policy=(await tx.get(db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`))).data();
   if(current||policy?.digest!==saved.digest||policy.status!=='active'||policy.policy.expiresAt<=now())return false;
   tx.create(stateRef,{state:'processing',requestId,businessId:a.businessId,policyDigest:saved.digest,reason:trigger.reason,startedAt:now(),attempts:1});return true;
  });
  if(!claim)return {ids,limitation:'Preparation already claimed'};
  let result;
  const recheck=async()=>{const latest=(await db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`).get()).data();if(latest?.digest!==saved.digest||latest.status!=='active'||latest.revokedAt||latest.policy.expiresAt<=now())fail('Preparation authority changed');};
  try{result=await runOutbound({a,requestId,recheck,context:{businessId:a.businessId,name:p.businessName,services:p.services,voice:p.voice,claims:p.claims,destinations:p.destinations,audiences:p.audiences||[],objective:p.adaptiveOutreach.objective},existing:initial});}catch(_){result={state:'preparation_authority_or_provider_pending'};}
  const t=result?.suggestion,reason=result?.state!=='quality_passed'?(result?.state||'preparation_failed'):t?validateCopy(t,p):'preparation_failed';
  const duplicate=t&&Object.values(initial).some(v=>digest(v)===digest({subject:t.subject,body:t.body}));
  if(reason||duplicate){await stateRef.update({state:reason||'duplicate_approach_rejected',finishedAt:now(),nextAction:'Review the preparation limitation; no automatic retry or extra spend'});return {ids,limitation:reason||'duplicate_approach_rejected'};}
  const template={subject:t.subject,body:t.body},variantId=digest([strategyId,requestId,template]),experimentId=digest([strategyId,variantId]);
  try{await db.runTransaction(async tx=>{
   const policy=(await tx.get(db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`))).data();
   if(policy?.digest!==saved.digest||policy.status!=='active'||policy.policy.expiresAt<=now())fail('Preparation authority changed');
   tx.create(root.collection('outreachVariants').doc(variantId),{businessId:a.businessId,strategyId,policyVersion:saved.version||0,policyDigest:saved.digest,objective:p.adaptiveOutreach.objective,audiences:p.audiences||[],kind:'alternative',template,cta:'reply',contextRefs:['owner-reviewed-policy/'+(saved.version||0)],origin:'openai_business_context',validation:'passed',authorizationSource:'owner_strategy',authorizedBy:saved.approvedBy,requestId,reservationId:result.reservationId||null,quality:result.quality||null,parentVariantId:ids.alternative,experimentId,createdAt:now()});
   tx.update(stateRef,{state:'ready',variantId,experimentId,finishedAt:now()});
  });}catch(error){await stateRef.update({state:'attachment_authority_changed',finishedAt:now(),nextAction:'Review current strategy; generated copy was not attached or sent'});return {ids,limitation:'attachment_authority_changed'};}
  return {ids:{...ids,alternative:variantId},alternative:template,experimentId};
 };
}
module.exports={validateCopy,needCandidate,createPreparation};
