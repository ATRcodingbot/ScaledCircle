'use strict';
// The maintained polygon-clipping engine is also used by Property Intelligence.
// Stored parts retain the exact saved vertices; unions/intersections are read models.
const clipping=require('polygon-clipping');
const m=require('./model');
const {polygon}=require('./campaign_map_record');
const THRESHOLD=Object.freeze({minSquareMeters:25,minProposedAreaFraction:0.001});
const RADIANS=Math.PI/180,EARTH_METERS=6371008.8;
const invalid=()=>m.fail('failed-precondition','The saved boundary crosses or retraces itself. Use a simple mapped polygon.');
function simpleRing(raw){
 if(raw.length>1001)m.fail('resource-exhausted','Use a boundary with no more than 1,000 vertices for marketing planning.');
 const points=raw.filter((p,i)=>!i||p[0]!==raw[i-1][0]||p[1]!==raw[i-1][1]);
 if(points.length>1&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points.pop();
 if(points.length<3||points.length>1000)invalid();
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const nearZero=n=>Math.abs(n)<=1e-16;
 const between=(a,b,p)=>p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
 const n=points.length,edges=points.map((a,i)=>{const b=points[(i+1)%n],c=points[(i+2)%n];
  if(nearZero(cross(a,b,c))&&(a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1])>0)invalid();
  return {a,b,i,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])};
 }).sort((a,b)=>a.minX-b.minX);
 let active=[];
 for(const edge of edges){
  active=active.filter(other=>other.maxX>=edge.minX);
  for(const other of active){
   if(Math.abs(edge.i-other.i)===1||Math.abs(edge.i-other.i)===n-1||edge.minY>other.maxY||other.minY>edge.maxY)continue;
   const a=cross(edge.a,edge.b,other.a),b=cross(edge.a,edge.b,other.b),c=cross(other.a,other.b,edge.a),d=cross(other.a,other.b,edge.b);
   if((a*b<0&&c*d<0)||(nearZero(a)&&between(edge.a,edge.b,other.a))||(nearZero(b)&&between(edge.a,edge.b,other.b))||
    (nearZero(c)&&between(other.a,other.b,edge.a))||(nearZero(d)&&between(other.a,other.b,edge.b)))invalid();
  }
  active.push(edge);
 }
 return [...points,points[0]];
}
function parts(raw){
 if(!Array.isArray(raw)||!raw.length||raw.length>100)m.fail('failed-precondition','Save a supported geographic footprint before checking marketing history.');
 const result=raw.map(p=>({points:polygon(p?.points||p)}));
 if(result.reduce((n,p)=>n+p.points.length,0)>10000)m.fail('resource-exhausted','This geographic footprint is too large to compare safely.');
 return result;
}
function shape(raw){
 const polygons=parts(raw).map(p=>{
  const ring=simpleRing(p.points.map(p=>[p.longitude,p.latitude]));
  if(Math.max(...ring.map(p=>p[0]))-Math.min(...ring.map(p=>p[0]))>180)m.fail('failed-precondition','This geographic footprint crosses an unsupported map boundary.');
  return [ring];
 });
 try {const result=clipping.union(...polygons);if(!result.length||area(result)<=0)throw Error();return result;}
 catch(_){m.fail('failed-precondition','Saved geographic footprint needs review. Marketing history was not classified.');}
}
function ringArea(r){
 // Spherical area integral for saved lon/lat edges, subtracting holes below.
 let sum=0;for(let i=1;i<r.length;i++)sum+=(r[i][0]-r[i-1][0])*RADIANS*(Math.sin(r[i][1]*RADIANS)+Math.sin(r[i-1][1]*RADIANS));
 return Math.abs(sum)*EARTH_METERS*EARTH_METERS/2;
}
function area(multi){return multi.reduce((sum,p)=>sum+ringArea(p[0])-p.slice(1).reduce((n,r)=>n+ringArea(r),0),0);}
function reliablePercentage(subject){
 const points=subject.flat(2),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 // Local polygons only: <=0.25 degrees in either axis, away from polar regions.
 return Math.max(...xs)-Math.min(...xs)<=0.25&&Math.max(...ys)-Math.min(...ys)<=0.25&&Math.max(...ys.map(Math.abs))<=70;
}
function overlap(subject,previous){
 let intersection;try{intersection=clipping.intersection(subject,previous);}catch(_){m.fail('failed-precondition','Saved geographic footprint could not be compared.');}
 const proposedSquareMeters=area(subject),overlapSquareMeters=area(intersection),fraction=overlapSquareMeters/proposedSquareMeters;
 return {meaningful:overlapSquareMeters>=THRESHOLD.minSquareMeters&&fraction>=THRESHOLD.minProposedAreaFraction,overlapSquareMeters,fraction,intersection};
}
function unionPercent(subject,intersections){
 if(!intersections.length||!reliablePercentage(subject))return null;
 const union=clipping.union(...intersections),value=100*area(union)/area(subject);
 return Math.min(100,Math.max(0,Math.round(value*10)/10));
}
function containedParts(subjectParts,containerParts){
 const subject=shape(subjectParts),container=shape(containerParts);
 // Tolerate clipping residue only (1 square millimetre or 1e-10 relative area).
 return area(clipping.difference(subject,container))<=Math.max(1e-6,area(subject)*1e-10);
}
function twelveMonthsBefore(nowMs){
 if(!Number.isSafeInteger(nowMs))m.fail('invalid-argument','A valid current time is required.');
 const d=new Date(nowMs),year=d.getUTCFullYear()-1,month=d.getUTCMonth();
 const day=Math.min(d.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
 return Date.UTC(year,month,day,d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds());
}
module.exports={THRESHOLD,parts,shape,area,overlap,unionPercent,containedParts,twelveMonthsBefore};
