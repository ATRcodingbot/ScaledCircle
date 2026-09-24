'use strict';
const policy=require('./production_campaign_policy');
const routes=require('./canvassing_route_authority');
const geography=require('./smart_zone_geography');
const operations=require('./operational_layer');
const {hash}=require('./route_progress');
async function analyze({db,FieldValue,zoneId,uid,reviewDigest,endpoint,estimateHomes}) {
 const zoneRef=db.doc('campaignZones/'+zoneId),snapshot=await zoneRef.get(),zone=snapshot.data();
 if(!zone||zone.businessId!==uid)throw Error('owned_draft_zone_required');
 const campaignRef=db.doc('campaigns/'+zone.campaignId),campaign=(await campaignRef.get()).data();
 function eligible(c,z) {
  if(!c||c.businessId!==uid||c.status!=='draft'||z.assignedScalerId||z.status!=='unassigned'||z.mapLocked===true||
     !['','unfunded','payment_failed','checkout_expired'].includes(String(c.fundingStatus||'')))throw Error('unworked_unfunded_zone_required');
 }
 eligible(campaign,zone);
 // A saved target can be researched while new paid contracts remain held.
 // Planning does not approve a route or attach a compensation policy.
 if(process.env.CANVASSING_NEW_CONTRACTS_ENABLED!=='true') {
  if(reviewDigest)throw Error('paid_route_approval_unavailable_while_execution_held');
  return analyzePlanning({db,FieldValue,zoneRef,campaignRef,zone,campaign,eligible});
 }
 policy.prospective(campaign);
 const metrics=operations.calculateGeometryWalkingEstimate(zone.serviceArea);
 operations.assertZoneDuration(metrics.estimatedWalkingMinutes);
 const mapped=await geography.fetchSnapshot({selectedBoundary:zone.serviceArea,endpoint});
 const authority=routes.derive({campaignId:zone.campaignId,zoneId,corridor:zone.serviceArea,snapshot:mapped});
 const digest=hash({executionRoute:authority.executionRoute,source:authority.coverageAuthority.sourceSnapshotDigest});
 if(reviewDigest&&reviewDigest!==digest)throw Error('route_changed_review_again');
 const reviewed=reviewDigest===digest;
 authority.coverageAuthority={...authority.coverageAuthority,state:reviewed?'approved':'review_required',accessReviewed:reviewed,
   ...(reviewed?{reviewedBy:uid,reviewDigest:digest}:{})};
 const homes=estimateHomes({geographicResult:{addressCount:mapped.serviceablePoints.filter(p=>p.kind==='property').length,
   residentialBuildingCount:0,totalBuildingCount:0,source:mapped.source},areaAcres:metrics.areaSquareMeters/4046.8564224});
 await db.runTransaction(async tx=>{
  const [freshZone,freshCampaign]=await Promise.all([tx.get(zoneRef),tx.get(campaignRef)]);
  eligible(freshCampaign.data(),freshZone.data()||{});
  if(hash(freshZone.data().serviceArea)!==hash(zone.serviceArea))throw Error('route_changed_review_again');
  tx.update(zoneRef,{...authority,analysisStatus:'complete',mapped:true,completionPolicyVersion:policy.version,
    serviceAreaPointCount:zone.serviceArea.length,estimatedHomes:homes.estimatedHomes,homeCountStatus:'estimated',
    homeCountMethod:homes.method,homeCountConfidence:homes.confidence,serverEstimatedWalkingMinutes:metrics.estimatedWalkingMinutes,
    estimatedMinutes:metrics.estimatedWalkingMinutes,estimatedWalkingMeters:metrics.estimatedWalkingMeters,
    serverZoneMetricsVersion:metrics.version,serverZoneGeometryDigest:operations.zoneGeometryDigest(zone.serviceArea),updatedAt:FieldValue.serverTimestamp()});
  tx.update(campaignRef,{completionPolicyVersion:policy.version,updatedAt:FieldValue.serverTimestamp()});
 });
 return {success:true,zoneId,analysisStatus:'complete',routeReviewRequired:!reviewed,routeReviewDigest:digest,
   routePreview:{...authority,geometry:zone.serviceArea,name:zone.zoneName||'Mapped Zone'}};
}
async function analyzePlanning({db,FieldValue,zoneRef,campaignRef,zone,campaign,eligible,provider}) {
 const property=require('./property_intelligence');
 const digest=hash(zone.serviceArea);
 const previous=zone.targetPlanning;
 if(previous?.geometryDigest===digest && previous.status==='complete' &&
    previous.materialsAvailable===(Number(campaign.materialQuantity)||null) &&
    Number.isFinite(previous.checkedAtMs) && Date.now()>=previous.checkedAtMs && Date.now()-previous.checkedAtMs<86400000) {
  return {success:true,zoneId:zoneRef.id,analysisStatus:'complete',planningOnly:true,targetPlanning:previous};
 }
 // One bounded provider scan: no fabricated acreage-density fallback or paid call.
 let result;
 try {
  const geometry=property.validateGeometry(zone.serviceArea);
  const deadline=Date.now()+35000;
  const fetchJson=async(url,{timeoutMs=10000}={})=>{
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('property_source_time_budget_reached');
   const response=await fetch(url,{signal:AbortSignal.timeout(Math.min(remaining,timeoutMs)),headers:{'User-Agent':'ScaledCircle Planning support@scaledcircle.com'}});
   if(!response.ok)throw Error('property_source_http_'+response.status);
   return response.json();
  };
  const data=provider ? await provider.analyze({geometry}) : await property.analyzeWithFallback({geometry,providers:[
   new property.MarylandPropertyProvider({fetchJson}),new property.CensusPropertyProvider({fetchJson})]});
  result=planningResult({zone,campaign,data});
 }catch(error){result={status:'unavailable',reason:String(error.message||'property_source_unavailable').slice(0,160),residentialProperties:null,
   limitations:['Target preserved. No reliable delivery-stop or workload count is available. Retry analysis or select a smaller planning target.']};}
 const targetPlanning={...result,geometryDigest:digest,checkedAtMs:Date.now(),version:'CampaignTargetPlanningV1'};
 await db.runTransaction(async tx=>{
  const [z,c]=await Promise.all([tx.get(zoneRef),tx.get(campaignRef)]);
  eligible(c.data(),z.data()||{});
  if(hash(z.data().serviceArea)!==digest)throw Error('target_changed_retry_analysis');
  tx.update(zoneRef,{targetPlanning,analysisStatus:result.status,homeCountStatus:'unavailable',estimatedHomes:FieldValue.delete(),
   homeCountError:result.reason||'Property records are not verified households or delivery stops.',analysisUpdatedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
 });
 return {success:true,zoneId:zoneRef.id,analysisStatus:result.status,planningOnly:true,targetPlanning};
}
function planningResult({zone,campaign,data}) {
 const areaSquareMeters=operations.calculateGeometryWalkingEstimate(zone.serviceArea).areaSquareMeters;
 if(!data || data.source==='none')return {status:'unavailable',reason:'No supported property records returned for this target.',residentialProperties:null,areaSquareMeters,
  limitations:[...(data?.limitations||[]),...(data?.providerFailures||[]),'No household, material-demand or workload total inferred from acreage.']};
 return {status:data.partialCoverage?'partial':'complete',source:data.source,sourceVersion:data.sourceVersion,dataDate:data.dataUpdatedAt||null,
  residentialProperties:data.residentialStructureCount,metric:data.geographyType==='census_block_group'?'Housing units in intersecting Census block groups':'Residential property records',coverage:data.providerPagination||null,
  areaSquareMeters,areaAcres:areaSquareMeters/4046.8564224,deliveryStops:null,materialsAvailable:Number(campaign.materialQuantity)||null,
  materialBasis:'Confirm accessible delivery stops and pieces per stop before treating materials on hand as sufficient. Spare allowance is not assumed.',
  workloadMinutes:null,workloadReason:areaSquareMeters>geography.MAX_QUERY_AREA_SQUARE_METERS?'Target exceeds the bounded route-analysis area; plan smaller worker-sized Zones without changing the saved Business territory.':'A serviceable route and accessible stops are required to estimate workload.',
  maximumMinutesPerZone:360,maximumZones:32,limitations:[...(data.limitations||[]),...(data.providerFailures||[]),
   'Residential property records are not exact housing units, addresses or accessible doors. Multi-unit and vacant-property access requires review.',
   'No buying intent, response rate, delivery completion or ROI is inferred.']};
}
module.exports={analyze,analyzePlanning,planningResult};
