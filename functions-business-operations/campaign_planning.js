'use strict';
const m=require('./model');
const {polygon}=require('./campaign_map_record');
const {shape,containedParts}=require('./marketing_history_geometry');
const {executionMode,planningDigest,assertPlanningReview}=require('./shared/campaign_execution_authority');
const {assertOwnTeamClean}=require('./own_team_authority');
const workload=require('./shared/campaign_workload_authority');
const TYPES=['neighborhoodCanvassing','flyer_distribution','door_hanger_distribution','business_card_distribution'];
const OPS=['createCampaignPlan','campaignPlanningContext','campaignWorkloadContext','saveCampaignWorkload','saveCampaignPlanningArea','saveCampaignMaterials','scheduleOwnTeamCampaign'];
function boundary(value){const points=polygon(value);shape([{points}]);return points;}
function date(value){if(!Number.isSafeInteger(value)||value<Date.UTC(2000,0,1)||value>Date.UTC(2100,0,1))m.fail('invalid-argument','Choose a valid campaign date.');return value;}
function dates(input){const start=date(input.scheduledStartAt),end=date(input.scheduledEndAt);if(end<=start)m.fail('invalid-argument','The end must follow the start.');return {start,end};}
function intelligence(zones){
 // Counts from different/intersecting source geographies cannot safely be added.
 // In particular a Census housing estimate is never a verified delivery count.
 const evidence=zones.map(z=>{const p=z.targetPlanning;const validGeometry=Array.isArray(z.serviceArea)&&z.serviceArea.length>=3&&z.serviceArea.every(v=>v&&Number.isFinite(v.latitude)&&Number.isFinite(v.longitude));const valid=p&&validGeometry&&p.geometryDigest===m.hash(z.serviceArea.map(v=>Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)))))&&['complete','partial'].includes(p.status);
  const routeEstimate=validGeometry&&z.analysisStatus==='complete'&&z.serverZoneGeometryDigest===require('./shared/operational_layer').zoneGeometryDigest(z.serviceArea);
  if(!valid&&z.homeCountMethod==='osm_classified_mapped_features_v2'){
   const e=z.smartZoneTargetEvidence;
   const supported=routeEstimate&&e?.geometryDigest===z.serverZoneGeometryDigest&&e?.measure==='mapped_target_features'&&e.source==='OpenStreetMap'&&e.verifiedDeliveryPoints===false&&['residential','business'].includes(e.targetIntent)&&Number.isSafeInteger(e.eligibleMappedFeatureCount)&&e.eligibleMappedFeatureCount>=0;
   const date=typeof e?.dataTimestamp==='string'&&Number.isFinite(Date.parse(e.dataTimestamp))?e.dataTimestamp:null;
   const retrievedAt=typeof e?.fetchedAt==='string'&&Number.isFinite(Date.parse(e.fetchedAt))?e.fetchedAt:null;
   return {zoneId:z.id,name:z.zoneName||z.name||'Zone',status:supported?'estimated':'unavailable',residentialProperties:supported?e.eligibleMappedFeatureCount:null,metric:supported?`Mapped ${e.targetIntent==='business'?'business':'residential'} target features`:null,source:supported?e.source:null,sourceVersion:supported?z.smartZonePolicyVersion||null:null,dataDate:supported?date:null,retrievedAt:supported?retrievedAt:null,workloadMinutes:supported&&Number.isFinite(z.estimatedWorkMinutes)?z.estimatedWorkMinutes:null,limitations:supported?['Mapped buildings or address features are not distinct households or verified accessible delivery points. Work time is an assumed-pace planning estimate, not a route obligation.',...(date?[]:['The source snapshot date is unavailable; retrieval time is not the data vintage.']),...(Array.isArray(e.limitations)?e.limitations:[])]:['Current mapped-target evidence is unavailable for this saved geometry. No material quantity can be inferred.']};
  }
  const legacyDemandEstimate=z.homeCountMethod==='smart_zone_conservative_density_v1'||z.smartZonePolicyVersion==='SmartZonePlanningV4';
  if(!valid&&legacyDemandEstimate)return {zoneId:z.id,name:z.zoneName||z.name||'Zone',status:'unavailable',residentialProperties:null,metric:'Legacy workload assumption — area review required',source:'Requested work hours × assumed properties per hour',sourceVersion:z.smartZonePolicyVersion||null,dataDate:null,workloadMinutes:null,limitations:['This historical Smart Zone count was derived from requested work hours, not an observed property inventory. It cannot establish residential targets, accessible delivery points or material quantity. Review the area using current geographic evidence.']};
  if(!valid&&routeEstimate)return {zoneId:z.id,name:z.zoneName||z.name||'Zone',status:'estimated',residentialProperties:Number.isFinite(z.estimatedHomes)?z.estimatedHomes:null,metric:'Estimated properties (planning estimate)',source:z.homeCountMethod||'Maintained Zone geometry analysis',sourceVersion:z.smartZonePolicyVersion||z.serverZoneMetricsVersion||null,dataDate:null,workloadMinutes:Number.isFinite(z.estimatedWorkMinutes)?z.estimatedWorkMinutes:Number.isFinite(z.serverEstimatedWalkingMinutes)?z.serverEstimatedWalkingMinutes:null,limitations:['Property counts and walking time are planning estimates, not verified accessible delivery points or completed work.']};
  return {zoneId:z.id,name:z.zoneName||z.name||'Zone',status:valid?p.status:'unavailable',
   residentialProperties:valid&&Number.isFinite(p.residentialProperties)?p.residentialProperties:null,
   metric:valid?p.metric:null,source:valid?p.source:null,sourceVersion:valid?p.sourceVersion:null,dataDate:valid?p.dataDate:null,
   workloadMinutes:valid&&Number.isFinite(p.workloadMinutes)?p.workloadMinutes:null,
   limitations:valid?(p.limitations||[]):['Analyze the current saved target to obtain source-backed planning information.']};});
 return {eligibleDistributionPoints:null,suggestedQuantity:null,housingEstimate:null,zones:evidence,
  limitations:['A verified accessible delivery-point inventory is not available. No automatic material quantity is asserted.',
   'Source estimates are shown per Zone; overlapping Census geographies are not summed into a delivery total.']};
}
function logistics(input,quantity){
 m.strict(input,['fulfillmentType','scheduledAt','windowEndAt','location','printingShopName','orderReference','instructions','latitude','longitude']);
 const type=m.choice(input.fulfillmentType,['scaler_pickup_print_shop','scaler_pickup_business','business_delivery','no_materials_required']);
 const result={materialFulfillmentType:type,materialHandoffMethod:type,materialsRequired:type!=='no_materials_required',
  materialHandoffAddress:m.text(input.location||'',500),materialHandoffPrintingShopName:m.text(input.printingShopName||'',200),
  materialHandoffOrderReference:m.text(input.orderReference||'',200),materialHandoffInstructions:m.text(input.instructions||'',2000)};
 if(result.materialsRequired&&(quantity<=0||!result.materialHandoffAddress||!input.scheduledAt))m.fail('invalid-argument','Set a material quantity, handoff location and time.');
 if(type==='scaler_pickup_print_shop'&&!result.materialHandoffPrintingShopName)m.fail('invalid-argument','Enter the printing shop name.');
 for(const [key,target]of [['scheduledAt','materialHandoffScheduledAt'],['windowEndAt','materialHandoffWindowEndAt']]){result[target]=input[key]?date(Date.parse(input[key])):null;}
 if(result.materialHandoffWindowEndAt!=null&&(result.materialHandoffScheduledAt==null||result.materialHandoffWindowEndAt<result.materialHandoffScheduledAt))m.fail('invalid-argument','Check the handoff window.');
 for(const [key,target,limit]of [['latitude','materialHandoffLatitude',90],['longitude','materialHandoffLongitude',180]]){const v=input[key];if(v!=null&&(!Number.isFinite(v)||Math.abs(v)>limit))m.fail('invalid-argument','Check the handoff location.');result[target]=v??null;}
 return result;
}
function createPlanner({db,FieldValue,authority,now=Date.now}){
 const legal=require('./shared/legal_consent').createLegalConsentService({db,FieldValue});
 const permission=a=>{if(a.internal||(!a.isOwner&&!a.permissions.includes('campaigns')))m.fail('permission-denied','Campaign permission for this Business is required.');};
 async function access(request,tx,write=false){const a=await authority(request,{transaction:tx,write:false});permission(a);if(write)await legal.requireCurrent({uid:a.actorUid,agreementTypes:['terms','privacy'],transaction:tx});return a;}
 async function read(tx,a,id){const snap=await tx.get(db.doc('campaigns/'+m.id(id)));if(!snap.exists)m.fail('not-found','Campaign not found.');const c={...snap.data(),id:snap.id};if(c.businessId!==a.businessId)m.fail('permission-denied','Choose your Business campaign.');if(!executionMode(c))m.fail('failed-precondition','Campaign execution mode needs review.');const zs=await tx.get(db.collection('campaignZones').where('campaignId','==',c.id).limit(101));if(zs.size>100)m.fail('resource-exhausted','Too many Zones to plan safely.');const zones=zs.docs.map(d=>({...d.data(),id:d.id}));if(zones.some(z=>z.businessId!==a.businessId))m.fail('permission-denied','Campaign Zone ownership needs review.');return {c,zones};}
 async function clean(tx,c,zones){
  const inventories={payments:await tx.get(db.collection('campaignPayments').where('campaignId','==',c.id).limit(1)),contracts:await tx.get(db.collection('assignmentCompensations').where('campaignId','==',c.id).limit(1)),assignments:await tx.get(db.collection(`campaigns/${c.id}/assignedScalers`).limit(1))};
  // Same immutable planning precondition applies to both modes. No funded,
  // assigned or earned work is ever converted back into an editable plan.
  assertOwnTeamClean({...c,executionMode:'own_team'},zones,inventories);
 }
 function version(c,expected){if(c.planningSchemaVersion!==1||!Number.isSafeInteger(expected)||expected!==c.planningVersion)m.fail('aborted','This plan changed. Refresh before saving.');}
 function editable(c){return c.status==='draft'&&c.planningSchemaVersion===1;}
 function context(c,zones){const hasArea=c.serviceArea?.length>=3||zones.some(z=>z.serviceArea?.length>=3),campaign={...c};for(const key of ['materialHandoffScheduledAt','materialHandoffWindowEndAt'])if(typeof c[key]?.toDate==='function')campaign[key]=c[key].toDate().toISOString();return {campaign,zones,areaDigest:hasArea?planningDigest(c,zones):null,areaIntelligence:intelligence(zones),editable:editable(c),planningVersion:c.planningVersion};}
 async function execute(request){
  const op=request.data.operation,input=request.data.input||{};await access(request,null);
  if(['campaignWorkloadContext','saveCampaignWorkload'].includes(op)){
   m.strict(input,op==='saveCampaignWorkload'?['campaignId','requestedHours','expectedWorkloadVersion']:['campaignId']);
   return db.runTransaction(async tx=>{
    const a=await access(request,tx,op==='saveCampaignWorkload'),{c,zones}=await read(tx,a,input.campaignId);
    if(op==='campaignWorkloadContext'){
      const run=/^[a-f0-9]{64}$/.test(c.smartZoneRecommendationRunId||'')?
        (await tx.get(db.doc(`propertyRecommendationWorkspaces/${a.businessId}/mappingRuns/${c.smartZoneRecommendationRunId}`))).data():null;
      return {...workload.summary(c,zones),workloadVersion:c.workloadVersion||0,
        recommendationReviewAvailable:run?.businessId===a.businessId&&run?.campaignId===c.id&&
          run?.actorUid===a.actorUid&&run?.status==='complete'&&run.expiresAtMs>now()&&
          Array.isArray(c.smartZoneSelectionIds)&&c.smartZoneSelectionIds.length===zones.length};
    }
    if(c.status!=='draft')m.fail('failed-precondition','Only an unfunded draft can change requested workload.');
    await clean(tx,c,zones);
    if(input.expectedWorkloadVersion!==(c.workloadVersion||0))m.fail('aborted','The requested workload changed. Refresh before saving.');
    const value=workload.requirement(input.requestedHours),version=(c.workloadVersion||0)+1;
    tx.update(db.doc('campaigns/'+c.id),{campaignWorkload:value,workloadVersion:version,
      workloadUpdatedBy:a.actorUid,workloadUpdatedAt:FieldValue.serverTimestamp(),
      materialsAreaDigest:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()});
    tx.create(db.doc(`campaigns/${c.id}/planningAudit/workload_${version}`),
      {type:'workload_changed',actorUid:a.actorUid,businessId:a.businessId,previous:c.campaignWorkload||null,
        campaignWorkload:value,at:FieldValue.serverTimestamp(),financialEffect:false});
    return {...workload.summary({...c,campaignWorkload:value},zones),workloadVersion:version};
   });
  }
  if(op==='campaignPlanningContext'){m.strict(input,['campaignId']);return db.runTransaction(async tx=>{const a=await access(request,tx);const {c,zones}=await read(tx,a,input.campaignId);return context(c,zones);});}
  if(op==='createCampaignPlan'){
   m.strict(input,['requestId','name','description','campaignType','executionMode','initialServiceArea','serviceAreaName','propertyIntelligenceAnalysisId']);
   const requestId=m.id(input.requestId);if(requestId.length<16)m.fail('invalid-argument','A stable creation request is required.');
   const mode=m.choice(input.executionMode,['own_team','marketplace']),type=m.choice(input.campaignType,TYPES),name=m.text(input.name,160,true),description=m.text(input.description,4000,true),area=input.initialServiceArea?boundary(input.initialServiceArea):[];
   const fingerprint=m.hash(input);
   return db.runTransaction(async tx=>{const a=await access(request,tx,true),id='plan_'+m.hash([a.businessId,a.actorUid,requestId]),ref=db.doc('campaigns/'+id),existing=await tx.get(ref);
    if(existing.exists){if(existing.data().planningRequestFingerprint!==fingerprint)m.fail('already-exists','This creation request already saved a different plan.');return {campaignId:id,campaign:existing.data(),duplicate:true};}
    const c={businessId:a.businessId,campaignName:name,description,campaignType:type,executionMode:mode,configurationMode:['dump_run','yard_sign_installation','event_marketing'].includes(type)?'exact_locations':'zones',status:'draft',planningSchemaVersion:1,planningStage:'area',planningVersion:1,serviceArea:area,serviceAreaName:m.text(input.serviceAreaName||'',200),createdAtMs:now(),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),createdBy:a.actorUid,planningRequestFingerprint:fingerprint};
    // A supplied analysis ID is provenance only, never evidence of a count.
    if(input.propertyIntelligenceAnalysisId)c.propertyIntelligenceAnalysisId=m.id(input.propertyIntelligenceAnalysisId);
    tx.create(ref,c);return {campaignId:id,campaign:{...c,createdAt:null,updatedAt:null}};
   });
  }
  const keys={saveCampaignPlanningArea:['campaignId','expectedPlanningVersion','serviceArea','serviceAreaName'],saveCampaignMaterials:['campaignId','expectedPlanningVersion','areaDigest','materialQuantity','materialType','materialSource','materialLogistics','materialStagingLocation','materialReturnLocation','materialPrintNotes','basePay','bonus','scheduledStartAt','scheduledEndAt'],scheduleOwnTeamCampaign:['campaignId','expectedPlanningVersion','areaDigest','scheduledStartAt','scheduledEndAt']};
  if(!keys[op])m.fail('invalid-argument','Choose a supported planning action.');m.strict(input,keys[op]);
  return db.runTransaction(async tx=>{const a=await access(request,tx,true),{c,zones}=await read(tx,a,input.campaignId);version(c,input.expectedPlanningVersion);
   if(!editable(c))m.fail('failed-precondition','This campaign is no longer an editable draft.');await clean(tx,c,zones);
   const ref=db.doc('campaigns/'+c.id),patch={planningVersion:c.planningVersion+1,updatedAt:FieldValue.serverTimestamp(),updatedBy:a.actorUid};
   if(op==='saveCampaignPlanningArea'){
    patch.serviceArea=boundary(input.serviceArea);patch.serviceAreaName=m.text(input.serviceAreaName||'',200);patch.planningStage='area';patch.materialsAreaDigest=FieldValue.delete();
   }else{
    if(!c.serviceArea?.length&&!zones.some(z=>z.serviceArea?.length))m.fail('failed-precondition','Save an area before choosing materials.');
    for(const z of zones)if(z.serviceArea?.length)boundary(z.serviceArea);
    const mappedZones=zones.filter(z=>z.serviceArea?.length);
    if(c.serviceArea?.length&&mappedZones.length&&!containedParts(mappedZones.map(z=>({points:z.serviceArea})),[{points:c.serviceArea}]))m.fail('failed-precondition','Saved Zones fall outside the selected territory. Review and redraw those Zones or restore the intended territory before confirming materials.');
    const digest=planningDigest(c,zones);if(input.areaDigest!==digest)m.fail('aborted','The saved area changed. Review materials for its current geography.');
    if(op==='saveCampaignMaterials'){
     if(executionMode(c)==='marketplace')workload.assertComplete(c,zones);
     if(!Number.isSafeInteger(input.materialQuantity)||input.materialQuantity<0||input.materialQuantity>10000000)m.fail('invalid-argument','Enter a valid whole material quantity.');
     if(input.materialType!==c.campaignType)m.fail('invalid-argument','Choose materials for this campaign type.');
     const time=dates(input),handoff=logistics(input.materialLogistics||{},input.materialQuantity);
     Object.assign(patch,handoff,{materialQuantity:input.materialQuantity,materialType:input.materialType,materialSource:m.text(input.materialSource,100,true),materialStagingLocation:m.text(input.materialStagingLocation||'',500),materialReturnLocation:m.text(input.materialReturnLocation||'',500),materialPrintNotes:m.text(input.materialPrintNotes||'',2000),planningStage:'review',materialsAreaDigest:digest,startAt:new Date(time.start),deadlineAt:new Date(time.end),marketingDate:new Date(time.start),scheduledStartAt:time.start,scheduledEndAt:time.end});
     for(const field of ['materialHandoffScheduledAt','materialHandoffWindowEndAt'])if(patch[field]!=null)patch[field]=new Date(patch[field]);
     if(executionMode(c)==='marketplace'){
      for(const key of ['basePay','bonus'])if(!Number.isFinite(input[key])||input[key]<0||input[key]>100000||Math.abs(input[key]*100-Math.round(input[key]*100))>1e-6)m.fail('invalid-argument','Enter valid compensation amounts.');
      if(input.basePay<=0)m.fail('invalid-argument','Scaler base compensation must be positive.');patch.basePay=input.basePay;patch.bonus=input.bonus;
     }else if(input.basePay!=null||input.bonus!=null)m.fail('invalid-argument','Own-team planning does not create Scaler compensation.');
    }else{
     assertOwnTeamClean(c,zones);assertPlanningReview(c,zones);const time=dates(input);
     if(time.start!==c.scheduledStartAt||time.end!==c.scheduledEndAt)m.fail('aborted','Review the planned dates before scheduling.');
     const root=db.doc('businessOperations/'+a.businessId),meta=await tx.get(root),itemId='campaign_'+c.id,itemRef=root.collection('items').doc(itemId),oldItem=await tx.get(itemRef);
     if(oldItem.exists)m.fail('already-exists','This campaign already has a Schedule record. Refresh its plan.');
     // An unassigned planning record cannot book staff or create worker duties.
     tx.create(itemRef,{businessId:a.businessId,sourceKind:'own_team_campaign',campaignId:c.id,title:c.campaignName,type:'task',status:'open',startMs:time.start,endMs:time.end,durationMinutes:(time.end-time.start)/60000,timeZone:'UTC',assignedPeople:[],customerId:null,location:c.serviceAreaName||'',notes:'My Own Team marketing plan. Record actual completed geography from the campaign.',version:1,createdAtMs:now(),updatedAtMs:now(),updatedBy:a.actorUid});
     tx.set(root,{businessId:a.businessId,revision:(meta.data()?.revision||0)+1,updatedAtMs:now()},{merge:true});
     Object.assign(patch,{status:'own_team_scheduled',scheduleItemId:itemId});
    }
   }
   tx.update(ref,patch);return {saved:true,campaignId:c.id,planningVersion:patch.planningVersion,financialEffect:false,status:patch.status||c.status};
  });
 }
 return {execute};
}
module.exports={createPlanner,OPS,intelligence,logistics,boundary};
