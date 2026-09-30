'use strict';
// Read-only comparison of ONE fixed area. Never selects more territory or writes.
const {zoneGeometryDigest}=require('./operational_layer');
const planning=require('./smart_zone_planning');
const connected=require('./smart_zone_connected_territory');
const areas=require('./property_service_area_geometry');
const VERSION='OwnTeamFixedAreaTimeV2';
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
  for(const f of features){const choices=ordered.map((e,i)=>({i,d:separation(f,e)})).sort((a,b)=>a.d-b.d||a.i-b.i);
    // Reuses the maintained 60 m road-support ceiling; no distant association.
    if(!choices.length||choices[0].d>60)return null;
    ordered[choices[0].i].targetIds.push(String(f.addressKey||f.id||f.sourceId));}
  return ordered;
}
function lane(units){
  const targetIds=units.flatMap(u=>u.targetIds),networkMeters=units.reduce((s,u)=>s+u.meters,0);
  const walkingMinutes=networkMeters*2/80,handlingMinutes=targetIds.length*60/45;
  return {targetIds,targetCount:targetIds.length,segmentIds:units.map(u=>u.id),networkMeters,
    walkingMinutes,handlingMinutes,rawFieldMinutes:walkingMinutes+handlingMinutes,
    calculatedFieldMinutes:Math.ceil(walkingMinutes+handlingMinutes),
    fieldMinutes:Math.max(15,Math.ceil(walkingMinutes+handlingMinutes))};
}
// Optimal contiguous cuts of an observed path, not division by headcount.
// A bounded minimax dynamic program; each lane retains whole street segments.
function partition(units,count){
  const n=units.length,k=Math.min(count,n),prefix=[0];
  for(const u of units)prefix.push(prefix.at(-1)+u.meters*2/80+u.targetIds.length*60/45);
  const dp=Array.from({length:k+1},()=>Array(n+1).fill(Infinity)),cuts=Array.from({length:k+1},()=>[]);dp[0][0]=0;
  for(let c=1;c<=k;c++)for(let end=c;end<=n;end++)for(let start=c-1;start<end;start++){
    const cost=Math.max(dp[c-1][start],prefix[end]-prefix[start]);
    if(cost<dp[c][end]){dp[c][end]=cost;cuts[c][end]=start;}}
  const result=[];let end=n;
  for(let c=k;c>0;c--){const start=cuts[c][end];result.unshift(lane(units.slice(start,end)));end=start;}
  return result;
}
function compare({geometry,features=[],segments=[],inventoryComplete=false,source=null,
  unclassifiedCount=null,unmatchedPropertyCount=null,currentTeam=null}){
  const targetSetDigest=hash('sha256').update(JSON.stringify(features.map(f=>String(f.addressKey||f.id||f.sourceId)).sort())).digest('hex');
  const evidenceDigest=hash('sha256').update(JSON.stringify({source,features,segments})).digest('hex');
  const binding={geometryDigest:zoneGeometryDigest(geometry),targetSetDigest,evidenceDigest,
    sourceEvidenceVersion:source?.datasetVersion||source?.parserVersion||null,
    workloadModelVersion:planning.POLICY_VERSION,comparisonVersion:VERSION};
  const base={version:VERSION,geometryDigest:zoneGeometryDigest(geometry),boundaryFixed:true,
    binding,source,unclassifiedCount,unmatchedPropertyCount,
    currentTeam:currentTeam&&Number.isSafeInteger(currentTeam.marketerCount)&&['stay_together','split_streets'].includes(currentTeam.coveragePattern)
      ?{marketerCount:currentTeam.marketerCount,coveragePattern:currentTeam.coveragePattern}:null,
    fullAreaWorkloadEstablished:inventoryComplete===true,executionRouteVerified:false,totalSessionMinutes:null,
    assumptions:{targetsPerHour:45,walkingMetersPerMinute:80,networkTraversalFactor:2,minimumFieldMinutes:15},
    limitations:['Field-only advisory comparison; travel, setup, access and execution itinerary are unverified.',
      ...(inventoryComplete?[]:['Known street-supported target subset only; complete area/team duration is not established.'])]};
  const unavailable=reason=>({...base,status:'unavailable',reason,fullAreaWorkloadEstablished:false,rows:[]});
  if(!planning.validateGeometry(geometry).valid)return unavailable('Current bounded geometry is required.');
  if(features.length>5000||segments.length>256)return unavailable('This evidence exceeds the bounded comparison limit of 5,000 targets or 256 street segments. A supported local allocation is not established.');
  const region=areas.normalizeAreas({areas:[{geometry}]}).union,ids=new Set();
  for(const f of features){const id=f.addressKey||f.id||f.sourceId;
    if(!id||ids.has(id)||![f.latitude,f.longitude].every(Number.isFinite)||!planning.pointInsidePolygon(f,geometry))return unavailable('Unique targets inside this fixed boundary are required.');ids.add(id);}
  const edges=[];const seen=new Set();
  for(const e of segments){if(!e.from||!e.to||![e.from.latitude,e.from.longitude,e.to.latitude,e.to.longitude].every(Number.isFinite))return unavailable('Street evidence is incomplete.');
    const id=[key(e.from),key(e.to)].sort().join('|');if(seen.has(id))continue;seen.add(id);
    if(!connected.segmentContained(e.from,e.to,region))return unavailable('Street evidence must remain inside this fixed boundary.');
    const meters=length(e.from,e.to);if(meters>0)edges.push({...e,id:hash('sha256').update(id).digest('hex').slice(0,24),meters});}
  if(!features.length||!edges.length)return unavailable('Street-supported targets and walking evidence are required.');
  const networkMeters=edges.reduce((s,e)=>s+e.meters,0),walkingMinutes=networkMeters*2/80,handlingMinutes=features.length*60/45;
  const units=pathUnits(edges,features),shared=lane([{id:'whole-area',meters:networkMeters,targetIds:[...ids]}]);
  const rows=[1,2,3,4].map(marketerCount=>{
    const allocations=units?partition(units,marketerCount):[shared];
    return {marketerCount,coveredTargetCount:features.length,walkingMinutes,handlingMinutes,
      stayTogether:{binding:{...binding,marketerCount,coveragePattern:'stay_together'},calculatedFieldMinutes:shared.calculatedFieldMinutes,fieldMinutes:shared.fieldMinutes,allocations:[shared]},
      splitUp:{binding:{...binding,marketerCount,coveragePattern:'split_streets'},calculatedFieldMinutes:Math.max(...allocations.map(a=>a.calculatedFieldMinutes)),fieldMinutes:Math.max(...allocations.map(a=>a.fieldMinutes)),allocations,
        walkingMinutes:allocations.reduce((s,a)=>s+a.walkingMinutes,0),handlingMinutes:allocations.reduce((s,a)=>s+a.handlingMinutes,0),
        occupiedMarketers:allocations.length,allocationBasis:units?'complementary_contiguous_observed_segments':'whole_area_no_supported_subdivision',
        subdivisionEstablished:!!units,idealizedEvenDivisionMinutes:shared.rawFieldMinutes/marketerCount,
        idealizedLabel:'Idealized even division only; not a practical allocation and excludes the 15-minute planning floor.'}};
  });
  return {...base,status:'supported_subset',coveredTargetCount:features.length,networkMeters,walkingMinutes,handlingMinutes,rows};
}
module.exports={VERSION,compare};
