"use strict";
const crypto = require('node:crypto');
const {hash, acceptedEvidence, distance, validateRoute} = require('./route_progress');
const VERSION = 'StagingCanvassingLaunch80_95V1';
const BASE_THRESHOLD = 80;
const BONUS_THRESHOLD = 95;
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
  const points=evidence.filter(p=>p.accepted===true && Number.isFinite(p.timestampMs)&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&Number.isFinite(p.horizontalAccuracy)&&p.horizontalAccuracy>=0&&p.horizontalAccuracy<=35)
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
// Only server-read immutable tracking records enter this assessment.
function assess(zone, session, chunks, route, calculate) {
  const sessionValid = !!session.sessionId && session.zoneId === zone.id &&
    session.campaignId === zone.campaignId && session.scalerId === zone.assignedScalerId;
  const raw = chunks.flatMap(c => c.points || []);
  const captured = raw.filter(p => p.accepted === true).length >= 2;
  let estimate = {state:'unavailable', coveragePercentage:null, householdCoverage:null};
  let technicalIssue = null;
  try {
    const accepted = acceptedEvidence(session, chunks);
    if (accepted) estimate = coverage(zone, accepted);
    else if (session.status === 'completed' && captured) technicalIssue = 'evidence_projection_incomplete';
  } catch (_) { technicalIssue = 'assigned_route_or_processing_unreliable'; }
  const digest = crypto.createHash('sha256').update([...chunks].sort((a,b)=>a.startSequence-b.startSequence)
    .map(c=>`${c.startSequence}:${c.endSequence}:${c.payloadDigest}`).join('|'),'utf8').digest('hex');
  const finalized = sessionValid && session.status === 'completed' && !!session.endedAt &&
    route?.trackingSessionId === session.sessionId && session.routeId === session.sessionId &&
    zone.routeId === session.sessionId && route?.zoneId === zone.id &&
    route?.campaignId === zone.campaignId && route?.scalerId === zone.assignedScalerId &&
    route?.tracking === false && route?.simulated === false && route?.evidenceDigest === digest &&
    Number(session.finalAcceptedPointCount) === raw.filter(p=>p.accepted===true).length &&
    Number(session.finalPointCount) === raw.length && !zone.activeTrackingSessionId && zone.gpsTracking !== true;
  if (sessionValid && session.status === 'completed' && captured && !finalized) technicalIssue = 'finalization_integrity_requires_review';
  if (sessionValid && session.status === 'completed' && captured && estimate.state !== 'available') technicalIssue ||= 'coverage_confidence_unavailable';
  return {estimate, sessionValid, finalized, technicalIssue, technicalReviewSupported:sessionValid && captured && session.status === 'completed',
    evidenceDigest:digest, acceptedEvidenceHash:hash(raw), sessionId:session.sessionId || null};
}
function decision({coverage:result,baseAmountCents,bonusAmountCents=0,authorityValid=false,finalized=false,
  technicalIssue=null,technicalReviewSupported=false,accessIssue=false,historical=false,checkpointCount=0}) {
  if(!Number.isSafeInteger(baseAmountCents)||baseAmountCents<0 || !Number.isSafeInteger(bonusAmountCents)||bonusAmountCents<0)throw Error('Invalid immutable compensation');
  const reliable = result.state === 'available' && Number.isFinite(result.coveragePercentage) && !technicalIssue;
  const technical = !!technicalIssue && technicalReviewSupported && authorityValid;
  const eligible = authorityValid && finalized && reliable && !accessIssue && !historical && result.coveragePercentage >= BASE_THRESHOLD;
  const bonusEligible = eligible && result.coveragePercentage >= BONUS_THRESHOLD;
  const bonus = bonusEligible ? bonusAmountCents : 0;
  const state = historical ? 'Historical Review Held' : technical ? 'Technical Review Required' : accessIssue ? 'Access Exception Review' : eligible ? 'Eligible' : 'Not Yet Eligible';
  return {policyVersion:VERSION,policyApproved:true,ordinarySubmissionAllowed:eligible,
    baseAmountCents,acceptedBonusAmountCents:bonusAmountCents,payableAmountCents:eligible?baseAmountCents+bonus:null,
    payableBaseAmountCents:eligible?baseAmountCents:null,bonusAmountCents:eligible?bonus:null,baseEligibility:state,
    coverageBonusEligible:bonusEligible,baseProtected:technical,
    reason: historical ? 'Historical submission remains held; this replay does not authorize payment.' : technical ?
      'Base compensation protected and held for authoritative technical review; no automatic denial, reduction, payment or bonus.' : accessIssue ?
      'Reported access restrictions require authoritative review and do not automatically change coverage.' : eligible ?
      'Full accepted base is eligible after normal Business review; no linear proration.' :
      'Continue Route. Minimum for base eligibility: 80%. Bonus threshold: 95%. Aim for 100%. Finalized authoritative evidence is required.',
    remainingRouteMeters:result.remainingMeters??null,checkpointCount,requiredCheckpointCount:0,checkpointsOptional:true,remainingCheckpoints:0,
    baseThreshold:BASE_THRESHOLD,bonusThreshold:BONUS_THRESHOLD,goal:100,
    bonusStatus:technical ? 'Pending â€” evidence unreliable' : bonusAmountCents===0 ? 'No accepted coverage bonus' : bonusEligible ? 'Earned â€” held for approval' : eligible ? 'Not Earned' : 'Pending',
    exceptionReviewAllowed:true,technicalReviewAllowed:technical};
}
module.exports={VERSION,BASE_THRESHOLD,BONUS_THRESHOLD,applies,isCanvassing,coverage,assess,decision};
