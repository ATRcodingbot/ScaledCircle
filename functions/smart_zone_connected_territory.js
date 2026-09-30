'use strict';
// Exact observed connectivity and containment, never an inferred connector.
const clipping=require('polygon-clipping');
const areas=require('./property_service_area_geometry');
const planning=require('./smart_zone_planning');
const polygon=c=>areas.normalizeAreas({areas:[{geometry:c.geometry}]}).union;
const key=p=>`${p.latitude.toFixed(7)},${p.longitude.toFixed(7)}`;
const target=f=>f.addressKey||f.id||f.sourceId||key(f);
const vertices=c=>new Set(c.networkSegments.flatMap(e=>[key(e.from),key(e.to)]));
function segmentContained(a,b,region){
  // Split a line at every boundary intersection, then test every resulting
  // open interval. Endpoints alone miss concavities and exclusion holes.
  const ax=a.longitude,ay=a.latitude,dx=b.longitude-ax,dy=b.latitude-ay;
  const cuts=[0,1];
  for(const poly of region)for(const ring of poly)for(let i=1;i<ring.length;i++){
    const [cx,cy]=ring[i-1],[ex,ey]=ring[i],sx=ex-cx,sy=ey-cy;
    const den=dx*sy-dy*sx;if(Math.abs(den)<1e-18)continue;
    const t=((cx-ax)*sy-(cy-ay)*sx)/den,u=((cx-ax)*dy-(cy-ay)*dx)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)cuts.push(t);
  }
  cuts.sort((x,y)=>x-y);
  const inside=t=>{const p={longitude:ax+t*dx,latitude:ay+t*dy};return region.some(poly=>
    planning.pointInsidePolygon(p,poly[0].map(([longitude,latitude])=>({longitude,latitude})))&&
    !poly.slice(1).some(r=>planning.pointInsidePolygon(p,r.map(([longitude,latitude])=>({longitude,latitude})))));};
  return cuts.slice(1).every((t,i)=>t-cuts[i]<1e-12||inside((t+cuts[i])/2));
}
function contained(c,region){
  return Array.isArray(c.features)&&Array.isArray(c.networkSegments)&&c.features.length>0&&
    areas.isContained(c.geometry,region)&&c.features.every(f=>planning.pointInsidePolygon(f,c.geometry)&&
      (!f.footprint||areas.isContained(f.footprint,region)))&&
    c.networkSegments.length>0&&c.networkSegments.every(e=>segmentContained(e.from,e.to,polygon(c))&&segmentContained(e.from,e.to,region));
}
function compatible(a,b){
  if(a.features.some(f=>b.features.some(g=>target(f)===target(g))))return false;
  // Do not sum two section workloads over the same length of street. Shared
  // endpoints establish adjacency; shared interior linework needs a separately
  // deduplicated estimate and is conservatively kept as an alternative here.
  const overlaps=(p,q)=>{
    const dx=p.to.longitude-p.from.longitude,dy=p.to.latitude-p.from.latitude;
    const cross=r=>dx*(r.latitude-p.from.latitude)-dy*(r.longitude-p.from.longitude);
    if(Math.abs(cross(q.from))>1e-14||Math.abs(cross(q.to))>1e-14)return false;
    const axis=Math.abs(dx)>Math.abs(dy)?'longitude':'latitude';
    const lo=Math.max(Math.min(p.from[axis],p.to[axis]),Math.min(q.from[axis],q.to[axis]));
    const hi=Math.min(Math.max(p.from[axis],p.to[axis]),Math.max(q.from[axis],q.to[axis]));
    return hi-lo>1e-12;
  };
  if(a.networkSegments.some(e=>b.networkSegments.some(f=>overlaps(e,f))))return false;
  const points=vertices(a);
  if(![...vertices(b)].some(p=>points.has(p)))return false;
  // Adjacent/overlapping exact footprints AND an observed street connection.
  // Holes survive union; disconnected polygons never acquire a hull.
  return clipping.union(polygon(a),polygon(b)).length===1;
}
function options(evidence,capacity,region){
  const pool=evidence.candidates.filter(c=>contained(c,region)&&Number.isFinite(c.workload?.estimatedMinutes)&&c.workload.estimatedMinutes>0);
  const remaining=new Set(pool),result=[];
  for(const seed of [...pool].sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id))){
    if(!remaining.has(seed))continue;
    const selected=[seed];remaining.delete(seed);let minutes=seed.workload.estimatedMinutes;
    while(minutes<capacity.requestedMinutes){
      const next=[...remaining].filter(c=>selected.some(s=>compatible(s,c))&&
        (minutes+c.workload.estimatedMinutes<=capacity.requestedMinutes||
         Math.abs(minutes+c.workload.estimatedMinutes-capacity.requestedMinutes)<Math.abs(minutes-capacity.requestedMinutes))&&
        !selected.some(s=>s.features.some(f=>c.features.some(g=>target(f)===target(g)))))
        .sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id))[0];
      if(!next)break;
      selected.push(next);remaining.delete(next);minutes+=next.workload.estimatedMinutes;
    }
    const territory=clipping.union(...selected.map(polygon));
    if(territory.length!==1)continue;
    const sections=[...new Set(selected.map(c=>c.propertyAreaId))].map(id=>evidence.propertyCandidates.find(a=>a.id===id));
    if(sections.some(s=>!s))continue;
    result.push({primary:sections[0],sections,selected,territory});
    if(result.length===3)break;
  }
  return result;
}
function assertSelection(selected,region){
  if(!selected.length||selected.some(c=>!contained(c,region)))throw Error('recommendation_outside_scope');
  const reached=new Set([selected[0]]);
  let changed=true;while(changed){changed=false;for(const c of selected)if(!reached.has(c)&&[...reached].some(s=>compatible(s,c))){reached.add(c);changed=true;}}
  if(reached.size!==selected.length||clipping.union(...selected.map(polygon)).length!==1)throw Error('disconnected_team_territory');
}
module.exports={segmentContained,contained,compatible,options,assertSelection};
