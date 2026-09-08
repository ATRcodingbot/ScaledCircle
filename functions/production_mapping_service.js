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
  policy.prospective(c);
 }
 eligible(campaign,zone);
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
module.exports={analyze};
