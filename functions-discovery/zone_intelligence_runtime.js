'use strict';
const crypto=require('node:crypto');
const projection=require('./zone_intelligence');
const operations=require('./operational_layer');
const contract=require('./smart_zone_entry_contract');
const planning=require('./smart_zone_planning');
const pi=require('./property_intelligence');
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))fail('invalid-argument','Choose a valid campaign or area.');return v;};
async function preview({db,context,data,fetchSnapshot,endpoint,now=Date.now,onDiagnostic,loadPropertyAnalysis}) {
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
  let propertyContext=null,propertyAnalysis=null;
  const piDigest=pi.geometryDigest(geometry);
  const key=crypto.createHash('sha256').update(`${pi.ANALYSIS_VERSION}:${pi.DATA_SOURCE_BUNDLE_VERSION}:${piDigest}`).digest('hex');
  const cached=(await db.doc('propertyIntelligenceCache/'+key).get()).data();
  if(pi.cacheIsReusable(cached,{digest:piDigest,now:now()})){
    const a=cached.analysis;
    propertyAnalysis=a;
    propertyContext={scope:a.inputGranularity==='parcel_level'?'selected_area_parcel_points':'regional_property_context',source:{name:a.source,dataTimestamp:a.dataUpdatedAt||null,
      fetchedAt:a.generatedAt||null},signals:a.predominantConstructionEra?[{label:'Predominant nearby housing era',
      value:a.predominantConstructionEra,source:a.source}]:[],partial:a.partialCoverage===true};
  }
  // Permitted neutral property acquisition is independent of sparse OSM tags.
  // No ranking, AI, premium entitlement or new credential is needed here.
  if(!propertyAnalysis&&loadPropertyAnalysis)try{propertyAnalysis=await loadPropertyAnalysis(geometry);}catch(_){/* unavailable remains explicit */}
  if(propertyAnalysis&&propertyAnalysis.geometryDigest!==piDigest)propertyAnalysis=null;
  let snapshot=null,acquisition=null;
  const requestId=crypto.randomUUID(),started=now();
  try{snapshot=await fetchSnapshot({selectedBoundary:geometry,endpoint,onDiagnostic:d=>{
    acquisition={status:d.status,reasonCode:d.reasonCode,cacheReason:d.cacheReason,coverage:d.coverage||null,rawElementCount:d.rawElementCount??null,
      classifications:Object.fromEntries(Object.entries(d.classifiedTargetCounts||{}).filter(([k,v])=>['residential','business','event','unclassified_address','unclassified_building'].includes(k)&&Number.isInteger(v)&&v>=0)),
      targetFeatureCount:d.targetFeatureCount??null,routeWayCount:d.routeWayCount??null,
      exclusionPolygonCount:d.exclusionPolygonCount??null,unresolvedLandFeatureCount:d.unresolvedLandFeatureCount??null,
      providerResult:d.refresh?require('./smart_zone_public_cache_runtime').safeDiagnostic(d.refresh):null};
  }});}catch(_){acquisition={status:'unavailable',reasonCode:'acquisition_failed'};}
  const binding=require('./property_map_binding').bind(snapshot,propertyAnalysis,geometry);
  snapshot=binding.snapshot;
  const result=projection.analyze({geometry,snapshot,workType,propertyContext,acquisition});
  result.selectedAreaPropertyFacts=propertyAnalysis?.recordCoverage?{...propertyAnalysis.recordCoverage,
    source:propertyAnalysis.source,sourceVersion:propertyAnalysis.sourceVersion,scope:'official parcel points inside this boundary',
    dataUpdatedAt:propertyAnalysis.dataUpdatedAt||null,retrievedAt:propertyAnalysis.retrievedAt||propertyAnalysis.generatedAt||null,
    constructionEra:propertyAnalysis.predominantConstructionEra||null}:null;
  result.propertyMatching=binding.matching;
  const trace={requestId,campaignId,workspaceId:context.uid,geometryDigest:digest,
    geometryEncoding:'lat-lng-points-v1',geometry,
    vertexCount:geometry.length,bounds:require('./smart_zone_public_cache').boundsOf(geometry),intent:result.targetIntent,
    elapsedMs:now()-started,status:result.status,acquisition,diagnostics:result.diagnostics||null,
    source:result.source,coverage:result.coverage||null,mappedTargetCount:result.mappedTargetCount,
    supportingStreetMeters:result.supportingStreetMeters,workloadMinutes:result.workload?.minutes??null,
    workloadComponents:result.workloadComponents||null,selectedAreaPropertyFacts:result.selectedAreaPropertyFacts,
    propertyMatching:result.propertyMatching};
  try{onDiagnostic?.(trace);}catch(_){}
  let teamCapacityAnalysis=null;
  if(campaign.executionMode==='own_team'){
    const input=data.teamCapacity??campaign.campaignWorkload;
    try{const capacity=require('./own_team_capacity'),r=capacity.requirement(input);
      teamCapacityAnalysis=result.workload?capacity.allocate(r,[{id:digest,workload:{estimatedMinutes:result.workload.minutes}}]):
        {...r,supportedMinutes:null,estimatedFieldElapsedMinutes:null,estimatedElapsedMinutes:null,sharedTravelMinutes:null};
    }catch(_){teamCapacityAnalysis={state:'review_inputs',supportedMinutes:null,estimatedElapsedMinutes:null};}
  }
  return {...result,requestId,teamCapacityAnalysis};
}
async function confirm(options) {
  const {db,FieldValue,context,data}=options;
  const campaignId=id(data.campaignId),zoneId=id(data.zoneId);
  // Never persist a caller's substitute geometry or claimed observations.
  const result=await preview({...options,data:{campaignId,zoneId}});
  return db.runTransaction(async tx=>{
    if(options.reauthorize)await options.reauthorize(tx);
    const [cs,zs,payments,contracts]=await Promise.all([
      tx.get(db.doc('campaigns/'+campaignId)),tx.get(db.doc('campaignZones/'+zoneId)),
      tx.get(db.collection('campaignPayments').where('campaignId','==',campaignId).limit(1)),
      tx.get(db.collection('assignmentCompensations').where('campaignId','==',campaignId).limit(1))]);
    const c=cs.data(),z=zs.data();
    if(!c||!z||c.businessId!==context.uid||z.businessId!==context.uid||z.campaignId!==campaignId)
      fail('permission-denied','Choose your own campaign Zone.');
    if(c.status!=='draft'||z.assignedScalerId||z.mapLocked||!['','unassigned'].includes(z.status||'')||
        !payments.empty||!contracts.empty)fail('failed-precondition','This Zone is no longer an unfunded planning area.');
    if(operations.zoneGeometryDigest(z.serviceArea)!==result.geometryDigest)
      fail('aborted','The boundary changed. Analyze it again.');
    tx.update(zs.ref,{zoneIntelligence:result,zoneIntelligenceUpdatedAt:FieldValue.serverTimestamp()});
    return result;
  });
}
module.exports={preview,confirm};
