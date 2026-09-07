"use strict";
const {distance, validateRoute} = require('./route_progress');
const VERSION = 'StagingCanvassingReviewV1';
// Proposal only. This module cannot activate economic thresholds.
const POLICY_APPROVED = false;
const isCanvassing = value => ['neighborhoodcanvassing','flyerdistribution','doorhangerdistribution','canvassing','flyer','doorhanger','doorhangers']
  .includes(String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
function applies(project, campaign) {
  return project === 'scaledcircle-staging' && isCanvassing(campaign.campaignType || campaign.type);
}
function xy(p, origin) { return {x:(p.longitude-origin.longitude)*111195*Math.cos(origin.latitude*Math.PI/180),y:(p.latitude-origin.latitude)*111195}; }
function proximity(p,a,b) {const dx=b.x-a.x,dy=b.y-a.y, t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function coverage(zone, evidence) {
  if(!zone.executionRoute)return {state:'unavailable',reason:'Assigned route centerline is unavailable',coveragePercentage:null};
  validateRoute(zone.executionRoute,zone.serviceArea);
  const line=zone.executionRoute.centerline,origin=line[0],cells=new Map();
  // Canonical undirected 2m cells: walking an out-and-back or repeated pass does not multiply credit.
  for(let i=1;i<line.length;i++) {
    let a=line[i-1],b=line[i];if(JSON.stringify(a)>JSON.stringify(b))[a,b]=[b,a];
    const meters=distance(a,b),n=Math.ceil(meters/2);
    for(let j=0;j<n;j++){const t=(j+.5)/n,p={latitude:a.latitude+(b.latitude-a.latitude)*t,longitude:a.longitude+(b.longitude-a.longitude)*t};
      const key=p.latitude.toFixed(7)+','+p.longitude.toFixed(7);cells.set(key,{p:xy(p,origin),meters:meters/n});}
  }
  const points=evidence.filter(p=>p.accepted===true && Number.isFinite(p.timestampMs)&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Number.isFinite(p.horizontalAccuracy)&&p.horizontalAccuracy>=0&&p.horizontalAccuracy<=35)
    .sort((a,b)=>a.timestampMs-b.timestampMs);
  const segments=[];
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dt=(b.timestampMs-a.timestampMs)/1000,d=distance(a,b);
    if(dt>0&&dt<=45&&d<=60&&d/dt<=2.5)segments.push({a:xy(a,origin),b:xy(b,origin),tolerance:10+Math.min(10,Math.min(a.horizontalAccuracy,b.horizontalAccuracy))});}
  let denominator=0,covered=0;
  for(const cell of cells.values()){denominator+=cell.meters;const hit=points.some(p=>distance({latitude:origin.latitude+cell.p.y/111195,longitude:origin.longitude+cell.p.x/(111195*Math.cos(origin.latitude*Math.PI/180))},p)<=10+Math.min(10,p.horizontalAccuracy)) || segments.some(s=>proximity(cell.p,s.a,s.b)<=s.tolerance);if(hit)covered+=cell.meters;}
  return {state:points.length>=2?'available':'calculating',coveragePercentage:points.length>=2?100*covered/denominator:null,
    coveredMeters:covered,remainingMeters:Math.max(0,denominator-covered),denominatorMeters:denominator,
    plannedWalkingMeters:zone.executionRoute.denominatorMeters,acceptedPointCount:points.length,
    coverageBasis:'unique_assigned_route_estimate',label:'Route Coverage Estimate',algorithmVersion:VERSION,
    toleranceMeters:'10m route proximity + accuracy allowance capped at 10m',householdCoverage:null};
}
function decision({coverage:result,baseAmountCents,checkpointCount=0,requiredCheckpointCount=0}) {
  if(!Number.isSafeInteger(baseAmountCents)||baseAmountCents<0)throw Error('Invalid immutable base compensation');
  return {policyVersion:VERSION,policyApproved:POLICY_APPROVED,ordinarySubmissionAllowed:false,
    baseAmountCents,payableAmountCents:null,bonusAmountCents:null,baseEligibility:'HELD',
    reason:'Completion and bonus thresholds await Founder review; no prorated base earning is authorized.',
    remainingRouteMeters:result.remainingMeters??null,checkpointCount,requiredCheckpointCount:0,checkpointsOptional:true,
    remainingCheckpoints:0,
    recommendedCoverageThreshold:95,bonusStatus:'Not activated',exceptionReviewAllowed:true};
}
module.exports={VERSION,applies,isCanvassing,coverage,decision};
