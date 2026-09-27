'use strict';
const crypto=require('node:crypto');
const projection=require('./zone_intelligence');
const operations=require('./operational_layer');
const contract=require('./smart_zone_entry_contract');
const planning=require('./smart_zone_planning');
const pi=require('./property_intelligence');
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))fail('invalid-argument','Choose a valid campaign or area.');return v;};
async function preview({db,context,data,fetchSnapshot,endpoint,now=Date.now}) {
  if(!context?.uid)fail('unauthenticated','Sign in to review your area.');
  if(context.role!=='business'||context.isAdmin||!context.permissions?.includes('campaigns'))
    fail('permission-denied','Business campaign access is required.');
  const campaignId=id(data.campaignId), campaign=(await db.doc('campaigns/'+campaignId).get()).data();
  if(!campaign)fail('not-found','Campaign not found.');
  if(campaign.businessId!==context.uid)fail('permission-denied','This campaign belongs to another Business.');
  let zone=null;
  if(data.zoneId){
    zone=(await db.doc('campaignZones/'+id(data.zoneId)).get()).data();
    if(!zone)fail('not-found','Area not found.');
    if(zone.campaignId!==campaignId||zone.businessId!==context.uid)fail('permission-denied','This area does not belong to this campaign.');
  }
  let geometry;
  try {geometry=contract.normalizeAnalysisBoundary(data.geometry??zone?.serviceArea);} catch(_){fail('invalid-argument','Draw a simple boundary without crossings or retraced lines.');}
  if(!geometry)fail('invalid-argument','Choose an area to analyze.');
  const digest=operations.zoneGeometryDigest(geometry),workType=campaign.campaignType||campaign.type||'field_distribution';
  // Reuse immutable recommendation observations for the SAME boundary only.
  // No inference from a neighboring Zone, global ZIP totals, or client facts.
  if(zone?.smartZonePlanId && zone.smartZoneTargetEvidence?.geometryDigest===digest &&
      zone.serverZoneGeometryDigest===digest && operations.zoneGeometryDigest(zone.serviceArea)===digest &&
      /^[a-f0-9]{64}$/.test(campaign.smartZoneRecommendationRunId||'')){
    const run=(await db.doc(`propertyRecommendationWorkspaces/${context.uid}/mappingRuns/${campaign.smartZoneRecommendationRunId}`).get()).data();
    if(run?.status==='complete'&&run?.businessId===context.uid&&run?.campaignId===campaignId){
      const candidate=run.searchEvidence?.candidates?.find(c=>operations.zoneGeometryDigest(c.geometry)===digest);
      const age=now()-Date.parse(candidate?.source?.dataTimestamp);
      if(candidate&&Number.isFinite(age)&&age>=0&&age<=30*86400000){
        const result=projection.recommended(candidate,workType,run.searchEvidence.targetIntent);
        result.source={...result.source,freshness:require('./smart_zone_public_cache').freshness(candidate.source.dataTimestamp,now())};
        if(age>14*86400000)result.limitations.push('Mapping evidence is stale; refresh and review local access.');
        return result;
      }
    }
  }
  if(planning.polygonAreaSquareMeters(geometry)>planning.MAX_GEOGRAPHIC_QUERY_SQUARE_METERS)
    return projection.analyze({geometry,workType,snapshot:null});
  // Reuse neutral, geometry-bound PI cache when present. No ranking/AI call,
  // no entitlement to premium PI tools, and no demographic target inference.
  let propertyContext=null;
  const piDigest=pi.geometryDigest(geometry);
  const key=crypto.createHash('sha256').update(`${pi.ANALYSIS_VERSION}:${pi.DATA_SOURCE_BUNDLE_VERSION}:${piDigest}`).digest('hex');
  const cached=(await db.doc('propertyIntelligenceCache/'+key).get()).data();
  if(pi.cacheIsReusable(cached,{digest:piDigest,now:now()})){
    const a=cached.analysis;
    propertyContext={scope:'regional_property_context',source:{name:a.source,dataTimestamp:a.dataUpdatedAt||null,
      fetchedAt:a.generatedAt||null},signals:a.predominantConstructionEra?[{label:'Predominant nearby housing era',
      value:a.predominantConstructionEra,source:a.source}]:[],partial:a.partialCoverage===true};
  }
  let snapshot=null;
  try{snapshot=await fetchSnapshot({selectedBoundary:geometry,endpoint});}catch(_){/* safe unavailable projection */}
  return projection.analyze({geometry,snapshot,workType,propertyContext});
}
module.exports={preview};
