'use strict';
// Bounded selection inside the existing Email dispatcher. No model, new sender,
// contact permission, or budget authority is created here.
const {digest}=require('./lead_assistance_policy');
const {commercial}=require('./growth_learning');
const DAY=86400000;
const OBJECTIVES=['qualified_conversation','appointment','estimate','business_signup','scaler_activation'];
function validate(p){
 const a=p?.adaptiveOutreach;if(a==null)return null;
 if(typeof a.enabled!=='boolean'||(a.explorationEnabled!=null&&typeof a.explorationEnabled!=='boolean')||Object.keys(a).some(k=>!['enabled','objective','alternative','explorationEnabled'].includes(k)))return 'adaptive_strategy_required';
 if(!a.enabled)return a.explorationEnabled===true?'comparison_requires_adaptive':null;
 const t=a.alternative,b=p.templates?.introduction;
 if(!OBJECTIVES.includes(a.objective)||!t||Object.keys(t).some(k=>!['subject','body'].includes(k))||
  typeof t.subject!=='string'||!t.subject.trim()||t.subject.length>200||/[\r\n\0]/.test(t.subject)||
  typeof t.body!=='string'||!t.body.trim()||t.body.length>6500||t.body.includes('\0')||
  !b?.subject||!b.body||digest(t)===digest(b))return 'adaptive_strategy_required';
 return null;
}
function strategy(p){return digest({objective:p.adaptiveOutreach?.objective,explorationEnabled:p.adaptiveOutreach?.explorationEnabled===true,baseline:p.templates?.introduction,alternative:p.adaptiveOutreach?.alternative,services:p.services,claims:p.claims,destinations:p.destinations,voice:p.voice,limits:p.limits,sendingDays:p.sendingDays,opensMinute:p.opensMinute,closesMinute:p.closesMinute});}
function segment(c){return digest([c.relationshipType||c.lifecycleStage||c.stage||'unspecified',c.source||'unspecified',c.serviceCategory||'unspecified',c.emailPermission?.status||'not_recorded']);}
function interval(k,n){if(!n)return [0,1];const z=1.96,q=k/n,d=1+z*z/n,m=(q+z*z/(2*n))/d,r=z*Math.sqrt(q*(1-q)/n+z*z/(4*n*n))/d;return [m-r,m+r];}
function evaluate({businessId,strategyId,segmentId,objective,operations=[],outcomes=[],now=Date.now(),truncated=false}){
 const groups={baseline:{n:0,positive:0,negative:0},alternative:{n:0,positive:0,negative:0}};
 const byId=new Map(operations.filter(o=>o.businessId===businessId&&commercial(o)).map(o=>[o.id||o.operationId,o]));
 const rootId=id=>{const seen=new Set();while(byId.has(id)&&!seen.has(id)){seen.add(id);const o=byId.get(id);if(o.assistance?.kind==='introduction')return id;const parent=o.followupTo||o.assistance?.followupTo;if(!parent)return id;id=parent;}return null;};
 const latest=new Map();for(const e of outcomes.filter(e=>e.businessId===businessId).sort((a,b)=>a.recordedAt-b.recordedAt))latest.set(e.operationId+'|'+(e.itemId||'owner'),e);
 const used=new Set(), weeks={};
 for(const o of operations.filter(o=>o.businessId===businessId&&o.state==='sent'&&commercial(o)&&(o.outreach?.experimentId||o.outreach?.strategyId)===strategyId&&o.outreach?.segmentId===segmentId&&o.assistance?.kind==='introduction').sort((a,b)=>a.requestedAt-b.requestedAt)){
  const age=now-(o.providerAcceptedAt||o.requestedAt);if(age<7*DAY||age>35*DAY)continue;
  const identity=o.outreach.identity;if(!identity||used.has(identity)||!groups[o.outreach.variant])continue;used.add(identity);
  const events=[...latest.values()].filter(e=>rootId(e.operationId)===(o.id||o.operationId)&&!e.retractedAt);
  const negative=events.some(e=>['not_interested','do_not_contact','bounced','complaint','lost'].includes(e.outcome));
  const positiveTypes=({qualified_conversation:['interested','relevant_question','appropriate_referral','appointment','estimate','won'],appointment:['appointment','attended'],estimate:['estimate','won'],business_signup:['signup','activated'],scaler_activation:['activated','first_job','completed']})[objective]||[];
  const positive=!negative&&events.some(e=>positiveTypes.includes(e.outcome));
  const g=groups[o.outreach.variant];g.n++;g.positive+=Number(positive);g.negative+=Number(negative);
  const week=Math.floor(o.requestedAt/(7*DAY));weeks[week]??={baseline:0,alternative:0};weeks[week][o.outreach.variant]++;
 }
 const b=groups.baseline,a=groups.alternative;
 // Each arm must have comparable contemporaneous samples, not old baseline vs
 // new season. Raw replies, opens and provider acceptance are never successes.
 const comparable=Object.values(weeks).every(w=>w.baseline>=5&&w.alternative>=5);
 let decision='HOLD',reason='Insufficient comparable mature evidence';
 if(!truncated&&b.n>=20&&a.n>=20&&comparable){
  if(interval(a.positive,a.n)[0]>interval(b.positive,b.n)[1]&&a.negative/a.n<=b.negative/b.n){decision='PREFER_ALTERNATIVE';reason='Qualified-outcome intervals separate; negative rate does not increase';}
  else if(interval(b.positive,b.n)[0]>interval(a.positive,a.n)[1]||a.negative/a.n>b.negative/b.n+0.1){decision='PREFER_BASELINE';reason='Baseline outcomes or negative-response evidence favor baseline';}
  else reason='Comparable evidence remains uncertain';
 }
 if(truncated)reason='Evidence window incomplete; no learning adjustment';
 return {decision,reason,groups,observationDays:7,lookbackDays:35,comparable,objective,strategyId,segmentId,networkDataUsed:false};
}
function choose(identity,strategyId,decision,explorationEnabled=false){const bucket=parseInt(digest([identity,strategyId]).slice(0,8),16)%100;
 const cutoff=decision==='PREFER_ALTERNATIVE'?25:decision==='PREFER_BASELINE'?75:explorationEnabled?80:100;
 return bucket<cutoff?'baseline':'alternative';
}
function createSelector({db,now=Date.now,prepareContent=null}){
 return async(a,context,customerId)=>{
  const p=context.saved.policy,adaptive=p.adaptiveOutreach?.enabled===true;if(!adaptive&&p.messageOrigin!=='prepared')return null;
  if(adaptive&&validate(p))throw Object.assign(Error('Review adaptive strategy'),{code:'failed-precondition'});
  const root=db.doc('businessMailboxes/'+a.businessId),strategyId=strategy(p),segmentId=segment(context.customer);
  const identity=digest(context.customer.accountId||context.customer.email.toLowerCase());
  const assignmentRef=root.collection('outreachAssignments').doc(digest([strategyId,identity]));
  const existing=await assignmentRef.get();if(existing.exists)return existing.data();
  const [ops,events]=await Promise.all([root.collection('operations').orderBy('requestedAt','desc').limit(1001).get(),root.collection('outcomes').orderBy('recordedAt','desc').limit(2001).get()]);
  const evidence={businessId:a.businessId,strategyId,segmentId,objective:p.adaptiveOutreach?.objective||'qualified_conversation',operations:ops.docs.map(d=>({id:d.id,...d.data()})),outcomes:events.docs.map(d=>d.data()),now:now(),truncated:ops.size>1000||events.size>2000};
  let decision=evaluate(evidence);
  const content=prepareContent?await prepareContent(a,context.saved,strategyId,decision):null;
  if(content?.experimentId)decision=evaluate({...evidence,strategyId:content.experimentId});

  const selected=adaptive?choose(identity,content?.experimentId||strategyId,decision.decision,p.adaptiveOutreach.explorationEnabled===true):'baseline';
  const decisionId=digest(decision),value={businessId:a.businessId,customerId,identity,strategyId,segmentId,objective:p.adaptiveOutreach?.objective||'qualified_conversation',variant:selected,...(content?.ids?.[selected]?{variantRecordId:content.ids[selected],template:selected==='alternative'?(content.alternative||p.adaptiveOutreach.alternative):p.templates.introduction,experimentId:content.experimentId||strategyId}:{}),decisionId,assignedAt:now(),policyDigest:context.saved.digest};
  return db.runTransaction(async tx=>{
   const prior=await tx.get(assignmentRef),saved=(await tx.get(db.doc(`agentPermissions/${a.businessId}_lead_generator/authorizations/business_email`))).data();
   const dref=root.collection('outreachDecisions').doc(decisionId),oldDecision=await tx.get(dref);
   if(saved?.digest!==context.saved.digest||saved.status!=='active')throw Object.assign(Error('Policy changed'),{code:'aborted'});
   if(prior.exists)return prior.data();
   if(!oldDecision.exists)tx.create(dref,{...decision,businessId:a.businessId,evaluatedAt:now()});
   tx.create(assignmentRef,value);return value;
  });
 };
}
module.exports={validate,strategy,segment,evaluate,choose,createSelector,OBJECTIVES};
