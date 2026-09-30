'use strict';
// Read-only comparison of ONE fixed area. Never selects more territory or writes.
const {zoneGeometryDigest}=require('./operational_layer');
const planning=require('./smart_zone_planning');
const connected=require('./smart_zone_connected_territory');
const areas=require('./property_service_area_geometry');
const streetSections=require('./own_team_street_sections');
const VERSION='OwnTeamFixedAreaTimeV3';
const LIMITS={targets:5000,evidenceSegments:2048,targetEdgeChecks:2000000,allocationTransitions:327680,responseBytes:1048576};
const hash=require('node:crypto').createHash;
const key=p=>`${p.latitude.toFixed(7)},${p.longitude.toFixed(7)}`;
const length=(a,b)=>Math.hypot((a.latitude-b.latitude)*111320,
  (a.longitude-b.longitude)*111320*Math.cos((a.latitude+b.latitude)*Math.PI/360));
function separation(p,e){
  const scale=111320*Math.cos(p.latitude*Math.PI/180),dx=(e.to.longitude-e.from.longitude)*scale,dy=(e.to.latitude-e.from.latitude)*111320;
  const x=(p.longitude-e.from.longitude)*scale,y=(p.latitude-e.from.latitude)*111320;
  const t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-t*dx,y-t*dy);
}
function pathUnits(edges,features){
  const nodes=new Map();
  for(const e of edges)for(const p of [e.from,e.to]){const k=key(p);if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(e);}
  if([...nodes.values()].some(es=>es.length>2))return null;
  const ends=[...nodes].filter(([,es])=>es.length===1).map(([k])=>k).sort();
  if(ends.length!==2)return null;
  const ordered=[],seen=new Set();let current=ends[0];
  while(ordered.length<edges.length){const e=nodes.get(current)?.find(e=>!seen.has(e));if(!e)break;
    seen.add(e);ordered.push({...e,targetIds:[]});current=key(e.from)===current?key(e.to):key(e.from);}
  if(ordered.length!==edges.length)return null;
  for(const f of features){let best=-1,distance=Infinity;
    for(let i=0;i<ordered.length;i++){const d=separation(f,ordered[i]);if(d<distance){distance=d;best=i;}}
    // Reuses the maintained 60 m road-support ceiling; no distant association.
    if(best<0||distance>60)return {unavailable:'Some targets lack an association within the maintained 60 m street-support limit.'};
    ordered[best].targetIds.push(String(f.addressKey||f.id||f.sourceId));}
  return ordered;
}
function lane(units){
  const targetIds=units.flatMap(u=>u.targetIds),atoms=new Map(),traversals={};
  for(const u of units)for(const a of u.atoms||[{id:u.id,meters:u.meters}]){
    atoms.set(a.id,a);traversals[a.id]=(traversals[a.id]||0)+(u.traversals??2);
  }
  const networkMeters=[...atoms.values()].reduce((s,a)=>s+a.meters,0);
  const walkingMinutes=units.reduce((s,u)=>s+(u.walkingMinutes??u.meters*2/80),0),handlingMinutes=targetIds.length*60/45;
  return {targetIds,targetCount:targetIds.length,segmentIds:[...atoms.keys()],segmentTraversalCounts:traversals,networkMeters,
    walkingMinutes,handlingMinutes,rawFieldMinutes:walkingMinutes+handlingMinutes,
    calculatedFieldMinutes:Math.ceil(walkingMinutes+handlingMinutes),
    fieldMinutes:Math.max(15,Math.ceil(walkingMinutes+handlingMinutes))};
}
// Optimal contiguous cuts of an observed path, not division by headcount.
// A bounded minimax dynamic program; each lane retains whole street segments.
function partitions(units,budget){
  const n=units.length,k=Math.min(4,n),prefix=[0];
  for(const u of units)prefix.push(prefix.at(-1)+(u.walkingMinutes??u.meters*2/80)+u.targetIds.length*60/45);
  const dp=Array.from({length:k+1},()=>Array(n+1).fill(Infinity)),cuts=Array.from({length:k+1},()=>[]);dp[0][0]=0;
  // One shared DP serves all four crew sizes; a one-person prefix needs no cuts.
  for(let end=1;end<=n;end++){dp[1][end]=prefix[end];cuts[1][end]=0;}
  for(let c=2;c<=k;c++)for(let end=c;end<=n;end++)for(let start=c-1;start<end;start++){
    if(++budget.transitions>LIMITS.allocationTransitions)throw Error('allocation_budget');
    const cost=Math.max(dp[c-1][start],prefix[end]-prefix[start]);
    if(cost<dp[c][end]){dp[c][end]=cost;cuts[c][end]=start;}}
  return [1,2,3,4].map(count=>{const result=[];let end=n;
    for(let c=Math.min(count,n);c>0;c--){const start=cuts[c][end];result.unshift(lane(units.slice(start,end)));end=start;}
    return result;});
}
function compare({geometry,features=[],segments=[],inventoryComplete=false,source=null,
  unclassifiedCount=null,unmatchedPropertyCount=null,currentTeam=null}){
  const targetSetDigest=hash('sha256').update(JSON.stringify(features.map(f=>String(f.addressKey||f.id||f.sourceId)).sort())).digest('hex');
  const evidenceDigest=hash('sha256').update(JSON.stringify({source,features,segments})).digest('hex');
  const binding={geometryDigest:zoneGeometryDigest(geometry),targetSetDigest,evidenceDigest,
    sourceEvidenceVersion:source?.datasetVersion||source?.parserVersion||null,
    workloadModelVersion:planning.POLICY_VERSION,comparisonVersion:VERSION};
  const base={version:VERSION,geometryDigest:zoneGeometryDigest(geometry),boundaryFixed:true,
    binding,source,unclassifiedCount,unmatchedPropertyCount,limits:LIMITS,
    planningCompatibility:{scope:'read_only_internal_comparison',createsSavedSections:false,plannerUsesComparison:false,plannerAllocation:'whole_saved_zones',readinessAuthority:'existing_campaign_workload_summary'},
    currentTeam:currentTeam&&Number.isSafeInteger(currentTeam.marketerCount)&&['stay_together','split_streets'].includes(currentTeam.coveragePattern)
      ?{marketerCount:currentTeam.marketerCount,coveragePattern:currentTeam.coveragePattern}:null,
    fullAreaWorkloadEstablished:inventoryComplete===true,executionRouteVerified:false,totalSessionMinutes:null,
    assumptions:{targetsPerHour:45,walkingMetersPerMinute:80,networkTraversalFactor:2,minimumFieldMinutes:15},
    limitations:['Field-only advisory comparison; travel, setup, access and execution itinerary are unverified.',
      ...(inventoryComplete?[]:['Known street-supported target subset only; complete area/team duration is not established.'])]};
  const unavailable=reason=>({...base,status:'unavailable',reason,fullAreaWorkloadEstablished:false,rows:[]});
  if(!planning.validateGeometry(geometry).valid)return unavailable('Current bounded geometry is required.');
  if(features.length>LIMITS.targets||segments.length>LIMITS.evidenceSegments||features.length*segments.length>LIMITS.targetEdgeChecks)return unavailable('This evidence exceeds the bounded input/target-association budget. No work was omitted; local allocation is not established.');
  const region=areas.normalizeAreas({areas:[{geometry}]}).union,ids=new Set();
  for(const f of features){const id=f.addressKey||f.id||f.sourceId;
    if(!id||ids.has(id)||![f.latitude,f.longitude].every(Number.isFinite)||!planning.pointInsidePolygon(f,geometry))return unavailable('Unique targets inside this fixed boundary are required.');ids.add(id);}
  const edges=[];const seen=new Map();
  for(const e of segments){if(!e.from||!e.to||![e.from.latitude,e.from.longitude,e.to.latitude,e.to.longitude].every(Number.isFinite))return unavailable('Street evidence is incomplete.');
    const id=[key(e.from),key(e.to)].sort().join('|');if(seen.has(id)){if(seen.get(id)!==streetSections.semantics(e))return unavailable('Conflicting street access evidence needs review.');continue;}seen.set(id,streetSections.semantics(e));
    if(!connected.segmentContained(e.from,e.to,region))return unavailable('Street evidence must remain inside this fixed boundary.');
    const meters=length(e.from,e.to);if(meters>0)edges.push({...e,geometricKey:id,id:hash('sha256').update(id).digest('hex').slice(0,24),meters});}
  if(!features.length||!edges.length)return unavailable('Street-supported targets and walking evidence are required.');
  const networkMeters=edges.reduce((s,e)=>s+e.meters,0),walkingMinutes=networkMeters*2/80,handlingMinutes=features.length*60/45;
  const path=pathUnits(edges,features),units=Array.isArray(path)?path:null;
  let sections=null,sectionReason=path?.unavailable||null,compacted=null;
  if(!units&&!sectionReason){compacted=streetSections.compact(edges,features,separation);sectionReason=compacted.unavailable||null;
    if(!sectionReason)sections=compacted.components.map(cs=>streetSections.walk(cs));}
  const shared=lane([{id:'whole-area',meters:networkMeters,targetIds:[...ids]}]),budget={transitions:0};
  let rows;try{const prepared=units?[partitions(units,budget)]:sections?sections.map(us=>partitions(us,budget)):null;rows=
[1,2,3,4].map(marketerCount=>{
    const local=prepared?prepared.map(p=>p[marketerCount-1]):null;
    const allocations=local?local.flatMap((ls,i)=>ls.map(l=>({...l,localSection:i+1}))):[shared];
    const critical=local?local.map(ls=>ls.reduce((a,b)=>b.rawFieldMinutes>a.rawFieldMinutes?b:a)):[shared];
    const criticalWalkingMinutes=critical.reduce((s,a)=>s+a.walkingMinutes,0),criticalHandlingMinutes=critical.reduce((s,a)=>s+a.handlingMinutes,0);
    const rawSplit=criticalWalkingMinutes+criticalHandlingMinutes;
    return {marketerCount,coveredTargetCount:features.length,walkingMinutes,handlingMinutes,
      stayTogether:{binding:{...binding,marketerCount,coveragePattern:'stay_together'},calculatedFieldMinutes:shared.calculatedFieldMinutes,fieldMinutes:shared.fieldMinutes,allocations:[shared],
        walkingMinutes,handlingMinutes,rawFieldMinutes:shared.rawFieldMinutes,sectionTransferMinutes:null,overallTeamFinishEstablished:false,
        personWorkMinutes:null,personWorkReason:'Shared group duration does not establish individual handling or person-work for every accompanying marketer.'},
      splitUp:{binding:{...binding,marketerCount,coveragePattern:'split_streets'},calculatedFieldMinutes:Math.ceil(rawSplit),fieldMinutes:Math.max(15,Math.ceil(rawSplit)),allocations,
        rawFieldMinutes:rawSplit,localSectionCount:local?.length??1,sectionTransferMinutes:null,
        criticalWalkingMinutes,criticalHandlingMinutes,
        fieldTimeBasis:local?.length>1?'sequential_local_sections_excluding_transfers':'longest_local_allocation',
        overallTeamFinishEstablished:false,allocatedPersonWorkMinutes:allocations.reduce((s,a)=>s+a.rawFieldMinutes,0),
        walkingMinutes:allocations.reduce((s,a)=>s+a.walkingMinutes,0),handlingMinutes:allocations.reduce((s,a)=>s+a.handlingMinutes,0),
        occupiedMarketers:local?Math.max(...local.map(ls=>ls.length)):1,allocationBasis:units?'complementary_contiguous_observed_segments':sections?'connected_local_street_sections':'whole_area_no_supported_subdivision',
        subdivisionEstablished:!!local,sectionReason,idealizedEvenDivisionMinutes:shared.rawFieldMinutes/marketerCount,
        idealizedLabel:'Idealized even division only; not a practical allocation and excludes the 15-minute planning floor.'}};
  });}catch(e){if(e.message!=='allocation_budget')throw e;rows=[];sectionReason='The bounded allocation-work budget was reached. Supported field work is retained, but a crew allocation is not established.';}
  const result={...base,status:rows.length?'supported_subset':'allocation_incomplete',coveredTargetCount:features.length,networkMeters,walkingMinutes,handlingMinutes,knownTargetCalculatedMinutes:shared.calculatedFieldMinutes,reason:sectionReason,
    computation:{rawSegmentCount:segments.length,deduplicatedSegmentCount:edges.length,compactChainCount:compacted?.chains?.length??null,connectedLocalSectionCount:sections?.length??1,allocationTransitions:budget.transitions},rows};
  if(sections?.length>1)result.limitations.push(`${sections.length} disconnected local street sections remain separate. Field subtotals exclude transfers between sections; overall team finish is not established.`);
  if(Buffer.byteLength(JSON.stringify(result))>LIMITS.responseBytes)return {...result,status:'allocation_incomplete',reason:'The bounded comparison-response budget was reached. Supported field work is retained without detailed crew allocations.',rows:[]};
  return result;
}
module.exports={VERSION,compare};
