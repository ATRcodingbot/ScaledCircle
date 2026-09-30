'use strict';
const pi=require('./property_intelligence');
// Only an unambiguous one-account / one-complete-footprint containment match.
// No nearest point, address guess, age transfer, household or stop creation.
function bind(snapshot,analysis,boundary) {
  if(!snapshot||!Array.isArray(analysis?.propertyRecords))return {snapshot,matching:{status:'unavailable'}};
  const records=analysis.propertyRecords.filter(r=>pi.pointInPolygon(r,boundary));
  const features=snapshot.targetFeatures||[],matches=new Map(),owners=new Map();
  for(const f of features) {
    if(!Array.isArray(f.footprint)||f.footprint.length<3)continue;
    // Legacy relation snapshots retain only the first outer ring. They cannot
    // certify a complete footprint or its holes; never use them for matching.
    if(f.footprintComplete!==true&&!String(f.id||'').startsWith('way/'))continue;
    if(f.footprintComplete===false||!require('./smart_zone_planning').validateGeometry(f.footprint).valid)continue;
    const found=records.filter(r=>pi.pointInPolygon(r,f.footprint)&&
      !(f.footprintHoles||[]).some(h=>pi.pointInPolygon(r,h)));
    matches.set(f.id,found);
    for(const r of found)owners.set(r.propertyId,(owners.get(r.propertyId)||0)+1);
  }
  let matched=0,ambiguous=0,classified=0;
  const targetFeatures=features.map(f=>{
    const found=matches.get(f.id)||[];
    if(found.length!==1||owners.get(found[0].propertyId)!==1){if(found.length)ambiguous++;return f;}
    matched++;
    if(!['unclassified_building','unclassified_address'].includes(f.kind))return f;
    const r=found[0];
    if(r.residential!==true)return f; // Commercial mixed use needs explicit mapped category evidence.
    classified++;
    return {...f,kind:'residential',classificationSource:{provider:analysis.source,version:analysis.sourceVersion,
      rule:'one_official_account_point_in_one_complete_mapped_footprint',propertyId:r.propertyId},
      observedTags:f.observedTags};
  });
  const matching={status:'available',insidePropertyRecords:records.length,matchedFootprints:matched,
    newlyClassifiedFootprints:classified,ambiguousFootprints:ambiguous,
    unmatchedPropertyRecords:records.filter(r=>!owners.has(r.propertyId)).length,
    rule:'one-to-one point-in-footprint containment; no nearest matching or individual age transfer'};
  return {snapshot:{...snapshot,targetFeatures},matching};
}
module.exports={bind};
