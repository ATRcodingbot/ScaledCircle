"use strict";
// Planning only: no people, seats, assignments, contracts or financial authority.
const VERSION='OwnTeamCapacityV1';
const fail=message=>{throw Object.assign(Error(message),{code:'invalid-argument'});};
function requirement(input) {
  const sessionHours=require('./campaign_workload_authority').hours(input?.sessionHours);
  const marketerCount=input?.marketerCount,coveragePattern=input?.coveragePattern;
  if(!Number.isSafeInteger(marketerCount)||marketerCount<1)fail('Enter a positive whole number of marketers.');
  if(!['split_streets','stay_together'].includes(coveragePattern))fail('Choose how your team will cover the area.');
  const requestedMinutes=sessionHours*60*(coveragePattern==='split_streets'?marketerCount:1);
  if(!Number.isFinite(requestedMinutes)||requestedMinutes>Number.MAX_SAFE_INTEGER)fail('The combined planning target is too large.');
  return {version:VERSION,sessionHours,requestedHours:sessionHours,marketerCount,coveragePattern,
    requestedMinutes,targetPersonHours:requestedMinutes/60,requiredZoneCount:null,
    durationMeaning:'per_person_session',headcountIsAssignment:false};
}
function allocate(input,sections) {
  const r=requirement(input),seen=new Set();
  for(const s of sections) for(const f of s.features||[]) {
    const id=String(f.addressKey||f.id||f.sourceId||`${f.latitude},${f.longitude}`);
    if(seen.has(id))fail('Overlapping targets need review before team allocation.');seen.add(id);
  }
  const supportedMinutes=sections.reduce((n,s)=>n+s.workload.estimatedMinutes,0);
  if(sections.some(s=>!Number.isFinite(s.workload?.estimatedMinutes)||s.workload.estimatedMinutes<=0))fail('Current section workload evidence is required.');
  // Whole sections, largest first: retain uneven loads, never invent connectors.
  // Only occupied lanes are materialized, so arbitrary headcount cannot allocate
  // unbounded memory or create people records.
  const lanes=[];
  for(const section of [...sections].sort((a,b)=>b.workload.estimatedMinutes-a.workload.estimatedMinutes||a.id.localeCompare(b.id))) {
    let lane=r.coveragePattern==='stay_together'?lanes[0]:
      lanes.length<r.marketerCount?null:[...lanes].sort((a,b)=>a.minutes-b.minutes||a.lane-b.lane)[0];
    if(!lane){lane={lane:lanes.length+1,minutes:0,sectionIds:[]};lanes.push(lane);}
    lane.minutes+=section.workload.estimatedMinutes;lane.sectionIds.push(section.id);
  }
  return {...r,supportedMinutes,supportedPersonHours:supportedMinutes/60,
    coverageSectionCount:sections.length,allocations:lanes,
    estimatedFieldElapsedMinutes:lanes.length?Math.max(...lanes.map(l=>l.minutes)):null,
    estimatedElapsedMinutes:null,sharedTravelMinutes:null,
    shortfallMinutes:Math.max(0,r.requestedMinutes-supportedMinutes),
    limitations:['Whole-section allocation is advisory; travel between sections and local access are not verified.',
      'Field-only elapsed time reflects the busiest planned lane. Total elapsed session time is unknown.',
      ...(r.coveragePattern==='stay_together'?['Staying together does not multiply unique coverage; no group efficiency is assumed.']:[])]};
}
function summary(c,zones) {
  let r;try {if(c.campaignWorkload?.version!==VERSION)throw Error('legacy');r=requirement(c.campaignWorkload);}catch(_) {
    return {executionMode:'own_team',ready:false,requiredZoneCount:null,validZoneCount:0,
      legacyAdjustmentRequired:!!c.campaignWorkload,reason:'Review session duration, marketer count and coverage pattern. Saved areas remain unchanged.'};
  }
  const clipping=require('polygon-clipping');
  const polygon=points=>[[[...points,points[0]].map(p=>[p.longitude,p.latitude])]];
  const overlap=zones.some((z,i)=>zones.slice(i+1).some(other=>{
    try{return clipping.intersection(polygon(z.serviceArea),polygon(other.serviceArea)).length>0;}catch(_){return true;}
  }));
  const valid=zones.filter(z=>z.businessId===c.businessId&&(!c.id||z.campaignId===c.id)&&require('./campaign_workload_authority').validEvidence(z));
  let allocation=null;
  try {if(overlap)throw Error('overlapping_coverage');allocation=allocate(r,valid.map(z=>({id:z.id,features:z.smartZonePlanningTargets?.features||[],workload:{estimatedMinutes:z.zoneIntelligence.workload.minutes}})));}catch(_) {}
  return {...r,executionMode:'own_team',ready:!overlap&&valid.length===zones.length&&valid.length>0&&allocation!=null,
    validZoneCount:valid.length,zoneCount:zones.length,supportedMinutes:allocation?.supportedMinutes??null,teamAllocation:allocation,
    reason:!zones.length?'Choose or draw your campaign area.':overlap||valid.length!==zones.length||!allocation?'Review current facts for every team coverage section.':null};
}
module.exports={VERSION,requirement,allocate,summary};
