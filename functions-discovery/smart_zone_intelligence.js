'use strict';

// Geography acquisition/selection for the maintained Property Intelligence
// ranking authority. No model invocation, execution route or financial writes.
const {createHash}=require('node:crypto');
const clipping=require('polygon-clipping');
const areas=require('./property_service_area_geometry');
const property=require('./property_service_area_analysis');
const planning=require('./smart_zone_planning');
const serviceability=require('./smart_zone_serviceability');
const VERSION='ScaleMarketingAreaSearchV6';
const connected=require('./smart_zone_connected_territory');
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
  if(args.intelligenceContext?.targetIntent==='residential')return serviceability.intent(args.workType)==='residential'?args.workType:'flyer_distribution';
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
  const started=now(),selection=partition(args),diagnostics=[],candidates=[],propertyCandidates=[],analyses=new Map();
  const workType=effectiveWorkType(args),targetIntent=serviceability.intent(workType);
  const result={version:VERSION,sourceAreaDigest:args.sourceAreaDigest,contextVersion:args.contextVersion,
    searchBoundary:args.selectedBoundary,startedAt:new Date(started).toISOString(),
    executionMode:args.executionMode||'marketplace',teamCapacity:args.executionMode==='own_team'?require('./own_team_capacity').requirement(args.teamCapacity):null,
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
    if(analysis)analyses.set(window.id,analysis);
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
    const binding=require('./property_map_binding').bind(snapshot,analyses.get(area.id),area.geometry);
    snapshot=binding.snapshot;row.propertyMatching=binding.matching;
    const shaped=serviceability.shape({anchor:args.anchor||center(area.geometry),boundary:area.geometry,
      snapshot,workType,propertiesPerHour:45,desiredTargetLimit:5000,maximumZones:MAX_CANDIDATES,
      desiredMinutes:args.desiredHours*60},planning);
    for(const id of shaped.eligibleMappedSourceIds||[])observed.add(id);
    for(const id of shaped.roadSupportedSourceIds||[])roadSupported.add(id);
    result.roadSupportedTargetCount=roadSupported.size;
    Object.assign(row,{planningReasons:shaped.reasons,geometryDiagnostics:shaped.geometryDiagnostics||null,eligibleMappedFeatureCount:shaped.eligibleMappedFeatureCount,
      roadSupportedTargetCount:shaped.roadSupportedTargetCount||0,candidateCount:shaped.candidates.length});
    const source={name:'OpenStreetMap',dataTimestamp:snapshot.dataTimestamp||null,fetchedAt:snapshot.fetchedAt||null,
      freshness:snapshot.cacheEvidence?.freshness||'live',transport:snapshot.cacheEvidence?.transport||'overpass',
      evidenceHash:snapshot.cacheEvidence?.evidenceHash||null,
      provider:snapshot.cacheEvidence?.provider||'overpass',importedAt:snapshot.cacheEvidence?.importedAt||null,
      sourceHash:snapshot.cacheEvidence?.sourceHash||null,datasetVersion:snapshot.cacheEvidence?.datasetVersion||null,
      parserVersion:snapshot.cacheEvidence?.parserVersion||null,bounds:snapshot.cacheEvidence?.bounds||null,
      queryBounds:snapshot.cacheEvidence?.queryBounds||null,geometryVersion:snapshot.cacheEvidence?.geometryVersion||null,
      uncertaintyGuards:shaped.geometryDiagnostics?.localizedUncertainties||0,
      refreshFailed:snapshot.cacheEvidence?.refreshFailed===true};
    area.mapValidation=shaped.candidates.length?(source.freshness==='stale'?'partial':'available'):'needs_review';
    area.mapSource=source;
    for(const candidate of shaped.candidates){
      const keys=candidate.features.map(featureKey);
      if(keys.some(key=>candidateFeatures.has(key))||!areas.isContained(candidate.geometry,selection.region))continue;
      if(!connected.contained(candidate,selection.region))continue;
      const ranking=property.rankMarketingArea({candidate,snapshot,analysis:analyses.get(area.id),context:{...args.intelligenceContext,targetIntent}});
      if(!Number.isFinite(ranking.fit))continue;
      keys.forEach(key=>candidateFeatures.add(key));
      const unknownInArea=(snapshot.targetFeatures||[]).filter(f=>/^unclassified/.test(f.kind)&&planning.pointInsidePolygon(f,candidate.geometry)).length;
      candidates.push({...candidate,incompleteTargetInventory:unknownInArea>0||snapshot.buildingInventoryComplete!==true,
        unclassifiedMappedFeatureCount:unknownInArea,features:candidate.features.map(f=>({id:f.id,kind:f.kind,
        latitude:f.latitude,longitude:f.longitude,observedTags:f.observedTags||{},timestamp:f.timestamp||null,
        footprint:f.footprint||null,addressKey:f.addressKey||null})),
        id:hash([area.id,keys.sort(),candidate.geometry]).slice(0,24),ranking,
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

// Merge only an exact simple union with shared observed street endpoints.
// No convex hull, gap connector, barrier crossing or hole-filling is introduced.
function assembledCandidates(evidence,targetMinutes) {
  const pool=evidence.candidates||[],result=[...pool];
  const keys=c=>new Set(c.networkSegments.flatMap(e=>[pointKey(e.from),pointKey(e.to)]));
  const memberIds=c=>c.memberIds||[c.id];
  for(const seed of pool) {
    if(!Array.isArray(seed.features)||!Array.isArray(seed.networkSegments))continue;
    let current=seed;
    for(const next of [...pool].sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id))) {
      if(current.workload.estimatedMinutes>=targetMinutes)break;
      if(!Array.isArray(next.features)||!Array.isArray(next.networkSegments)||next.propertyAreaId!==seed.propertyAreaId)continue;
      if(memberIds(current).includes(next.id)||current.features.some(f=>next.features.some(n=>featureKey(n)===featureKey(f))))continue;
      const streetKeys=keys(current);if(![...keys(next)].some(k=>streetKeys.has(k)))continue;
      const union=clipping.union(areas.normalizeAreas({areas:[{geometry:current.geometry}]}).union,
        areas.normalizeAreas({areas:[{geometry:next.geometry}]}).union);
      if(union.length!==1||union[0].length!==1)continue;
      const geometry=union[0][0].slice(0,-1).map(([longitude,latitude])=>({latitude,longitude}));
      if(!planning.validateGeometry(geometry).valid)continue;
      const edges=new Map();
      for(const e of [...current.networkSegments,...next.networkSegments])edges.set([pointKey(e.from),pointKey(e.to)].sort().join('|'),e);
      const networkSegments=[...edges.values()],mappedRouteMeters=Math.round(networkSegments.reduce((n,e)=>n+distance(e.from,e.to),0));
      const features=[...current.features,...next.features];
      const workload=planning.estimateWorkload({estimatedProperties:features.length,estimatedWalkingMeters:mappedRouteMeters*2,
        propertiesPerHour:45,workType:evidence.workType});
      if(workload.estimatedMinutes>planning.SINGLE_SCALER_MAX_MINUTES)continue;
      const members=[...memberIds(current),next.id].sort();
      current={...current,id:'assembly_'+hash(members).slice(0,24),memberIds:members,geometry,features,networkSegments,
        mappedRouteMeters,workload,sourceComponentIds:distinct([...current.sourceComponentIds,...next.sourceComponentIds]),
        constituentSources:[...(current.constituentSources||[current.source]),next.source]};
    }
    if(current!==seed&&!result.some(c=>c.id===current.id))result.push(current);
  }
  return result;
}
function ownTeamOptions(evidence,capacity,region) {
  if(!region)region=areas.normalizeAreas({areas:[{geometry:evidence.searchBoundary}]}).union;
  return connected.options(evidence,capacity,region);
}
// Only map-validated PI sections can be returned as recommendations/alternatives.
// Unmapped PI facts remain in diagnostics; they never grant Apply authority.
function propertyOptions(evidence,requestedMinutes){
  evidence={...evidence,candidates:assembledCandidates(evidence, Math.min(360,requestedMinutes/Math.ceil(requestedMinutes/360)))};
  const requirement = require('./campaign_workload_authority').requirement(requestedMinutes / 60);
  const areas=[...(evidence.propertyCandidates||[])].sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id)),used=new Set(),options=[];
  for(const area of areas){
    if(options.length>=MAX_ALTERNATIVES)break;
    const selected=[],sections=[area];let minutes=0;
    const same=evidence.candidates.filter(c=>c.propertyAreaId===area.id&&!used.has(c.id)&&!(c.memberIds||[]).some(id=>used.has(id))&&
      c.workload.estimatedMinutes > 0 && c.workload.estimatedMinutes <= planning.SINGLE_SCALER_MAX_MINUTES)
      .sort((a,b)=>Math.abs(a.workload.estimatedMinutes-requirement.targetMinutesPerZone)-
        Math.abs(b.workload.estimatedMinutes-requirement.targetMinutesPerZone)||(b.features?.length||0)-(a.features?.length||0)||a.id.localeCompare(b.id));
    if(!same.length)continue;
    const available=same.length?[
      ...same,
      ...evidence.candidates.filter(c=>c.propertyAreaId!==area.id&&!used.has(c.id)&&!(c.memberIds||[]).some(id=>used.has(id))&&
        c.workload.estimatedMinutes > 0 && c.workload.estimatedMinutes <= planning.SINGLE_SCALER_MAX_MINUTES &&
        distance(center(area.geometry),center(c.geometry))<=3000)
        .sort((a,b)=>b.ranking.fit-a.ranking.fit||a.id.localeCompare(b.id)),
    ]:[];
    for(const candidate of available){
      if(selected.length>=requirement.requiredZoneCount)break;
      if(selected.some(c=>(c.features||[]).some(f=>(candidate.features||[]).some(n=>featureKey(f)===featureKey(n)))))continue;
      const next=minutes+candidate.workload.estimatedMinutes;
      selected.push(candidate);minutes=next;
      const section=areas.find(a=>a.id===candidate.propertyAreaId);
      if(section&&!sections.some(a=>a.id===section.id))sections.push(section);
    }
    selected.forEach(c=>(c.memberIds||[c.id]).forEach(id=>used.add(id)));
    options.push({primary:area,sections,selected});
  }
  return options;
}
function generate(args,evidence){
  if(!evidence||evidence.version!==VERSION||evidence.sourceAreaDigest!==args.sourceAreaDigest||
    evidence.contextVersion!==args.contextVersion||evidence.requestedHours!==args.desiredHours||
    evidence.goal!==(args.intelligenceContext?.goal||'')||
    (evidence.executionMode||'marketplace')!==(args.executionMode||'marketplace')||
    args.executionMode==='own_team'&&JSON.stringify(evidence.teamCapacity)!==JSON.stringify(require('./own_team_capacity').requirement(args.teamCapacity)))throw Error('recommendation_context_changed');
  const alternativeIndex=args.alternativeIndex??0;
  if(!Number.isSafeInteger(alternativeIndex)||alternativeIndex<0||alternativeIndex>=MAX_ALTERNATIVES)throw Error('invalid_alternative');
  const ownTeam=args.executionMode==='own_team';
  const workloadRequirement=ownTeam?require('./own_team_capacity').requirement(args.teamCapacity):require('./campaign_workload_authority').requirement(args.desiredHours);
  if(ownTeam&&workloadRequirement.sessionHours!==args.desiredHours)throw Error('recommendation_context_changed');
  const region=partition(args).region;
  const candidatePool=ownTeam?evidence.candidates:assembledCandidates(evidence,workloadRequirement.targetMinutesPerZone);
  const options=ownTeam?ownTeamOptions(evidence,workloadRequirement,region):propertyOptions(evidence,args.desiredHours*60);
  let option=options[alternativeIndex];
  if (args.selectionIds != null) {
    if (!Array.isArray(args.selectionIds) || !args.selectionIds.length ||
        args.selectionIds.length > (ownTeam?MAX_CANDIDATES:workloadRequirement.requiredZoneCount) ||
        new Set(args.selectionIds).size !== args.selectionIds.length) throw Error('invalid_zone_selection');
    const selected=args.selectionIds.map(id=>candidatePool.find(c=>c.id===id &&
      c.workload.estimatedMinutes>0 && c.workload.estimatedMinutes<=planning.SINGLE_SCALER_MAX_MINUTES));
    if(selected.some(c=>!c))throw Error('invalid_zone_selection');
    const targets=selected.flatMap(c=>c.features.map(featureKey));
    if(new Set(targets).size!==targets.length)throw Error('invalid_zone_selection');
    if(args.replaceZoneIndex != null) {
      if(!Number.isInteger(args.replaceZoneIndex)||args.replaceZoneIndex<0||
          args.replaceZoneIndex>=selected.length)throw Error('invalid_zone_selection');
      const alternatives=candidatePool.filter(c=>!args.selectionIds.includes(c.id)&&!selected.some(s=>s.features.some(f=>c.features.some(n=>featureKey(f)===featureKey(n))))&&
        c.workload.estimatedMinutes>0&&c.workload.estimatedMinutes<=planning.SINGLE_SCALER_MAX_MINUTES)
        .sort((a,b)=>b.ranking.fit-a.ranking.fit||
          Math.abs(a.workload.estimatedMinutes-workloadRequirement.targetMinutesPerZone)-
          Math.abs(b.workload.estimatedMinutes-workloadRequirement.targetMinutesPerZone)||a.id.localeCompare(b.id));
      if(!alternatives.length)throw Error('no_supported_alternative');
      selected[args.replaceZoneIndex]=alternatives[0];
    }
    const sections=[...new Set(selected.map(c=>c.propertyAreaId))].map(id=>evidence.propertyCandidates.find(a=>a.id===id));
    if(sections.some(s=>!s))throw Error('invalid_zone_selection');
    option={selected,sections,primary:sections[0]};
  } else if(!ownTeam&&alternativeIndex>0 && workloadRequirement.requiredZoneCount>1) {
    throw Error('select_zone_to_replace');
  }
  if(ownTeam&&option){
    connected.assertSelection(option.selected,region);
    const exact=options.find(o=>o.selected.map(c=>c.id).sort().join('|')===option.selected.map(c=>c.id).sort().join('|'));
    if(!exact)throw Error('invalid_connected_plan_selection');
    option=exact;
  }
  const selected=option?.selected||[],sections=option?.sections||[],primary=option?.primary,usable=selected.length>0;
  const ranked=!!primary,mapValidation=usable?(selected.some(c=>c.source.freshness==='stale')?'partial':'available'):'needs_review';
  const sourceDates=distinct(selected.map(c=>c.source.dataTimestamp)),retrievals=distinct(selected.map(c=>c.source.fetchedAt));
  const targetEvidence=(features,sourceCandidates=selected)=>{
    const dates=distinct(sourceCandidates.map(c=>c.source.dataTimestamp));
    const retrieved=distinct(sourceCandidates.map(c=>c.source.fetchedAt));
    return {measure:'mapped_target_features',eligibleMappedFeatureCount:features.length,
    source:'OpenStreetMap',dataTimestamp:dates.length===1&&sourceCandidates.every(c=>c.source.dataTimestamp)?dates[0]:null,
    fetchedAt:retrieved.sort().at(-1)||null,sourceSnapshots:sourceCandidates.flatMap(c=>c.constituentSources||[c.source]),
    verifiedDeliveryPoints:false,targetIntent:evidence.targetIntent,
    limitations:['Mapped features are not verified households, entrances, delivery points or customer demand.',
      'Workload uses a disclosed planning pace and mapped local street length. Actual access and duration require review.']};};
  const zones=selected.map((c,i)=>({zoneIntelligence:require('./zone_intelligence').recommended(c,args.workType,evidence.targetIntent,ownTeam?workloadRequirement:false),zoneNumber:i+1,name:ownTeam?`Team section ${i+1}`:`Zone ${i+1}`,geometry:c.geometry,
    geometryValidation:planning.validateGeometry(c.geometry),
    ...(ownTeam?{coverageSection:true,plannedAssignment:false}:{}),workload:{...c.workload,confidence:'low',
      reason:'Advisory mapped-feature pace and supporting local street length; no execution route has been approved.'},
    recommendedScalers:1,workability:'review_recommended_area',quality:{label:'Review marketing area',reasons:c.ranking.reasons},
    serviceability:'serviceable_geography',sourceComponentIds:c.sourceComponentIds,
    planningTargets:{kind:'mapped_target_candidates',verifiedDeliveryPoints:false,
      features:c.features.map(f=>({sourceId:f.id,kind:f.kind,latitude:f.latitude,longitude:f.longitude,observedTags:f.observedTags||{}}))},
    planningNetwork:{kind:'connected_mapped_road_network',isExecutionRoute:false,accessVerified:false,
      suggestedRoute:null,segments:c.networkSegments,
      limitations:['Supporting street evidence only. Separate areas are not joined by an invented route.']},
    mappedRouteMeters:c.mappedRouteMeters,targetEvidence:targetEvidence(c.features,[c]),intelligence:c.ranking}));
  const features=selected.flatMap(c=>c.features),minutes=zones.reduce((s,z)=>s+z.workload.estimatedMinutes,0);
  const workloadComplete=usable&&selected.every(c=>c.incompleteTargetInventory!==true);
  const teamAllocation=ownTeam?require('./own_team_capacity').allocate(workloadRequirement,selected):null;
  if(teamAllocation&&!workloadComplete){teamAllocation.supportedFieldSubsetMinutes=teamAllocation.estimatedFieldElapsedMinutes;
    teamAllocation.estimatedFieldElapsedMinutes=null;teamAllocation.shortfallMinutes=null;teamAllocation.completeAreaWorkload=false;}
  const freshnessLabels={fresh:'Fresh cached mapped evidence',usable_cached:'Usable cached mapped evidence',stale:'Stale mapped evidence - refresh recommended',live:'Live mapped evidence'};
  const limitations=distinct(['Area recommendations are Limited/Beta. Review each boundary and local access before use.',selected.some(c=>c.source.uncertaintyGuards>0)?'Areas near incomplete mapped features have been conservatively avoided. Those avoidance bounds are not verified campus or access boundaries; inspect each area before use.':null,...sections.flatMap(c=>c.ranking.limitations||[]),
    ...selected.map(c=>`${c.source.transport==='live_refresh'?(freshnessLabels[c.source.freshness]||'Mapped evidence').replace('cached ','')+' (live refresh)':freshnessLabels[c.source.freshness]||'Mapped evidence'}; source snapshot ${c.source.dataTimestamp||'not supplied'}; retrieved ${c.source.fetchedAt||'not recorded'}.`),
    selected.some(c=>c.source.refreshFailed)?'Recommended using cached mapped/property data because a street-data refresh was unavailable. Street-level data may have changed; review the boundary before launching.':null,
    !evidence.fullSearchCoverage?'Only successfully analyzed sections support this recommendation. Some of the search region remains unexamined or unavailable.':null,
    evidence.eligibleRegionDiffers?'Only the parts of the requested location inside your saved Business service areas were eligible for this search.':null,
    evidence.reasonCode==='bounded_candidate_limit'?'The review retains the strongest candidates within the bounded evidence limit; additional mapped candidates are not included.':null,
    usable&&minutes<workloadRequirement.requestedMinutes?`Available nearby evidence supports about ${minutes} minutes of advisory work, below the requested ${Math.round(workloadRequirement.requestedMinutes)} minutes.`:null,
    'Separate planning areas and street evidence are not an approved execution route.']);
  const why=distinct(selected.flatMap(c=>c.ranking.reasons||[]));
  if(alternativeIndex>0&&ranked)why.unshift(primary.ranking.fit===options[0].primary.ranking.fit?
    'This is a different eligible section with the same supported Property Intelligence fit; the available signals do not distinguish a stronger fit.':
    'This different eligible section has a lower Property Intelligence fit on the disclosed signals.');
  const personalized=usable&&selected.every(c=>c.ranking.personalizationStatus==='supported_proxy');
  const explanation=usable?(personalized?'Recorded property facts and service suitability informed this connected planning territory. Review local access; no execution route or customer demand is established.':
    'Mapped planning territory is available, but service-specific property suitability is unavailable. Review it manually; this is not a personalized lead recommendation.'):FAIL_SAFE;
  const identity={version:VERSION,workloadAuthority:workloadRequirement,sourceAreaDigest:args.sourceAreaDigest,contextVersion:args.contextVersion,
    goal:evidence.goal,workType:args.workType,desiredHours:args.desiredHours,alternativeIndex,
    selected:selected.map(c=>({id:c.id,geometry:c.geometry,features:c.features,network:c.networkSegments,ranking:c.ranking})),
    propertySections:sections.map(c=>({id:c.id,geometry:c.geometry,ranking:c.ranking})),
    compensation:[args.workerBasePayCents,args.completionBonusCents,args.qualityBonusCents]};
  return {planId:`scale-area_${hash(identity).slice(0,24)}`,label:'Recommended Marketing Area',anchor:args.anchor,
    selectedTerritory:args.selectedBoundary,plannedTerritory:zones.length===1?zones[0].geometry:null,
    connectedTerritory:ownTeam&&option?{encoding:'map-parts-v1',parts:option.territory[0].map((ring,i)=>({hole:i>0,points:ring.slice(0,-1).map(([longitude,latitude])=>({latitude,longitude}))}))}:null,
    reviewTerritory:primary?.geometry||null,
    executionMode:ownTeam?'own_team':'marketplace',
    teamCapacity:teamAllocation,completeAreaWorkload:workloadComplete,
    supportedTargetSubsetMinutes:usable?minutes:null,
    supportedWorkloadShortfallMinutes:workloadComplete?Math.max(0,workloadRequirement.requestedMinutes-minutes):null,
    workloadFulfilled:workloadComplete&&minutes>=workloadRequirement.requestedMinutes,
    desiredHours:args.desiredHours,totalEstimatedProperties:usable?features.length:null,
    totalEstimatedMinutes:usable?minutes:null,totalEstimatedHours:usable?Number((minutes/60).toFixed(1)):null,
    recommendedScalerCount:ownTeam?0:zones.length,requiresSplit:!ownTeam&&zones.length>1,
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
      personalizationStatus:personalized?'supported_proxy':'unavailable',serviceIntents:property.serviceIntents(args.intelligenceContext),
      supportedMinutes:usable?minutes:null,why,signals:selected.flatMap(c=>c.ranking.displaySignals||[]),limitations,
      propertyRecommendation:ranked?{sectionId:primary.id,fit:primary.ranking.fit,
        sections:sections.map(c=>({sectionId:c.id,fit:c.ranking.fit,evidence:c.ranking.evidence})),
        geometry:primary.geometry}:null,
      mapValidation,planningConfidence:'Limited',
      alternativeIndex,hasAlternative:ownTeam?options.some((o,i)=>i!==alternativeIndex&&o.selected.map(c=>c.id).join('|')!==selected.map(c=>c.id).join('|')):evidence.candidates.some(c=>!selected.some(s=>s.id===c.id)&&
        c.workload.estimatedMinutes>0&&c.workload.estimatedMinutes<=planning.SINGLE_SCALER_MAX_MINUTES)},
    campaignWorkload:workloadRequirement,selectionIds:selected.map(c=>c.id),
    compensation:usable&&!ownTeam?planning.compensationRecommendation({estimatedMinutes:minutes,
      workerBasePayCents:args.workerBasePayCents,completionBonusCents:args.completionBonusCents,
      qualityBonusCents:args.qualityBonusCents}):null,
    zones,policyVersion:VERSION,geometryVersion:usable?planning.GEOMETRY_VERSION:planning.FALLBACK_GEOMETRY_VERSION,
    practicalMaximumZones:planning.MAX_ZONES_PER_CAMPAIGN};
}
module.exports={assembledCandidates,ownTeamOptions,VERSION,MAX_WINDOWS,MAX_SEARCH_MS,FAIL_SAFE,partition,search,generate,groups,propertyOptions};
