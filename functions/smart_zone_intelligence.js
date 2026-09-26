'use strict';

// Geography acquisition/selection for the maintained Property Intelligence
// ranking authority. No model invocation, execution route or financial writes.
const {createHash}=require('node:crypto');
const clipping=require('polygon-clipping');
const areas=require('./property_service_area_geometry');
const property=require('./property_service_area_analysis');
const planning=require('./smart_zone_planning');
const serviceability=require('./smart_zone_serviceability');
const VERSION='ScaleMarketingAreaSearchV2';
const MAX_WINDOWS=12,MAX_SEARCH_MS=150000,MAX_CANDIDATES=32,MAX_ALTERNATIVES=3;
const FAIL_SAFE="We couldn't find enough reliable data to recommend an area here yet. You can still draw your own area.";
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const center=geometry=>({latitude:geometry.reduce((s,p)=>s+p.latitude,0)/geometry.length,
  longitude:geometry.reduce((s,p)=>s+p.longitude,0)/geometry.length});
const distance=(a,b)=>Math.hypot((a.latitude-b.latitude)*111320,
  (a.longitude-b.longitude)*111320*Math.cos((a.latitude+b.latitude)*Math.PI/360));
const pointKey=p=>`${p.latitude.toFixed(7)},${p.longitude.toFixed(7)}`;
const featureKey=f=>f.addressKey||String(f.id||f.sourceId||pointKey(f));
const distinct=list=>[...new Set(list.filter(Boolean))];
function effectiveWorkType(args){
  if(!['residential','business'].includes(serviceability.intent(args.workType)))return args.workType;
  if(args.intelligenceContext?.targetIntent==='unsupported')return 'unsupported';
  if(args.intelligenceContext?.targetIntent==='business')return 'b2b_outreach';
  if(args.intelligenceContext?.targetIntent==='residential')return 'flyer_distribution';
  return args.workType;
}
function partition(args){
  const boundary=args.selectedBoundary;
  if(!planning.validateGeometry(boundary).valid)return {windows:[],region:null,reason:'search_boundary_unavailable'};
  let region=areas.normalizeAreas({areas:[{id:'search',name:args.label||'Requested area',geometry:boundary}]}).union;
  if(!Array.isArray(args.eligibleGeography)||!args.eligibleGeography.length){
    return {windows:[],region:null,reason:'eligible_geography_unavailable'};
  }
  const eligibleRegionDiffers=!areas.isContained(boundary,args.eligibleGeography);
  region=clipping.intersection(region,args.eligibleGeography);
  if(!region.length)return {windows:[],region,reason:'outside_eligible_geography'};
  const normalized={areas:[{id:'search',name:args.label||'Requested area',polygons:region}],union:region};
  const tiled=areas.candidates(normalized,{maxCandidates:512,gridDegrees:0.04});
  // Very large service regions get a disclosed spatial sample, never a claim
  // that unqueried windows contain no prospects. Normal 21061 fits this budget.
  const sorted=tiled.candidates.sort((a,b)=>center(a.geometry).latitude-center(b.geometry).latitude||
    center(a.geometry).longitude-center(b.geometry).longitude);
  const windows=sorted.length<=MAX_WINDOWS?sorted:Array.from({length:MAX_WINDOWS},(_,i)=>
    sorted[Math.floor(i*sorted.length/MAX_WINDOWS)]);
  for(const window of windows){
    if(planning.polygonAreaSquareMeters(window.geometry)>planning.MAX_GEOGRAPHIC_QUERY_SQUARE_METERS||
        !areas.isContained(window.geometry,region))throw Error('invalid_internal_search_window');
  }
  return {windows,region,eligibleRegionDiffers,sampling:tiled.sampling,totalWindows:sorted.length,
    complete:tiled.sampling.complete&&windows.length===sorted.length,reason:null};
}
function groups(pool,requestedMinutes){
  const remaining=[...pool].sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id));
  const results=[];
  while(remaining.length&&results.length<MAX_ALTERNATIVES){
    const seed=remaining.shift(),selected=[seed];let minutes=seed.workload.estimatedMinutes;
    const nearby=remaining.filter(c=>distance(center(seed.geometry),center(c.geometry))<=3000)
      .sort((a,b)=>b.ranking.fit-a.ranking.fit||distance(center(seed.geometry),center(a.geometry))-
        distance(center(seed.geometry),center(b.geometry))||a.id.localeCompare(b.id));
    for(const candidate of nearby){
      if(minutes>=requestedMinutes||selected.length>=planning.MAX_ZONES_PER_CAMPAIGN)break;
      const next=minutes+candidate.workload.estimatedMinutes;
      if(next>requestedMinutes&&Math.abs(next-requestedMinutes)>=Math.abs(minutes-requestedMinutes))continue;
      selected.push(candidate);minutes=next;remaining.splice(remaining.findIndex(c=>c.id===candidate.id),1);
    }
    results.push(selected);
  }
  return results;
}
async function search(args,{fetchSnapshot,endpoint,loadPropertyAnalysis=async()=>null,now=Date.now}={}){
  const started=now(),selection=partition(args),diagnostics=[],candidates=[],propertyCandidates=[];
  const workType=effectiveWorkType(args),targetIntent=serviceability.intent(workType);
  const result={version:VERSION,sourceAreaDigest:args.sourceAreaDigest,contextVersion:args.contextVersion,
    searchBoundary:args.selectedBoundary,startedAt:new Date(started).toISOString(),
    requestedHours:args.desiredHours,goal:args.intelligenceContext?.goal||'',targetIntent,
    totalWindowCount:selection.totalWindows||0,selectedWindowCount:selection.windows.length,
    propertyExaminedCount:0,completedWindowCount:0,successfulWindowCount:0,fullSearchCoverage:false,
    eligibleRegionDiffers:selection.eligibleRegionDiffers===true,
    candidates,propertyCandidates,diagnostics,reasonCode:selection.reason,observedFeatureCount:0,roadSupportedTargetCount:0};
  if(selection.reason||!['residential','business'].includes(targetIntent)){
    result.reasonCode=selection.reason||'unsupported_target_intent';return result;
  }
  // The same maintained Property Intelligence scorer runs before any map request.
  // The provider adapter owns its time budget; cache hits remain inexpensive.
  for(const window of selection.windows){
    if(now()-started>MAX_SEARCH_MS-12000){result.reasonCode='bounded_search_time_budget';break;}
    let analysis=null;
    try{analysis=await loadPropertyAnalysis(window.geometry);}catch(_){/* retain an explicit unavailable section */}
    const ranking=property.rankPropertySection({analysis,geometry:window.geometry,
      context:{...args.intelligenceContext,targetIntent}});
    result.propertyExaminedCount++;
    const row={windowId:window.id,areaSquareMeters:Math.round(planning.polygonAreaSquareMeters(window.geometry)),
      propertyStatus:Number.isFinite(ranking.fit)?'ranked':'unavailable',
      propertyLimitations:ranking.limitations,propertyEvidence:ranking.evidence||null,
      status:'not_requested',diagnostic:null};
    diagnostics.push(row);
    if(!Number.isFinite(ranking.fit))continue;
    propertyCandidates.push({id:window.id,geometry:window.geometry,ranking,mapValidation:'not_requested',
      mappedCandidateCount:0,supportedMinutes:null});
  }
  propertyCandidates.sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id));
  const observed=new Set(),roadSupported=new Set(),candidateFeatures=new Set();
  for(const area of propertyCandidates){
    if(now()-started>MAX_SEARCH_MS-12000){result.reasonCode='bounded_search_time_budget';break;}
    const row=diagnostics.find(d=>d.windowId===area.id);
    let diagnostic=null,snapshot=null;
    try{snapshot=await fetchSnapshot({selectedBoundary:area.geometry,endpoint,
      onDiagnostic:value=>{diagnostic=value;}});}catch(_){diagnostic={status:'unavailable',reasonCode:'provider_request_failed'};}
    result.completedWindowCount++;
    Object.assign(row,{status:snapshot?'success':'unavailable',diagnostic,
      dataTimestamp:snapshot?.dataTimestamp||null,fetchedAt:snapshot?.fetchedAt||null});
    if(!snapshot){area.mapValidation='needs_review';continue;}
    result.successfulWindowCount++;
    const shaped=serviceability.shape({anchor:args.anchor||center(area.geometry),boundary:area.geometry,
      snapshot,workType,propertiesPerHour:45,desiredTargetLimit:5000,maximumZones:MAX_CANDIDATES,
      desiredMinutes:args.desiredHours*60},planning);
    for(const id of shaped.eligibleMappedSourceIds||[])observed.add(id);
    for(const id of shaped.roadSupportedSourceIds||[])roadSupported.add(id);
    result.roadSupportedTargetCount=roadSupported.size;
    Object.assign(row,{planningReasons:shaped.reasons,eligibleMappedFeatureCount:shaped.eligibleMappedFeatureCount,
      roadSupportedTargetCount:shaped.roadSupportedTargetCount||0,candidateCount:shaped.candidates.length});
    const source={name:'OpenStreetMap',dataTimestamp:snapshot.dataTimestamp||null,fetchedAt:snapshot.fetchedAt||null,
      freshness:snapshot.cacheEvidence?.freshness||'live',transport:snapshot.cacheEvidence?.transport||'overpass',
      evidenceHash:snapshot.cacheEvidence?.evidenceHash||null};
    area.mapValidation=shaped.candidates.length?(source.freshness==='stale'?'partial':'available'):'needs_review';
    area.mapSource=source;
    for(const candidate of shaped.candidates){
      const keys=candidate.features.map(featureKey);
      if(keys.some(key=>candidateFeatures.has(key))||!areas.isContained(candidate.geometry,selection.region))continue;
      keys.forEach(key=>candidateFeatures.add(key));
      candidates.push({...candidate,features:candidate.features.map(f=>({id:f.id,kind:f.kind,
        latitude:f.latitude,longitude:f.longitude,observedTags:f.observedTags||{},timestamp:f.timestamp||null})),
        id:hash([area.id,keys.sort(),candidate.geometry]).slice(0,24),ranking:area.ranking,
        propertyAreaId:area.id,source,windowId:area.id});
      if(candidates.length>MAX_CANDIDATES){
        candidates.sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id));
        candidates.pop();result.reasonCode='bounded_candidate_limit';
      }
    }
  }
  result.observedFeatureCount=observed.size;
  candidates.sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id));
  while(candidates.length&&Buffer.byteLength(JSON.stringify(candidates),'utf8')>350*1024){
    candidates.pop();result.reasonCode='bounded_candidate_limit';
  }
  for(const area of propertyCandidates){
    const mapped=candidates.filter(c=>c.propertyAreaId===area.id);
    area.mappedCandidateCount=mapped.length;
    area.supportedMinutes=mapped.length?mapped.reduce((sum,c)=>sum+c.workload.estimatedMinutes,0):null;
  }
  result.fullSearchCoverage=selection.complete&&result.successfulWindowCount===selection.windows.length;
  result.finishedAt=new Date(now()).toISOString();
  result.reasonCode ||= candidates.length?null:propertyCandidates.length?'map_validation_limited':'property_evidence_unavailable';
  return result;
}

// Alternatives are distinct PI sections. Missing map data keeps the section
// visible for review; it never grants Apply authority or invents workload.
function propertyOptions(evidence,requestedMinutes){
  const areas=[...(evidence.propertyCandidates||[])],used=new Set(),options=[];
  for(const area of areas){
    if(used.has(area.id)||options.length>=MAX_ALTERNATIVES)continue;
    const selected=[],sections=[area];let minutes=0;
    const same=evidence.candidates.filter(c=>c.propertyAreaId===area.id);
    const available=same.length?[
      ...same,
      ...evidence.candidates.filter(c=>c.propertyAreaId!==area.id&&!used.has(c.propertyAreaId)&&
        distance(center(area.geometry),center(c.geometry))<=3000)
        .sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id)),
    ]:[];
    for(const candidate of available){
      if(minutes>=requestedMinutes||selected.length>=planning.MAX_ZONES_PER_CAMPAIGN)break;
      const next=minutes+candidate.workload.estimatedMinutes;
      if(selected.length&&next>requestedMinutes&&Math.abs(next-requestedMinutes)>=Math.abs(minutes-requestedMinutes))continue;
      selected.push(candidate);minutes=next;
      const section=areas.find(a=>a.id===candidate.propertyAreaId);
      if(section&&!sections.some(a=>a.id===section.id))sections.push(section);
    }
    sections.forEach(a=>used.add(a.id));
    options.push({primary:area,sections,selected});
  }
  return options;
}
function generate(args,evidence){
  if(!evidence||evidence.version!==VERSION||evidence.sourceAreaDigest!==args.sourceAreaDigest||
    evidence.contextVersion!==args.contextVersion||evidence.requestedHours!==args.desiredHours||
    evidence.goal!==(args.intelligenceContext?.goal||''))throw Error('recommendation_context_changed');
  const alternativeIndex=args.alternativeIndex??0;
  if(!Number.isSafeInteger(alternativeIndex)||alternativeIndex<0||alternativeIndex>=MAX_ALTERNATIVES)throw Error('invalid_alternative');
  const options=propertyOptions(evidence,args.desiredHours*60),option=options[alternativeIndex];
  const selected=option?.selected||[],sections=option?.sections||[],primary=option?.primary,usable=selected.length>0;
  const ranked=!!primary,mapValidation=usable?(selected.some(c=>c.source.freshness==='stale')?'partial':'available'):'needs_review';
  const sourceDates=distinct(selected.map(c=>c.source.dataTimestamp)),retrievals=distinct(selected.map(c=>c.source.fetchedAt));
  const targetEvidence=(features,sourceCandidates=selected)=>{
    const dates=distinct(sourceCandidates.map(c=>c.source.dataTimestamp));
    const retrieved=distinct(sourceCandidates.map(c=>c.source.fetchedAt));
    return {measure:'mapped_target_features',eligibleMappedFeatureCount:features.length,
    source:'OpenStreetMap',dataTimestamp:dates.length===1&&sourceCandidates.every(c=>c.source.dataTimestamp)?dates[0]:null,
    fetchedAt:retrieved.sort().at(-1)||null,sourceSnapshots:sourceCandidates.map(c=>c.source),
    verifiedDeliveryPoints:false,targetIntent:evidence.targetIntent,
    limitations:['Mapped features are not verified households, entrances, delivery points or customer demand.',
      'Workload uses a disclosed planning pace and mapped local street length. Actual access and duration require review.']};};
  const zones=selected.map((c,i)=>({zoneNumber:i+1,name:`Area ${i+1}`,geometry:c.geometry,
    geometryValidation:planning.validateGeometry(c.geometry),workload:{...c.workload,confidence:'low',
      reason:'Advisory mapped-feature pace and supporting local street length; no execution route has been approved.'},
    recommendedScalers:1,workability:'review_recommended_area',quality:{label:'Review marketing area',reasons:c.ranking.reasons},
    serviceability:'serviceable_geography',sourceComponentIds:c.sourceComponentIds,
    planningTargets:{kind:'mapped_target_candidates',verifiedDeliveryPoints:false,
      features:c.features.map(f=>({sourceId:f.id,kind:f.kind,latitude:f.latitude,longitude:f.longitude}))},
    planningNetwork:{kind:'connected_mapped_road_network',isExecutionRoute:false,accessVerified:false,
      suggestedRoute:null,segments:c.networkSegments,
      limitations:['Supporting street evidence only. Separate areas are not joined by an invented route.']},
    mappedRouteMeters:c.mappedRouteMeters,targetEvidence:targetEvidence(c.features,[c]),intelligence:c.ranking}));
  const features=selected.flatMap(c=>c.features),minutes=zones.reduce((s,z)=>s+z.workload.estimatedMinutes,0);
  const limitations=distinct([...sections.flatMap(c=>c.ranking.limitations||[]),
    !evidence.fullSearchCoverage?'Only successfully analyzed sections support this recommendation. Some of the search region remains unexamined or unavailable.':null,
    evidence.eligibleRegionDiffers?'Only the parts of the requested location inside your saved Business service areas were eligible for this search.':null,
    evidence.reasonCode==='bounded_candidate_limit'?'The review retains the strongest candidates within the bounded evidence limit; additional mapped candidates are not included.':null,
    usable&&minutes<args.desiredHours*60?`Available nearby evidence supports about ${minutes} minutes of advisory work, below the requested ${Math.round(args.desiredHours*60)} minutes.`:null,
    'Separate planning areas and street evidence are not an approved execution route.']);
  const why=distinct(sections.flatMap(c=>c.ranking.reasons||[]));
  if(alternativeIndex>0&&ranked)why.unshift(primary.ranking.fit===options[0].primary.ranking.fit?
    'This is a different eligible section with the same supported Property Intelligence fit; the available signals do not distinguish a stronger fit.':
    'This different eligible section has a lower Property Intelligence fit on the disclosed signals.');
  const explanation=usable?'Property Intelligence identified this section; review its supported planning territory before use. No execution route or customer demand is established.':
    ranked?'Recommended based on Property Intelligence. Street-level planning data is limited here, so review or adjust the boundary before launching.':
    evidence.reasonCode==='property_evidence_unavailable'?(evidence.targetIntent==='business'?
      'The maintained Property Intelligence evidence cannot yet rank commercial prospects here. You can draw your own area; residential housing data has not been substituted.':
      'Property Intelligence could not establish a comparable service fit for these sections. Census neighborhood context alone cannot establish a practical outreach area. Choose another location or draw your own area.'):
    FAIL_SAFE;
  const identity={version:VERSION,sourceAreaDigest:args.sourceAreaDigest,contextVersion:args.contextVersion,
    goal:evidence.goal,workType:args.workType,desiredHours:args.desiredHours,alternativeIndex,
    selected:selected.map(c=>({id:c.id,geometry:c.geometry,features:c.features,network:c.networkSegments,ranking:c.ranking})),
    propertySections:sections.map(c=>({id:c.id,geometry:c.geometry,ranking:c.ranking})),
    compensation:[args.workerBasePayCents,args.completionBonusCents,args.qualityBonusCents]};
  return {planId:`scale-area_${hash(identity).slice(0,24)}`,label:'Recommended Marketing Area',anchor:args.anchor,
    selectedTerritory:args.selectedBoundary,plannedTerritory:zones.length===1?zones[0].geometry:null,
    reviewTerritory:primary?.geometry||null,
    desiredHours:args.desiredHours,totalEstimatedProperties:usable?features.length:null,
    totalEstimatedMinutes:usable?minutes:null,totalEstimatedHours:usable?Number((minutes/60).toFixed(1)):null,
    recommendedScalerCount:zones.length,requiresSplit:zones.length>1,
    recommendationStatus:usable?'review_required':'manual_review_required',
    reasonCode:usable?null:ranked?'map_validation_limited':alternativeIndex>0?'no_supported_alternative':evidence.reasonCode||'insufficient_reliable_evidence',
    explanation,
    serviceabilityMode:usable?'serviceable_geography':'manual_review_required',
    quality:{label:'Recommended Marketing Area',reasons:ranked?why:[FAIL_SAFE]},confidence:'low',
    targetEvidence:{...targetEvidence(features),eligibleMappedFeatureCount:usable?features.length:null,
      observedEligibleFeatureCount:evidence.successfulWindowCount?evidence.observedFeatureCount:null,
      roadSupportedTargetCount:evidence.successfulWindowCount?evidence.roadSupportedTargetCount:null},
    geographicSource:usable?'OpenStreetMap':null,
    geographicAcquisition:{status:usable?'success':'unavailable',reasonCode:evidence.reasonCode,
      sourceDataTimestamp:sourceDates.length===1&&selected.every(c=>c.source.dataTimestamp)?sourceDates[0]:null,fetchedAt:retrievals.sort().at(-1)||null},
    searchRegion:{geometry:args.selectedBoundary,sourceAreaDigest:args.sourceAreaDigest,label:args.label,
      analysisScope:'eligible_portion_of_requested_region',eligibleRegionDiffers:evidence.eligibleRegionDiffers===true,
      fullSearchCoverage:evidence.fullSearchCoverage,totalWindows:evidence.totalWindowCount,
      selectedWindows:evidence.selectedWindowCount,successfulWindows:evidence.successfulWindowCount,
      propertyExaminedCount:evidence.propertyExaminedCount||0,propertyCandidateCount:evidence.propertyCandidates?.length||0,
      requestedHours:args.desiredHours,startedAt:evidence.startedAt,finishedAt:evidence.finishedAt||null},
    recommendationContext:{goal:evidence.goal,locationLabel:args.label,requestedHours:args.desiredHours,
      supportedMinutes:usable?minutes:null,why,signals:sections.flatMap(c=>c.ranking.displaySignals||[]),limitations,
      propertyRecommendation:ranked?{sectionId:primary.id,fit:primary.ranking.fit,
        sections:sections.map(c=>({sectionId:c.id,fit:c.ranking.fit,evidence:c.ranking.evidence})),
        geometry:primary.geometry}:null,
      mapValidation,planningConfidence:usable&&mapValidation==='available'&&
        sections.every(c=>['HIGH','MODERATE'].includes(c.ranking.evidence.confidence))?'Moderate':'Limited',
      alternativeIndex,hasAlternative:alternativeIndex+1<options.length},
    compensation:usable?planning.compensationRecommendation({estimatedMinutes:minutes,
      workerBasePayCents:args.workerBasePayCents,completionBonusCents:args.completionBonusCents,
      qualityBonusCents:args.qualityBonusCents}):null,
    zones,policyVersion:VERSION,geometryVersion:usable?planning.GEOMETRY_VERSION:planning.FALLBACK_GEOMETRY_VERSION,
    practicalMaximumZones:planning.MAX_ZONES_PER_CAMPAIGN};
}
module.exports={VERSION,MAX_WINDOWS,MAX_SEARCH_MS,FAIL_SAFE,partition,search,generate,groups,propertyOptions};
