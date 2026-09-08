"use strict";
const {hash, distance, validateRoute} = require('./route_progress');
const planning = require('./smart_zone_planning');
const VERSION = 'ProductionServiceableRouteV1';
const POLICY = 'CanvassingRoute80_95V1';
const MAX_EDGES = 99; // DFS guidance fits the maintained 200-point mobile contract.
const point = p => ({latitude:Number(p.latitude.toFixed(7)),longitude:Number(p.longitude.toFixed(7))});
const key = p => `${p.latitude.toFixed(7)},${p.longitude.toFixed(7)}`;
const interpolate = (a,b,t) => point({latitude:a.latitude+(b.latitude-a.latitude)*t,
  longitude:a.longitude+(b.longitude-a.longitude)*t});
const cross = (a,b) => a.x*b.y-a.y*b.x;
const vector = (a,b) => ({x:b.longitude-a.longitude,y:b.latitude-a.latitude});

function fractions(a,b,polygon) {
  const result=[];const r=vector(a,b);
  for(let i=0;i<polygon.length;i++) {
    const c=polygon[i],d=polygon[(i+1)%polygon.length],s=vector(c,d);
    const denominator=cross(r,s);if(Math.abs(denominator)<1e-16)continue;
    const offset=vector(a,c),t=cross(offset,s)/denominator,u=cross(offset,r)/denominator;
    if(t>0&&t<1&&u>=0&&u<=1)result.push(t);
  }
  return result;
}
function inside(p,polygon) {
  // Include exact mapped boundary edges; no additional corridor widening.
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    if(Math.abs(distance(a,p)+distance(p,b)-distance(a,b))<0.005)return true;
  }
  return planning.pointInsidePolygon(p,polygon);
}
function permitted(way) {
  if(!['residential','living_street','pedestrian','unclassified','tertiary','service'].includes(way.highway))return false;
  if(['private','no','customers','delivery','permit','destination'].includes(way.access) ||
      ['private','no','customers','permit'].includes(way.foot))return false;
  if(way.highway==='service' && !['yes','designated','permissive'].includes(way.foot))return false;
  if(way.service && ['driveway','parking_aisle','drive-through'].includes(way.service))return false;
  // No inferred junctions across grade-separated linework or uncertain connectors.
  return (!way.bridge||way.bridge==='no')&&(!way.tunnel||way.tunnel==='no')&&(!way.layer||way.layer==='0');
}

function derive({campaignId,zoneId,corridor,snapshot,accessAcknowledged=false}) {
  if(!planning.validateGeometry(corridor).valid)throw Error('invalid_zone_geometry');
  if(!snapshot || snapshot.source!=='openstreetmap_bounded_snapshot_v1' ||
      !Array.isArray(snapshot.routeWays))throw Error('mapped_route_source_required');
  const exclusions=snapshot.exclusionPolygons||[];
  if(!Array.isArray(exclusions)||exclusions.some(p=>!planning.validateGeometry(p).valid))throw Error('malformed_exclusion_geometry');
  const edges=new Map(),vertices=new Map();
  const ways=[...snapshot.routeWays].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  for(const way of ways) {
    if(!permitted(way))continue;
    const line=way.geometry;
    if(!Array.isArray(line)||line.length<2||line.some(p=>!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>85||Math.abs(p.longitude)>180))throw Error('malformed_mapped_linework');
    for(let i=1;i<line.length;i++) {
      const a=point(line[i-1]),b=point(line[i]);
      const split=[0,1,...fractions(a,b,corridor),...exclusions.flatMap(p=>fractions(a,b,p))]
        .sort((a,b)=>a-b).filter((v,i,all)=>i===0||v-all[i-1]>1e-10);
      for(let j=1;j<split.length;j++) {
        const middle=interpolate(a,b,(split[j-1]+split[j])/2);
        if(!inside(middle,corridor)||exclusions.some(p=>inside(middle,p)))continue;
        const from=interpolate(a,b,split[j-1]),to=interpolate(a,b,split[j]);
        const meters=distance(from,to);if(meters<0.1)continue;
        const ids=[key(from),key(to)].sort();const id=ids.join('|');
        vertices.set(key(from),from);vertices.set(key(to),to);
        edges.set(id,{id,from:ids[0],to:ids[1],meters});
      }
    }
  }
  // Atomize overlapping provider ways at existing, collinear mapped vertices.
  // This joins an explicitly mapped junction but never guesses a connector.
  const rawEdges=[...edges.values()],mappedVertices=[...vertices.values()];
  edges.clear();
  for(const edge of rawEdges) {
    const a=vertices.get(edge.from),b=vertices.get(edge.to),v=vector(a,b);
    const scale=v.x*v.x+v.y*v.y;
    const splits=[0,1];
    for(const p of mappedVertices) {
      const w=vector(a,p),t=(w.x*v.x+w.y*v.y)/scale;
      if(t>0&&t<1&&Math.abs(cross(v,w))<1e-14) splits.push(t);
    }
    splits.sort((a,b)=>a-b);
    for(let i=1;i<splits.length;i++) {
      const from=interpolate(a,b,splits[i-1]),to=interpolate(a,b,splits[i]);
      const meters=distance(from,to);if(meters<0.1)continue;
      const ids=[key(from),key(to)].sort(),id=ids.join('|');
      vertices.set(key(from),from);vertices.set(key(to),to);
      edges.set(id,{id,from:ids[0],to:ids[1],meters});
    }
  }
  if(!edges.size)throw Error('no_serviceable_mapped_route');
  if(edges.size>MAX_EDGES)throw Error('route_too_complex_split_zone');
  const adjacency=new Map();
  for(const e of edges.values())for(const [a,b]of [[e.from,e.to],[e.to,e.from]]) {
    if(!adjacency.has(a))adjacency.set(a,[]);adjacency.get(a).push({edge:e.id,next:b});
  }
  for(const next of adjacency.values())next.sort((a,b)=>a.next.localeCompare(b.next));
  const start=[...adjacency.keys()].sort()[0],visited=new Set(),line=[vertices.get(start)];
  function walk(id) {for(const entry of adjacency.get(id)||[]) {
    if(visited.has(entry.edge))continue;visited.add(entry.edge);
    line.push(vertices.get(entry.next));walk(entry.next);line.push(vertices.get(id));
  }}
  walk(start);
  if(visited.size!==edges.size)throw Error('disconnected_route_requires_zone_review');
  const uniqueRouteMeters=[...edges.values()].reduce((s,e)=>s+e.meters,0);
  const executionRoute={version:VERSION,centerline:line,routeHash:hash(line),
    corridorHash:hash(corridor),denominatorMeters:line.slice(1).reduce((s,p,i)=>s+distance(line[i],p),0),
    uniqueRouteMeters,coverageBasis:'unique_assigned_route_estimate'};
  validateRoute(executionRoute,corridor);
  // Bind the exact denominator used by the maintained coverage evaluator,
  // including its canonical undirected cells, rather than the out/back distance.
  executionRoute.uniqueRouteMeters=require('./canvassing_completion')
    .coverage({executionRoute,serviceArea:corridor},[]).denominatorMeters;
  const sourceSnapshotDigest=hash({source:snapshot.source,
    ways:ways.map(w=>({...w,geometry:w.geometry.map(point)})),exclusions});
  const coverageAuthority={version:VERSION,campaignId,zoneId,
    routeHash:executionRoute.routeHash,corridorHash:executionRoute.corridorHash,
    sourceSnapshotDigest,uniqueRouteMeters:executionRoute.uniqueRouteMeters,
    state:accessAcknowledged?'approved':'review_required',accessReviewed:accessAcknowledged,
    policyVersion:POLICY,householdCoverage:null};
  return {executionRoute,coverageAuthority};
}

function assertReady(zone,campaign) {
  if(campaign.completionPolicyVersion!==POLICY)return;
  const a=zone.coverageAuthority;
  validateRoute(zone.executionRoute,zone.serviceArea);
  const denominator=require('./canvassing_completion').coverage(zone,[]).denominatorMeters;
  if(!a||a.version!==VERSION||a.state!=='approved'||a.accessReviewed!==true||
    a.campaignId!==zone.campaignId||a.zoneId!==zone.id||
    a.routeHash!==zone.executionRoute.routeHash||a.corridorHash!==zone.executionRoute.corridorHash||
    a.uniqueRouteMeters!==zone.executionRoute.uniqueRouteMeters||
    !Number.isFinite(denominator)||denominator<=0||Math.abs(a.uniqueRouteMeters-denominator)>0.001||
    !/^[a-f0-9]{64}$/.test(a.sourceSnapshotDigest||''))throw Error('coverage_authority_incomplete');
}
module.exports={VERSION,POLICY,MAX_EDGES,derive,assertReady};
