'use strict';
// Only events already attributed to this workspace may enter this projection.
// No mailbox text, contact information or network data is used as training input.
const FEATURES=['industry','companyType','geography','serviceFit','prospectType','channel','messageAngle','cta','sourceClass'];
const OUTCOMES=['interested','not_interested','follow_up_required','meeting','appointment','estimate','won','signup','paid','activated','approved','first_job','completed','do_not_contact','bounced'];
function featuresFor(p) {return {
  industry:typeof p.category==='string'?p.category.slice(0,120):p.industry||'unspecified',companyType:p.opportunityType||'unspecified',
  geography:p.serviceArea?.locality||p.serviceArea?.label||'unspecified',serviceFit:p.fit||'unspecified',prospectType:p.kind||'unspecified',
  sourceClass:p.source||'unspecified',...Object.fromEntries(FEATURES.filter(k=>typeof p.learningFeatures?.[k]==='string').map(k=>[k,p.learningFeatures[k].slice(0,120)]))};}
const underperforming=g=>g.negative>=3&&g.negative/g.sent>=0.6||g.noReplyAfterFiveDays>=5&&g.noReplyAfterFiveDays/g.sent>=0.8;
function project({businessId,operations=[],outcomes=[],prospects=[],now=Date.now(),funnel='services'}) {
  const ops=operations.filter(o=>o.businessId===businessId&&!o.certification),events=outcomes.filter(e=>e.businessId===businessId&&OUTCOMES.includes(e.outcome)&&ops.some(o=>o.id===e.operationId&&o.state==='sent'));
  const latest=new Map();for(const e of events.sort((a,b)=>a.recordedAt-b.recordedAt))latest.set(e.operationId,e);
  const byFeature=new Map();
  for(const o of ops.filter(o=>o.state==='sent'))for(const feature of FEATURES) {
    const value=o.features?.[feature];if(!value||value==='unspecified'||typeof value!=='string')continue;
    const key=feature+'\0'+value,g=byFeature.get(key)||{feature,value,sent:0,replied:0,positive:0,negative:0,noReplyAfterFiveDays:0};
    g.sent++;if(o.replyCount>0)g.replied++;
    const outcome=latest.get(o.id)?.outcome;
    if(['interested','meeting','appointment','won','paid','activated','completed'].includes(outcome))g.positive++;
    if(['not_interested','do_not_contact','bounced'].includes(outcome))g.negative++;
    if(!o.replyCount&&now-o.requestedAt>=5*86400000)g.noReplyAfterFiveDays++;
    byFeature.set(key,g);
  }
  const patterns=[...byFeature.values()].filter(g=>g.sent>=3).map(g=>({...g,
    recommendation:underperforming(g)?'Review other patterns; recent outcomes are weak':g.positive>=2?'Review similar opportunities':'Collect more verified outcomes'}));
  return {sent:ops.filter(o=>o.state==='sent').length,replied:ops.filter(o=>o.replyCount>0).length,patterns,
    outcomeCounts:Object.fromEntries(OUTCOMES.map(o=>[o,[...latest.values()].filter(e=>e.outcome===o).length])),
    learningBasis:patterns.length?'Confirmed sends and replies with owner-recorded outcomes; small samples are directional.':'Not enough confirmed sends and recorded local outcomes yet.',
    funnel:({services:['Found','Qualified','Contacted','Reply','Appointment','Estimate','Won','Revenue'],business:['Found','Qualified','Contacted','Meeting','Signup','Paid','Activated'],scaler:['Found','Qualified','Contacted','Signup','Approved','First Job','Completed']})[funnel]||[],
    followups:ops.filter(o=>o.state==='sent'&&!o.replyCount&&now-o.requestedAt>=5*86400000&&!latest.has(o.id)&&
      prospects.some(p=>p.id===o.prospectId&&p.businessUid===businessId&&!p.doNotContact&&!p.excludedByGrowthPreferences))
      .map(o=>({operationId:o.id,prospectId:o.prospectId,action:'Review a follow-up',automaticSend:false})),
    similarProspects:prospects.filter(p=>p.businessUid===businessId&&!p.doNotContact&&!p.excludedByGrowthPreferences&&p.qualified)
      .map(p=>({prospectId:p.id,matchedPatterns:patterns.filter(g=>g.positive>=2&&featuresFor(p)[g.feature]===g.value).map(g=>({feature:g.feature,value:g.value,sent:g.sent,positive:g.positive}))}))
      .filter(p=>p.matchedPatterns.length),networkDataUsed:false,automaticSending:false};
}
function priority(row,patterns=[]) {
  const facts=featuresFor(row);
  return patterns.filter(g=>facts[g.feature]===g.value).reduce((score,g)=>score+(underperforming(g)?-2:g.positive>=2?1:0),0);
}
module.exports={FEATURES,OUTCOMES,project,featuresFor,priority};
