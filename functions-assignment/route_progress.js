"use strict";
const crypto = require('node:crypto');
function canonical(v) {return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
function distance(a,b) {
  const rad=x=>x*Math.PI/180, x=rad(b.latitude-a.latitude),y=rad(b.longitude-a.longitude);
  const h=Math.sin(x/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(y/2)**2;
  return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
function validateRoute(route, corridor) {
  const points=route?.centerline;
  if(!Array.isArray(points)||points.length<2||points.length>200||
    points.some(p=>!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180)||
    route.routeHash!==hash(points)||route.corridorHash!==hash(corridor)) throw Error('route_binding_invalid');
  const meters=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
  if(!Number.isFinite(route.denominatorMeters)||meters<=0||Math.abs(route.denominatorMeters-meters)>0.01)throw Error('route_denominator_invalid');
  return meters;
}
function acceptedEvidence(session, chunks) {
  if(chunks.length!==Number(session.chunkCount||0)) return null;
  let next=1;const accepted=[];
  for(const c of [...chunks].sort((a,b)=>a.startSequence-b.startSequence)) {
    if(c.sessionId!==session.sessionId||c.scalerId!==session.scalerId||c.zoneId!==session.zoneId||
      c.startSequence!==next||!Array.isArray(c.points))return null;
    for(const p of c.points) {if(p.sequence!==next++)return null;if(p.accepted===true)accepted.push(p);}
  }
  if(next-1!==Number(session.pointCount||0)||accepted.length<2)return null;
  return accepted;
}
function projectProgress(session, zone, chunks, calculate) {
  const unknown={state:'calculating',provisional:true,coveragePercentage:null};
  const accepted=acceptedEvidence(session,chunks);
  if(!accepted)return unknown;
  const exact=zone.executionRoute;
  const denominator=exact?validateRoute(exact,zone.serviceArea):zone.estimatedWalkingMeters;
  const result=calculate({...zone,estimatedWalkingMeters:denominator},accepted);
  return {state:'available',provisional:true,coverageBasis:exact?'assigned_route_distance':'distance_estimate',
    coveragePercentage:result.completionPercentage,insideCorridorMeters:result.insideZoneDistanceMeters,
    denominatorMeters:denominator,acceptedPointCount:accepted.length,lastEvidenceAt:session.lastSyncAt||null,
    path:accepted.filter((_,i)=>i%Math.max(1,Math.ceil(accepted.length/500))===0||i===accepted.length-1)
      .map(p=>({latitude:p.latitude,longitude:p.longitude})),
    corridor:zone.serviceArea,route:exact||null};
}
module.exports={hash,distance,validateRoute,acceptedEvidence,projectProgress};
