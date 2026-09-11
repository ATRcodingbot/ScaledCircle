'use strict';
// Recommendations only. No write, scheduling, approval or provider authority.
const startingCopy='Starting cadence: 2 posts per week per platform. Social Manager will measure performance and recommend adjustments as real results accumulate.';
function recommend({uid,provider,observations=[],now=Date.now(),policy=null}) {
  const unique=new Map();
  for(const row of observations) {
    const at=Date.parse(row.observedAt);
    if(row.businessUid!==uid || row.provider!==provider || row.source!=='meta_graph_read_only' ||
      row.scope!=='post' || row.hoursAfterPublication!==168 || !row.publicationJobId ||
      !Number.isFinite(at) || at>now || at<now-56*86400000)continue;
    const metrics={};
    for(const m of row.metrics||[])if(m.status==='OBSERVED' && m.period==='lifetime' && Number.isFinite(m.value) && m.value>=0)metrics[m.name]=m.value;
    // Compare equal-age post observations only; missing metrics are unknown.
    if(!Number.isFinite(metrics.reach)||metrics.reach<=0 || !Number.isFinite(metrics.total_interactions))continue;
    if(!unique.has(row.publicationJobId) || at>Date.parse(unique.get(row.publicationJobId).observedAt))unique.set(row.publicationJobId,{...row,metrics});
  }
  const rows=[...unique.values()],recent=rows.filter(r=>Date.parse(r.observedAt)>=now-28*86400000),prior=rows.filter(r=>Date.parse(r.observedAt)<now-28*86400000);
  const rate=rs=>rs.reduce((a,r)=>a+r.metrics.total_interactions,0)/rs.reduce((a,r)=>a+r.metrics.reach,0);
  let decision='HOLD',reason='More comparable published-post evidence is needed.',confidence='LOW';
  if(recent.length>=8 && prior.length>=8 && rate(prior)>0) {
    confidence='MODERATE';
    const change=rate(recent)/rate(prior)-1;
    const quality=recent.every(r=>r.qualityReady===true && r.fatigueObserved===false);
    const ctaKnown=rows.every(r=>Number.isFinite(r.metrics.link_clicks));
    const cta=rs=>rs.reduce((a,r)=>a+r.metrics.link_clicks,0)/rs.reduce((a,r)=>a+r.metrics.reach,0);
    if(change>=0.2 && quality && ctaKnown && cta(recent)>=cta(prior)) {decision='INCREASE';reason='Comparable engagement improved without weaker measured link response or recorded quality/fatigue concerns. Review a small cadence experiment.';}
    else if(change<=-0.2 && recent.some(r=>r.fatigueObserved===true)) {decision='REDUCE';reason='Comparable engagement declined alongside recorded repetition or fatigue. Review a lower-cadence experiment.';}
    else reason='Hold the current cadence while reviewing quality, response and timing. Higher volume is not evidence of better results.';
  }
  const range=policy?.businessUid===uid && policy.approvedByUid===uid && policy.mode==='bounded_managed' &&
    Number.isInteger(policy.minPerWeek)&&Number.isInteger(policy.maxPerWeek)&&policy.minPerWeek>=1&&policy.maxPerWeek>=policy.minPerWeek&&policy.maxPerWeek<=7&&policy.revokedAt==null
    ? {min:policy.minPerWeek,max:policy.maxPerWeek}:null;
  return {provider,decision,reason,confidence,startingPerWeek:2,approvedRange:range,
    recentSample:recent.length,previousSample:prior.length,ownerApprovalRequired:true,
    automaticAdjustmentEnabled:false,method:'Equal-age 7-day observations; two 28-day windows; at least 8 distinct posts per window. Recommendations are provisional.',
    missingSignals:['Follower growth, leads, format and timing remain unknown unless separately measured.']};
}
module.exports={startingCopy,recommend};
