'use strict';
// Topic branch of the existing rolling planner, not a new agent. Educational
// briefs stay inside the owner's reviewed software-product strategy. Stable
// semantic topic IDs prevent wording changes or renewed policies faking novelty.
const {hash}=require('./social_growth_cycle');
const cadence=require('./social_cadence_policy');
const normalize=s=>String(s||'').toLowerCase().trim();
const THEMES=['Product explanation','Business value','Business and Scaler roles'];
const topics=[
 ['campaign-format','Product explanation','Choose the work format','Speaking with people and distributing printed materials are different kinds of work. Define the intended activity before choosing a campaign format. A distribution task should not quietly become a conversation requirement.','how-it-works'],
 ['qualified-response','Business value','Ask a useful follow-up question','A reply starts a conversation; it does not establish a qualified opportunity. Ask what help is needed, where the work is and what timing matters before treating the response as a fit.','businesses'],
 ['read-work-terms','Business and Scaler roles','Read the assignment before accepting','Before accepting field work, read the exact activity, area, compensation and completion requirements. Ask about anything unclear before committing. Paid-work opportunities are not yet generally available on ScaledCircle.','scalers'],
 ['cost-components','Product explanation','Understand a campaign budget','Worker compensation and platform costs serve different purposes. Review the complete campaign quote before funding, and distinguish money reserved for work from compensation actually earned.','how-it-works'],
 ['capacity-fit','Business value','Match outreach to capacity','Before starting outreach, decide what kind of work your Business can realistically take on. A useful inquiry fits your services, location and capacity, not just a large contact count.','businesses'],
 ['site-safety','Business and Scaler roles','Set clear access boundaries','Field assignments should identify permitted areas and limits. Do not assume a route grants access to private property or permission to enter a building. Resolve unclear access instructions before work. ScaledCircle paid-work opportunities are not yet generally available.','scalers'],
 ['property-signal','Product explanation','Separate geographic fit from demand','Property and geographic signals can help compare areas. They do not establish that a particular resident wants a service. Treat an area recommendation as a planning input, not a list of promised customers.','how-it-works'],
 ['followup-context','Business value','Keep the relationship context','A past inquiry, an estimate discussion and a completed project are different relationships. Review the prior conversation before deciding whether another message is relevant. More outreach is not automatically better follow-up.','businesses'],
 ['evidence-privacy','Business and Scaler roles','Keep completion evidence relevant','Completion evidence should show the requested work without unnecessarily including private contact details, faces or information unrelated to the assignment. Follow the agreed evidence requirements and respect privacy.','scalers'],
 ['bonus-conditions','Product explanation','Make bonus conditions explicit','A base amount and a conditional bonus should be understandable before work is accepted. Review what is guaranteed by the job terms and what must be satisfied to earn a bonus; do not treat an unearned bonus as paid.','how-it-works'],
 ['one-next-action','Business value','Choose one clear next action','A message is easier to act on when the next step is clear. Decide whether the goal is to explain a service, invite a question or direct someone to more information, then check that the destination matches that goal.','businesses'],
 ['completion-versus-review','Business and Scaler roles','Understand completion and review','Submitting work and having it reviewed are separate steps. Check the assignment requirements, submit the requested evidence and use the agreed review process to resolve questions. Submission alone is not a promise of approved earnings.','scalers'],
 ['material-readiness','Product explanation','Prepare materials before distribution','For a material-distribution campaign, quantity, legibility and handoff arrangements matter before the route begins. Check that the intended materials are ready and that the task describes what is being distributed.','how-it-works'],
 ['compare-like-results','Business value','Compare like with like','Compare campaigns with their goal, area, timing and workload in view. A difference in response is worth examining, but it does not by itself prove which single change caused the result.','businesses'],
 ['earning-versus-payment','Business and Scaler roles','Distinguish earnings from payment','An approved earning, an available balance and a completed bank payment are different states. Check the recorded status of each step rather than treating a submitted job or pending transfer as money received.','scalers'],
 ['strategy-versus-post','Product explanation','Separate strategy from execution','A marketing strategy sets direction. Specific content still needs truthful claims, a working destination and a valid publishing path. A connected account alone does not explain what a Business has authorized.','how-it-works'],
 ['contact-respect','Business value','Respect contact preferences','Relevant outreach starts with the relationship and contact preferences. Respect an unsubscribe or request not to be contacted, and avoid repeating the same message across channels simply because another channel is available.','businesses'],
 ['unexpected-work','Business and Scaler roles','Handle a changed assignment','If the requested work changes, clarify the new scope through the agreed Business process. Do not assume extra tasks or changed compensation are part of the original agreement. Paid-work opportunities are not yet generally available on ScaledCircle.','scalers'],
];
function coverage({uid,policy,items,versions,jobs,now}){
 const platforms={};
 for(const provider of policy.providers){
  const weekly=cadence.current(policy,provider),target=Math.max(2,weekly+1);
  let planned=0,held=0;
  for(const item of items.filter(i=>i.businessUid===uid&&i.planId===policy.planId)){
   const v=versions.find(v=>v.id===item.id+'_v'+(item.platformVersions?.[provider]??item.currentVersion));
   if(!v?.variants?.some(v=>v.provider===provider))continue;
   if(jobs.some(j=>j.businessUid===uid&&j.provider===provider&&j.versionId?.startsWith(item.id+'_v')))continue;
   if(item.managedHolds?.[provider]){held++;continue;}planned++;
  }
  const scheduled=jobs.filter(j=>j.businessUid===uid&&j.provider===provider&&j.versionId?.startsWith(policy.planId+'_')&&['approved','scheduled'].includes(j.status)&&Date.parse(j.scheduledFor)>now&&Date.parse(j.scheduledFor)<=now+7*86400000).length;
  platforms[provider]={currentPerWeek:weekly,planningBuffer:target,plannedUnscheduled:planned,ownerHeld:held,scheduledNextSevenDays:scheduled,planningShortfall:Math.max(0,target-planned-scheduled),scheduledShortfall:Math.max(0,weekly-scheduled)};
 }
 return {asOf:now,platforms,note:'Planned topics are not publication-ready posts. Creative, quality, budget and provider checks still apply; no additional spending is authorized.'};
}
function choose(args){
 const {uid,policy,plan,profile,connections,items,versions,jobs,now}=args;
 const report=coverage(args);
 if(profile?.businessUid!==uid||plan?.businessUid!==uid||plan.strategy?.version!=='InternalMetaManagedStrategyV1'||profile.internalSocialContext?.source!=='owner_reviewed_meta_strategy'||profile.businessName!==policy.reviewedScope?.businessName||profile.brandVoice!==policy.reviewedScope?.voice)return {status:'context_changed',coverage:report};
 const used=new Set(items.filter(i=>i.businessUid===uid).map(i=>i.managedTopicId||i.managedDraft?.topicId).filter(Boolean));
 const allowed=topics.filter(t=>policy.services.includes(normalize(t[1]))&&policy.destinations.includes('https://scaledcircle.com/'+t[4]));
 const unused=allowed.filter(t=>!used.has('scaledcircle:'+t[0]));
 report.unusedSemanticTopics=unused.length;
 if(!Object.values(report.platforms).some(p=>p.planningShortfall>0))return {status:'planning_buffer_covered',coverage:report};
 if(items.length>=60||versions.length>=90||jobs.length>=90)return {status:'history_limit',coverage:report};
 const topic=unused[0];if(!topic)return {status:'fresh_topics_exhausted',coverage:report,message:'The reviewed topic supply is exhausted. More distinct, supported context is needed; no filler or repeated topic will be generated.'};
 const slots=policy.providers.map(provider=>({provider,at:require('./social_bounded_authority').nextSlot({policy,history:jobs,provider,now})})).filter(s=>s.at&&connections.some(c=>c.provider===s.provider&&(c.businessUid==null||c.businessUid===uid)&&c.status==='connected_write'&&c.tokenHealth==='healthy'));
 if(!slots.length)return {status:'cadence_or_connection_limited',coverage:report};
 const [key,service,title,copy,path]=topic,topicId='scaledcircle:'+key,itemKey='managed_topic_'+hash({uid,topicId}).slice(0,32);
 const item={itemKey,topicId,pillar:service+' - '+title,goal:service+': '+title,scheduledFor:slots[0].at,
  variants:slots.map(s=>({provider:s.provider,format:'feed',copy,callToAction:'Learn more',destinationUrl:'https://scaledcircle.com/'+path,mediaRequirement:'Prepare a distinct branded explanation of '+title+'. No completed-work photographs, fictional people or invented results. Existing creative allowance and unrelated-source cooldown apply.'}))};
 return {status:'draft_created',itemId:policy.planId+'_'+itemKey,item,service,topicId,coverage:report};
}
module.exports={choose,coverage,topics,THEMES};
