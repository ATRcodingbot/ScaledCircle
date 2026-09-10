'use strict';
// Read the current tenant's maintained geography. Never infer one Business's
// scope from another Business's name, email, sources or previous research.
const normalized=value=>typeof value==='string'?value.trim().toLowerCase().replace(/,?\s*united states$/,'').replace(/\s+/g,' '):'';
function serviceAreaScope(preferences, target, priorityIds=[]) {
  if(preferences?.schemaVersion!=='ServiceAreaPreferencesV1'||preferences.userUid!==target||preferences.role!=='business')
    return {status:'MISSING_MAINTAINED_GEOGRAPHY',areas:[],preferenceVersion:null};
  const seen=new Set();
  const areas=(preferences.areas||[]).filter(a=>a.enabled!==false&&a.type==='place'&&['city','county','zcta'].includes(a.geographyType)&&typeof a.id==='string'&&!seen.has(a.id)&&seen.add(a.id)).map(a=>({
    id:a.id,label:a.displayName||a.centerLabel||a.name,type:a.geographyType,
    locality:a.geographyType==='city'?a.city:a.geographyType==='county'?a.county:a.postalCode,state:a.state,
  })).filter(a=>a.locality&&a.state&&a.label);
  // A tenant's deployment preference can reorder only IDs already present in
  // its maintained record. It cannot add territory or cross tenant boundaries.
  const order=new Map(priorityIds.map((id,index)=>[id,index]));
  areas.sort((a,b)=>(order.get(a.id)??Number.MAX_SAFE_INTEGER)-(order.get(b.id)??Number.MAX_SAFE_INTEGER));
  return {status:areas.length?'AVAILABLE':'NO_ENABLED_SERVICE_AREAS',areas,preferenceVersion:preferences.preferenceVersion??null};
}
function matchArea(source,scope) {
  const geo=source.serviceArea;
  if(!geo)return null;
  return scope.areas.find(a=>a.type===geo.type&&normalized(a.locality)===normalized(geo.locality)&&normalized(a.state)===normalized(geo.state))||null;
}
function prioritizeSources(catalog,scope,existingUrls=[]) {
  const existing=new Set(existingUrls),rank=new Map(scope.areas.map((a,i)=>[a.id,i]));
  return catalog.filter(s=>matchArea(s,scope)||existing.has(s.url))
    .sort((a,b)=>(rank.get(matchArea(a,scope)?.id)??Number.MAX_SAFE_INTEGER)-(rank.get(matchArea(b,scope)?.id)??Number.MAX_SAFE_INTEGER));
}
function groupedDiscovery(rows,scope) {
  const groups=scope.areas.map(a=>({serviceAreaId:a.id,serviceArea:a.label,businesses:0,partners:0,individualScalers:0,total:0}));
  for(const row of rows){const area=matchArea(row,scope);let group=groups.find(g=>area?g.serviceAreaId===area.id:!g.serviceAreaId&&g.serviceArea===row.geography);
    if(!group){group={serviceAreaId:null,serviceArea:row.geography||'Area not recorded',businesses:0,partners:0,individualScalers:0,total:0};groups.push(group);}
    group.total++;if(row.kind==='business')group.businesses++;else if(row.kind==='referral_partner')group.partners++;else if(row.kind==='scaler')group.individualScalers++;
  }
  return groups;
}
module.exports={serviceAreaScope,matchArea,prioritizeSources,groupedDiscovery};
