'use strict';
// A committed run is an idempotency boundary, not proof that discovery succeeded.
const number=v=>Number.isSafeInteger(v)&&v>=0?v:null;
function cycle(run={}) {
 const checks=run.discoveryChecks||[],searches=checks.filter(c=>c.attemptId),ok=searches.filter(c=>c.status==='search_completed');
 const failed=searches.filter(c=>c.status!=='search_completed');
 const sum=k=>ok.length&&ok.every(c=>number(c[k])!==null)?ok.reduce((n,c)=>n+c[k],0):null;
 return {state:failed.length?(ok.length?'partial':'failed'):ok.length?'processed':run.status==='running'?'running':'unknown',
  failure:failed[0]?{code:failed[0].status,stage:failed[0].stage||'authority_or_transport',reason:failed[0].diagnostic?.reason||null}:null,
  requested:searches.length,processed:ok.length,candidatesParsed:sum('candidatesParsed'),sourcesChecked:sum('sourcesChecked'),
  sourceFailures:sum('unavailable'),evidenceExcluded:sum('excluded'),sourceBackoff:sum('backoff'),
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
const at=v=>v?new Date(v).toISOString():'Unknown';
const count=v=>v===null||v===undefined?'Unknown':String(v);
function describe(f,next) {
 return `Discovery: ${f.state}${f.failure?` at ${f.failure.stage} (${f.failure.reason||f.failure.code})`:''}. Last successful processing: ${at(f.lastSuccessfulProcessingAt)}. Last new prospect: ${at(f.lastNewProspectAt)}. Latest cycle: ${count(f.newQualified)} new qualified; ${count(f.newRecords)} new records; ${count(f.rechecked)} existing rechecked; ${count(f.duplicates)} duplicates; ${count(f.suppressed)} suppressed; ${count(f.sourceFailures)} source failures. Next eligible: ${at(next)}. Inventory totals are cumulative. ${f.evidenceWindow}`;
}
module.exports={cycle,freshness,describe};
