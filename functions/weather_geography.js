'use strict';
const clipping=require('polygon-clipping');
const {decodeServiceAreaGeometryFromFirestore:decode}=require('./service_area_geometry_codec');
function ring(raw){
 if(!Array.isArray(raw)||raw.length<3||raw.length>10000)throw Error('weather_geometry_unresolved');
 const points=raw.map(p=>Array.isArray(p)?p:[p?.longitude,p?.latitude]);
 if(points.some(p=>p.length<2||!p.slice(0,2).every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))throw Error('weather_geometry_unresolved');
 if(points[0][0]!==points.at(-1)[0]||points[0][1]!==points.at(-1)[1])points.push([...points[0]]);
 return points;
}
function geometry(value){
 if(value?.geometry?.type)return geometry(value.geometry);
 if(value?.type==='Polygon')return [value.coordinates.map(ring)];
 if(value?.type==='MultiPolygon')return value.coordinates.map(p=>p.map(ring));
 const area=decode(value);
 if(area?.geometryParts?.length)return area.geometryParts.map(p=>[ring(p)]);
 throw Error('weather_geometry_unresolved');
}
function overlap(a,b){return clipping.intersection(a,b).length>0;}
function within(a,b){return clipping.difference(a,b).length===0;}
function union(parts){return clipping.union(...parts);}
function coverage({preferences,extraAreas=[]}){
 const areas=[],unresolved=[];
 for(const [items,kind] of [[preferences?.areas||[],'service'],[extraAreas,'watch']])for(const area of items){
   if(area?.enabled===false)continue;
   try{areas.push({id:area.id,name:area.name||area.placeLabel||'Saved area',kind,geometry:geometry(area)});}
   catch{unresolved.push({id:area.id||null,kind});}
 }
 return {areas,unresolved};
}
// Never broaden a polygon warning to its whole county. For null geometry,
// resolve official affected zones (including county UGCs) to their boundaries.
async function alertGeometry(feature,loadZone){
 if(feature.geometry)return {geometry:geometry(feature.geometry),basis:'official_polygon'};
 const p=feature.properties||{},urls=new Set((p.affectedZones||[]).filter(u=>
   /^https:\/\/api\.weather\.gov\/zones\/(county|forecast|fire|marine)\/[A-Z]{2}[CZ]\d{3}$/.test(u)));
 for(const ugc of p.geocode?.UGC||[])if(/^[A-Z]{2}C\d{3}$/.test(ugc))urls.add('https://api.weather.gov/zones/county/'+ugc);
 if(!urls.size)throw Error('weather_alert_coverage_unresolved');
 const parts=[];for(const url of urls){const feature=await loadZone(url);parts.push(...geometry(feature.geometry));}
 return {geometry:clipping.union(...parts.map(p=>[p])),basis:'official_county_or_zone'};
}
function matches(covered,alert){
 return covered.areas.filter(a=>overlap(a.geometry,alert.geometry)).map(a=>({id:a.id,name:a.name,kind:a.kind,
   partial:clipping.difference(a.geometry,alert.geometry).length>0,
   reason:a.kind==='watch'?'In an additional area you chose to monitor.':
     `Intersects your ${a.name} service area.`,basis:alert.basis}));
}
module.exports={geometry,coverage,alertGeometry,matches,within,union};
