'use strict';
const clipping=require('polygon-clipping');
const {createHash}=require('node:crypto');
const {validateGeometry}=require('./property_intelligence');
const STEP=0.01;
const fail=()=>{throw Error('invalid_saved_service_area_geometry');};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const point=p=>{
  const x=Array.isArray(p)?p[0]:p?.longitude,y=Array.isArray(p)?p[1]:p?.latitude;
  if(typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>180||Math.abs(y)>90)fail();
  return [x,y];
};
function ringArea(r){
  const [x,y]=r[0];let a=0;
  for(let i=1;i<r.length;i++)a+=(r[i-1][0]-x)*(r[i][1]-y)-(r[i][0]-x)*(r[i-1][1]-y);
  return Math.abs(a/2);
}
const area=multi=>multi.reduce((sum,p)=>sum+ringArea(p[0])-p.slice(1).reduce((n,r)=>n+ringArea(r),0),0);
function ring(raw){
  if(!Array.isArray(raw)||raw.length<3||raw.length>10000)fail();
  const r=raw.map(point).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
  if(r.length<3)fail();
  if(r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1])r.push([...r[0]]);
  if(r.length<4||ringArea(r)<=0)fail();
  if(Math.max(...r.map(p=>p[0]))-Math.min(...r.map(p=>p[0]))>180)fail();
  return r;
}
function canonical(multi){
  const canonicalRing=r=>{
    const open=r.slice(0,-1);let best=0;
    for(let i=1;i<open.length;i++)if(open[i][0]<open[best][0]||open[i][0]===open[best][0]&&open[i][1]<open[best][1])best=i;
    const forward=[...open.slice(best),...open.slice(0,best)];
    const reverse=[forward[0],...forward.slice(1).reverse()];
    const result=JSON.stringify(forward)<JSON.stringify(reverse)?forward:reverse;
    return [...result,result[0]];
  };
  return multi.map(p=>[canonicalRing(p[0]),...p.slice(1).map(canonicalRing).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])
    .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function polygons(record){
  const g=record.geometry||(['Polygon','MultiPolygon'].includes(record.type)?record:null);
  if(g?.type==='Polygon'||g?.type==='MultiPolygon'){
    const raw=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    if(!Array.isArray(raw)||!raw.length||raw.length>64)fail();
    return raw.map(p=>{if(!Array.isArray(p)||!p.length||p.length>64)fail();return p.map(ring);});
  }
  if(record.geometryEncoding&&record.geometryEncoding!=='map-parts-v1')fail();
  if(Array.isArray(record.geometryParts)&&record.geometryParts.length){
    if(record.geometryParts.length>64)fail();
    return record.geometryParts.map(p=>[ring(p?.points||p)]);
  }
  const raw=g?.points||g;
  if(Array.isArray(raw)&&raw.length)return [[ring(raw)]];
  if(record.type==='around_business'){
    const [lon,lat]=point(record.center),radius=record.radiusMiles;
    if(typeof radius!=='number'||!Number.isFinite(radius)||radius<=0||radius>250||Math.abs(lat)>=89)fail();
    // Match maintained saved-radius representation; no inferred city boundary.
    return [[ring(Array.from({length:48},(_,i)=>{const angle=2*Math.PI*i/48;
      return [lon+radius/(69*Math.cos(lat*Math.PI/180))*Math.cos(angle),lat+radius/69*Math.sin(angle)];}))]];
  }
  fail();
}
function normalizeAreas(preferences){
  if(!Array.isArray(preferences?.areas)||preferences.areas.length>64)fail();
  const ids=new Set(),areas=[];
  for(const [i,saved]of preferences.areas.entries()){
    if(saved?.enabled===false)continue;
    if(!saved||typeof saved!=='object')fail();
    const id=typeof saved.id==='string'&&saved.id.trim()?saved.id.trim():`area_${i+1}`;
    if(ids.has(id))fail();ids.add(id);
    const shape=canonical(clipping.union(polygons(saved)));
    if(!shape.length||area(shape)<=0)fail();
    areas.push({id,name:typeof saved.name==='string'&&saved.name.trim()?saved.name.trim():`Service Area ${i+1}`,polygons:shape});
  }
  if(!areas.length)fail();
  areas.sort((a,b)=>a.id.localeCompare(b.id));
  const union=canonical(clipping.union(...areas.map(a=>a.polygons)));
  return {areas,union,digest:hash(union)};
}
const box=polygon=>{
  const points=polygon[0];return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
};
const rectangle=(x0,y0,x1,y1)=>[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]];
function intersects(a,b){return area(clipping.intersection(a,b))>0;}
function overlapsGeometry(a,b){return intersects([[ring(a)]],[[ring(b)]]);}
function isContained(geometry,union){
  const subject=[[ring(geometry)]],outside=area(clipping.difference(subject,union));
  // Only sub-numerical clipping residue is tolerated; never a geographic buffer.
  return outside<=Math.max(1e-18,area(subject)*1e-10);
}
function candidates(normalized,{maxCandidates=5000}={}){
  if(!Number.isSafeInteger(maxCandidates)||maxCandidates<1||maxCandidates>5000)throw Error('invalid_candidate_limit');
  const ranges=normalized.union.map(p=>{
    const [x0,y0,x1,y1]=box(p),left=Math.floor(x0/STEP),bottom=Math.floor(y0/STEP);
    const width=Math.max(1,Math.ceil(x1/STEP)-left),height=Math.max(1,Math.ceil(y1/STEP)-bottom);
    return {p,left,bottom,width,height,count:width*height};
  });
  const total=ranges.reduce((s,r)=>s+r.count,0),iterationCap=Math.min(20000,Math.max(1000,maxCandidates*4));
  const cells=new Map(),add=(x,y)=>{const key=x+':'+y;if(!cells.has(key)&&cells.size<iterationCap)cells.set(key,[x,y]);};
  const exhaustive=total<=iterationCap;
  if(exhaustive){for(const r of ranges)for(let i=0;i<r.count;i++)add(r.left+i%r.width,r.bottom+Math.floor(i/r.width));}
  else{
    // Seed every component at its boundary, then spread bounded samples across
    // each component's grid. Large empty bounding boxes cannot force huge loops.
    for(const r of ranges){const [x,y]=r.p[0][0],cx=Math.floor(x/STEP),cy=Math.floor(y/STEP);for(const dx of [-1,0])for(const dy of [-1,0])add(cx+dx,cy+dy);}
    const each=Math.max(1,Math.floor((iterationCap-cells.size)/ranges.length));
    for(const r of ranges)for(let i=0,n=Math.min(each,r.count);i<n;i++){const index=Math.floor(i*r.count/n);add(r.left+index%r.width,r.bottom+Math.floor(index/r.width));}
  }
  const output=[],seen=new Set();let splitCount=0,unresolved=0,truncated=false,examinedGridCells=0;
  function emit(p,depth=0){
    if(output.length>=maxCandidates){truncated=true;return;}
    if(p.length===1&&p[0].length-1<=250){
      const geometry=p[0].slice(0,-1).map(([longitude,latitude])=>({latitude,longitude}));
      validateGeometry(geometry);
      const id=hash(canonical([p]));if(seen.has(id))return;seen.add(id);
      const matching=normalized.areas.filter(a=>intersects([p],a.polygons));
      output.push({id,areaIds:matching.map(a=>a.id),areaName:matching.map(a=>a.name).join(' / '),geometry});return;
    }
    if(depth>=24||splitCount>=20000){unresolved++;return;}
    splitCount++;
    const [x0,y0,x1,y1]=box(p);
    // Cut through a hole, opening it into notches. Never discard a hole ring.
    const hole=p[1],cut=hole?(Math.min(...hole.map(v=>v[0]))+Math.max(...hole.map(v=>v[0])))/2:(x0+x1)/2;
    if(!(cut>x0&&cut<x1)){unresolved++;return;}
    for(const half of [rectangle(x0,y0,cut,y1),rectangle(cut,y0,x1,y1)])for(const part of clipping.intersection([p],[half]))emit(part,depth+1);
  }
  for(const [x,y]of cells.values()){
    if(output.length>=maxCandidates){truncated=true;break;}
    examinedGridCells++;
    for(const part of clipping.intersection(normalized.union,[rectangle(x*STEP,y*STEP,(x+1)*STEP,(y+1)*STEP)]))emit(part);
  }
  const covered=output.reduce((s,c)=>s+ringArea(ring(c.geometry)),0),complete=exhaustive&&!truncated&&!unresolved;
  return {candidates:output,sampling:{gridDegrees:STEP,complete,wholeAreaAnalyzed:false,
    boundedGridCells:cells.size,examinedGridCells,boundingGridCellsUpperBound:total,iterationCap,candidateLimit:maxCandidates,
    candidateCount:output.length,unresolvedFragments:unresolved,
    approximatePlanarCoverageFraction:Math.min(1,covered/area(normalized.union)),
    message:complete?'These sections cover the mapped area; property analysis is performed separately.':'These are bounded sampled sections. Unexamined territory remains; they are not the best sections of the whole service area.'}};
}
module.exports={normalizeAreas,candidates,intersects,overlapsGeometry,isContained};
