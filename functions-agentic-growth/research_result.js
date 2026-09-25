'use strict';
// A committed run is an idempotency boundary, not proof that discovery succeeded.
const number=v=>Number.isSafeInteger(v)&&v>=0?v:null;
function cycle(run={}) {
 const checks=run.discoveryChecks||[],searches=checks.filter(c=>c.attemptId),ok=searches.filter(c=>c.status==='search_completed');
 const failed=searches.filter(c=>c.status!=='search_completed');
 const sum=k=>ok.length&&ok.every(c=>number(c[k])!==null)?ok.reduce((n,c)=>n+c[k],0):null;
 return {state:failed.length?(ok.length?'partial':'failed'):ok.length?'processed':run.status==='running'?'running':'unknown',
  failure:failed[0]?{code:failed[0].status,stage:failed[0].stage||'authority_or_transport',reason:failed[0].diagnostic?.reason||null}:null,
  runId:run.id||null,requested:searches.length,processed:ok.length,candidatesParsed:sum('candidatesParsed'),sourcesChecked:sum('sourcesChecked'),
  candidateDuplicates:sum('duplicates'),sourceFailures:sum('unavailable'),evidenceExcluded:sum('excluded'),sourceBackoff:sum('backoff'),
  newQualified: number(run.newQualifiedProspectCount),newRecords:number(run.newProspectCount),
  rechecked:number(run.existingProspectsRechecked),duplicates:number(run.duplicatesExcludedCount),suppressed:number(run.suppressedCount),
  completedAt:run.completedAt||null};
}
function freshness(rows,runs) {
 const ordered=[...runs].sort((a,b)=>b.createdAt-a.createdAt),latest=ordered[0],result=cycle(latest);
 const lastSuccess=ordered.find(r=>cycle(r).state==='processed');
 const dates=rows.map(p=>p.discoveredAt).filter(t=>Number.isFinite(t)&&t>0);
 return {...result,lastSuccessfulProcessingAt:lastSuccess?.completedAt||null,lastNewProspectAt:dates.length?Math.max(...dates):null,
  evidenceWindow:'Up to 250 retained records per collection; unknown does not mean zero or never.'};
}
const at=v=>Number.isFinite(v)?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(v))+' Eastern':'Not established in retained evidence';
const count=v=>v===null||v===undefined?'Unknown':String(v);
function describe(f,next) {
 return `Discovery: ${f.state}${f.failure?` at ${f.failure.stage} (${f.failure.reason||f.failure.code})`:''}. Last successful processing: ${at(f.lastSuccessfulProcessingAt)}. Last new prospect: ${at(f.lastNewProspectAt)}. Latest cycle: ${count(f.newQualified)} new qualified; ${count(f.newRecords)} new records; ${count(f.rechecked)} existing rechecked; ${count(f.duplicates)} catalog/persistence duplicates; ${count(f.suppressed)} catalog/discovered-source suppressions; ${count(f.candidatesParsed)} search candidates; ${count(f.sourcesChecked)} search source checks; ${count(f.sourceBackoff)} candidates deferred by source backoff; ${count(f.sourceFailures)} source failures. ${next?`Next eligibility: ${at(next)}; execution depends on the normal worker and remaining authority.`:'Next eligibility is not saved in this report snapshot; check the current research schedule on the web.'} Inventory totals are cumulative. ${f.evidenceWindow}`;
}
function notification(f,kind='daily') {
 const failed=['failed','partial'].includes(f.state), noNew=f.state==='processed'&&f.newQualified===0;
 const label=kind==='weekly'?'Weekly research summary':'Daily research summary';
 return {title:label+(failed?' — needs attention':noNew?' — no new leads':''),
 message:`${f.completedAt?at(f.completedAt)+'. ':''}${failed?'Research did not fully complete.':noNew?'Processing completed; no new qualified leads were saved.':f.newQualified===null?'The saved result needs review.':`${f.newQualified} new qualified prospect(s) saved.`} Review the saved summary; full reports require authorized web access.`,detail:describe(f,null)};
}
module.exports={cycle,freshness,describe,notification};
