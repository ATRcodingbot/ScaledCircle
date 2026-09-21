'use strict';
// Only events already attributed to this workspace may enter this projection.
// No mailbox text, contact information or network data is used as training input.
const FEATURES=['industry','companyType','geography','serviceFit','prospectType','channel','messageAngle','cta','sourceClass'];
const OUTCOMES=['interested','not_interested','follow_up_required','meeting','appointment','estimate','won','lost','signup','paid','activated','approved','first_job','completed','do_not_contact','bounced'];
function featuresFor(p) {return {
  industry:typeof p.category==='string'?p.category.slice(0,120):p.industry||'unspecified',companyType:p.opportunityType||'unspecified',
  geography:p.serviceArea?.locality||p.serviceArea?.label||'unspecified',serviceFit:p.fit||'unspecified',prospectType:p.kind||'unspecified',
  sourceClass:p.source||'unspecified',...Object.fromEntries(FEATURES.filter(k=>typeof p.learningFeatures?.[k]==='string').map(k=>[k,p.learningFeatures[k].slice(0,120)]))};}
// Non-response and small samples are not evidence for deprioritizing a category.
const underperforming=g=>g.sent>=20&&g.negative>=12&&g.negative/g.sent>=0.6;
const commercial=o=>!o.certification&&!o.fixture&&!o.controlledTest&&!/Founder-controlled (?:test|software certification)|Founder-approved demonstration|controlled Email assistance test/i.test((o.subject||'')+' '+(o.body||''));
function project({businessId,operations=[],outcomes=[],prospects=[],replies=[],now=Date.now(),funnel='services'}) {
  const ops=operations.filter(o=>o.businessId===businessId&&commercial(o)),events=outcomes.filter(e=>e.businessId===businessId&&OUTCOMES.includes(e.outcome)&&ops.some(o=>o.id===e.operationId&&o.state==='sent'));
  const latest=new Map();for(const e of events.sort((a,b)=>a.recordedAt-b.recordedAt))latest.set(e.operationId,e);
  const byFeature=new Map();
  for(const o of ops.filter(o=>o.state==='sent'))for(const feature of FEATURES) {
    const value=o.features?.[feature];if(!value||value==='unspecified'||typeof value!=='string')continue;
    const key=feature+'\0'+value,g=byFeature.get(key)||{feature,value,sent:0,replied:0,positive:0,negative:0,noReplyAfterFiveDays:0};
    g.sent++;if(o.replyCount>0)g.replied++;
    const outcome=latest.get(o.id)?.outcome;
    if(['interested','meeting','appointment','won','paid','activated','completed'].includes(outcome))g.positive++;
    if(['not_interested','lost','do_not_contact','bounced'].includes(outcome))g.negative++;
    if(!o.replyCount&&now-o.requestedAt>=5*86400000)g.noReplyAfterFiveDays++;
    byFeature.set(key,g);
  }
  const patterns=[...byFeature.values()].filter(g=>g.sent>=3).map(g=>({...g,
    recommendation:underperforming(g)?'Review other patterns; recent outcomes are weak':g.sent>=20&&g.positive>=5?'Review similar opportunities; observational evidence only':'Collect more verified outcomes'}));
  return {evidence:evidence({businessId,operations:ops,outcomes:events,replies,now}),sent:ops.filter(o=>o.state==='sent').length,replied:ops.filter(o=>o.replyCount>0).length,patterns,
    outcomeCounts:Object.fromEntries(OUTCOMES.map(o=>[o,[...latest.values()].filter(e=>e.outcome===o).length])),
    learningBasis:'Provider acceptance is not confirmed delivery. Results below are observational and Business-specific; no adaptive message selection is active.',
    funnel:({services:['Found','Qualified','Contacted','Reply','Appointment','Estimate','Won','Revenue'],business:['Found','Qualified','Contacted','Meeting','Signup','Paid','Activated'],scaler:['Found','Qualified','Contacted','Signup','Approved','First Job','Completed']})[funnel]||[],
    followups:ops.filter(o=>o.state==='sent'&&!o.replyCount&&now-o.requestedAt>=5*86400000&&!latest.has(o.id)&&
      prospects.some(p=>p.id===o.prospectId&&p.businessUid===businessId&&!p.doNotContact&&!p.excludedByGrowthPreferences))
      .map(o=>({operationId:o.id,prospectId:o.prospectId,action:'Review a follow-up',automaticSend:false})),
    similarProspects:prospects.filter(p=>p.businessUid===businessId&&!p.doNotContact&&!p.excludedByGrowthPreferences&&p.qualified)
      .map(p=>({prospectId:p.id,matchedPatterns:patterns.filter(g=>g.sent>=20&&g.positive>=5&&featuresFor(p)[g.feature]===g.value).map(g=>({feature:g.feature,value:g.value,sent:g.sent,positive:g.positive}))}))
      .filter(p=>p.matchedPatterns.length),networkDataUsed:false,automaticSending:false};
}
function priority(row,patterns=[]) {
  const facts=featuresFor(row);
  return patterns.filter(g=>facts[g.feature]===g.value).reduce((score,g)=>score+(underperforming(g)?-2:g.sent>=20&&g.positive>=5?1:0),0);
}
// These are deduplicated observations, not causal winners or execution authority.
function evidence({businessId,operations=[],outcomes=[],replies=[],now=Date.now()}) {
 const ops=operations.filter(o=>o.businessId===businessId&&commercial(o));
 const accepted=ops.filter(o=>o.state==='sent');const byId=new Map(accepted.map(o=>[o.id||o.operationId,o]));
 const identity=o=>o.crmCustomerId||o.prospectId||o.recipient||o.id||o.operationId;
 const conversations=new Map();for(const o of accepted){const key=identity(o);const list=conversations.get(key)||[];list.push(o);conversations.set(key,list);}
 const current=new Map();for(const e of outcomes.filter(e=>e.businessId===businessId&&byId.has(e.operationId)).sort((a,b)=>a.recordedAt-b.recordedAt))current.set(e.operationId+'|'+(e.itemId||'owner'),e);
 const uniqueReplies=new Map();for(const r of replies)if(r.businessId===businessId&&!r.certification&&byId.has(r.operationId)&&r.providerMessageId)uniqueReplies.set(r.providerMessageId,r);
 const rows=[...conversations.values()].map(list=>{const ids=new Set(list.map(o=>o.id||o.operationId));return {ops:list,events:[...current.values()].filter(e=>ids.has(e.operationId)&&!e.retractedAt),replies:[...uniqueReplies.values()].filter(r=>ids.has(r.operationId))};});
 const has=(r,types)=>r.events.some(e=>types.includes(e.outcome));
 const qualified=r=>has(r,['interested','meeting','appointment','estimate','won'])&&!has(r,['not_interested','do_not_contact','bounced','lost'])&&!r.replies.some(x=>['opt_out','bounce'].includes(x.classification));
 const mature=r=>now-Math.min(...r.ops.map(o=>o.providerAcceptedAt??o.requestedAt??now))>=7*86400000;
 const count=fn=>rows.filter(fn).length;
 return {mode:'fixed_message',adaptiveExecution:false,decision:'HOLD',reason:'No authorized adaptive strategy or comparable experiment is applied.',
  providerAcceptedMessages:accepted.length,confirmedDeliveredMessages:accepted.filter(o=>o.delivered===true&&o.deliveryEvidence).length,
  queuedMessages:ops.filter(o=>['queued','sending','needs_reconciliation'].includes(o.state)).length,
  distinctProspects:rows.length,observationDays:7,matureProspects:count(mature),
  humanReplyConversations:count(r=>r.replies.some(x=>x.classification==='substantive')),
  qualifiedConversations:count(qualified),appointments:count(r=>has(r,['appointment','meeting'])),
  estimates:count(r=>has(r,['estimate'])),ownerReportedWins:count(r=>has(r,['won'])),
  notInterested:count(r=>has(r,['not_interested'])),optOut:count(r=>has(r,['do_not_contact'])||r.replies.some(x=>x.classification==='opt_out')),
  bounces:count(r=>has(r,['bounced'])||r.replies.some(x=>x.classification==='bounce')),
  automatedConversations:count(r=>r.replies.some(x=>['automated_reply','newsletter','automated_notice'].includes(x.classification))),
  uncertainConversations:count(r=>(r.replies.some(x=>x.classification==='substantive')||r.ops.some(o=>o.replyCount>0))&&!r.events.length),
  noResponseYet:count(r=>!r.replies.length&&!r.events.length&&!r.ops.some(o=>o.replyCount>0)),
  revenueVerified:false,attribution:'Exact immutable operation/version; outcomes are owner-reported unless linked authoritative evidence states otherwise.',
  uncertainty:'Loaded records only. Missing reply classifications or delivery receipts remain unknown. Follow-ups and repeated sync do not create additional prospects. No winner or causal effect is inferred.'};
}
module.exports={FEATURES,OUTCOMES,project,featuresFor,priority,evidence,commercial};
