'use strict';
const DAY=86400000,WEEK=7*DAY;
const validZone=zone=>{try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format(0);return typeof zone==='string'&&!!zone;}catch{return false;}};
function setting(input,target){
 const mode=input?.mode||'fixed';
 if(!['fixed','adaptive'].includes(mode)||!Number.isSafeInteger(target)||target<1)throw Error('Choose a positive weekly target and fixed or adaptive cadence.');
 return {mode,adjustmentPolicy:'performance_evidence',observationDays:28};
}
function valid(config,providers){return !config || (config.version===1&&['fixed','adaptive'].includes(config.mode)&&validZone(config.timeZone)&&config.adjustmentPolicy==='performance_evidence'&&Number.isFinite(config.authorizedAt)&&providers.every(p=>Number.isSafeInteger(config.platforms?.[p]?.currentPerWeek)&&config.platforms[p].currentPerWeek>=1));}
function current(policy,provider){return policy?.cadence?.platforms?.[provider]?.currentPerWeek??policy.maxPerWeek;}
function initialize({scope,now}){
 return {version:1,mode:scope.cadenceSettings.mode,adjustmentPolicy:'performance_evidence',
  authorizedAt:now,effectiveAt:now,timeZone:scope.timeZone,
  platforms:Object.fromEntries(scope.providers.map(p=>[p,{currentPerWeek:scope.maxPerWeek,lastEvaluatedAt:null,nextEvaluationAt:now+WEEK,
   decision:'HOLD',reason:'Initial target; waiting for comparable published-post evidence.',confidence:'LOW'}]))};
}
function evaluate({uid,provider,policy,observations,now}){
 const config=policy.cadence,previous=current(policy,provider);
 const qualified=observations.filter(r=>typeof r.format==='string'&&r.format&&r.paidPromotion===false);
 // Never combine formats or infer that an unknown promotion flag means organic.
 const formats=[...new Set(qualified.map(r=>r.format))];
 const evaluateRows=rows=>require('./social_customer_cadence').recommend({uid,provider,observations:rows,now});
 const groups=formats.map(format=>({format,result:evaluateRows(qualified.filter(r=>r.format===format))}));
 const enough=groups.filter(g=>g.result.recentSample>=8&&g.result.previousSample>=8);
 let result={decision:'HOLD',reason:'Need comparable organic, same-format, seven-day post results in both observation windows.',confidence:'LOW'};
 if(enough.length===1)result=enough[0].result;
 else if(enough.length>1)result={decision:'HOLD',reason:'Multiple formats need further comparable evidence before changing the overall platform cadence.',confidence:'LOW'};
 if(now-Math.max(config.authorizedAt,config.platforms[provider]?.lastAdjustedAt||0)<28*DAY)result={...result,decision:'HOLD',reason:'Initial 28-day observation period is still in progress.',confidence:'LOW'};
 let target=previous;
 if(config.mode==='adaptive' && Number.isFinite(result.performanceRatio)) {
  // A proportional, damped response to observed performance, never a one-post
  // cap or a promise of causation. Supply/rate/quality gates still own execution.
  if(result.decision==='INCREASE')target=Math.ceil(previous*Math.sqrt(result.performanceRatio));
  if(result.decision==='REDUCE')target=Math.max(1,Math.floor(previous*Math.sqrt(result.performanceRatio)));
  if(!Number.isSafeInteger(target))target=previous;
 }

 return {provider,previousPerWeek:previous,currentPerWeek:target,decision:target===previous?'HOLD':result.decision,
  reason:config.mode!=='adaptive'?'Fixed cadence: changes require owner authorization.':result.reason,
  confidence:result.confidence,lastAdjustedAt:target!==previous?now:(config.platforms[provider]?.lastAdjustedAt||null),lastEvaluatedAt:now,nextEvaluationAt:now+WEEK,
  evidence:{observations:observations.length,comparableObservations:qualified.length,formats:groups.map(g=>({format:g.format,recent:g.result.recentSample,prior:g.result.previousSample,decision:g.result.decision})),
   method:'Equal-age 7-day organic results; same format; two 28-day windows; minimum 8 posts each. Provisional association, not causal proof.'}};
}
async function loadObservations(db,uid,read=r=>r.get()){
 const names=['socialMetaMeasurementSnapshots','socialMetaMeasurementJobs','socialContentQualityAssessments','socialGrowthJobs'];
 const sets=await Promise.all(names.map(n=>read(db.collection(n).where('businessUid','==',uid).limit(301))));
 if(sets.some(s=>s.size>300))return [];
 const jobs=new Map(sets[1].docs.map(d=>[d.id,d.data()])),quality=new Map(sets[2].docs.map(d=>[d.id,d.data()]));
 const publications=new Map(sets[3].docs.map(d=>[d.id,d.data()]));
 return sets[0].docs.map(d=>{const row=d.data(),q=quality.get(row.contentVersionId+'_'+row.provider)||quality.get(row.contentVersionId);
 const valid=q?.businessUid===uid&&q.immutableSourceHash===row.contentHash;
 const measurement=jobs.get(d.id),publication=publications.get(row.publicationJobId);
 const publicationValid=publication?.businessUid===uid&&publication.provider===row.provider&&publication.status==='published'&&publication.binding?.contentHash===row.contentHash;
 const lag=Date.parse(row.observedAt)-Date.parse(measurement?.scheduledFor);
 return {...row,format:publicationValid?publication.binding.variants?.find(v=>v.provider===row.provider)?.format:undefined,
  hoursAfterPublication:publicationValid&&measurement?.hoursAfterPublication===168&&lag>=0&&lag<=6*3600000?168:undefined,qualityReady:valid&&q.readyToPublish===true,
  fatigueObserved:valid?q.variantAssessments?.find(v=>v.provider===row.provider)?.repetition?.repeated:undefined};});
}
async function run({db,uid,now=Date.now()}){
 return db.runTransaction(async tx=>{
 const ref=db.doc('socialManagedPolicies/'+uid),policy=(await tx.get(ref)).data();
 if(!policy?.cadence)return {status:'legacy_fixed'};
 const plan=(await tx.get(db.doc('socialContentPlans/'+policy.planId))).data();
 require('./social_bounded_authority').assertRuntimePolicy({uid,policy,plan,approval:{businessUid:uid,planId:policy.planId,managedPolicyId:policy.id,managedStrategyDigest:policy.strategyDigest},now});
 const due=policy.providers.filter(p=>(policy.cadence.platforms[p]?.nextEvaluationAt??Infinity)<=now);
 if(!due.length)return {status:'not_due'};
 const health=(await tx.get(db.doc('agentHealth/'+uid))).data();
 if(health?.killSwitchActive===true)throw Error('managed_social_safety_hold');
 if(!await require('./social_customer_enrollment').authorized({db,uid,read:r=>tx.get(r),now}))throw Error('managed_social_entitlement_required');
 const observations=await loadObservations(db,uid,r=>tx.get(r));
 const cadence={...policy.cadence,platforms:{...policy.cadence.platforms}};
 for(const provider of due){
  const result=evaluate({uid,provider,policy,observations:observations.filter(r=>r.businessUid===uid&&r.provider===provider),now});
  cadence.platforms[provider]=result;
  const id=require('./social_growth_cycle').hash({uid,policy:policy.id,provider,due:policy.cadence.platforms[provider].nextEvaluationAt});
  tx.create(db.doc('socialManagedCadenceAudit/'+id),{businessUid:uid,policyId:policy.id,authorizationAt:cadence.authorizedAt,source:'recurring_cadence_evaluation',...result});
 }
 tx.update(ref,{cadence});return {status:'evaluated',providers:due};
 });
}
module.exports={DAY,WEEK,valid,validZone,setting,current,initialize,evaluate,loadObservations,run};
