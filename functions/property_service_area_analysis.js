'use strict';
const {createHash}=require('node:crypto');
const geometry=require('./property_service_area_geometry');
const propertyIntelligence=require('./property_intelligence');
const {validateGeometry}=propertyIntelligence;
const VERSION='PropertyServiceAreaAnalysisV2',DAY=86400000;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const id=v=>{if(typeof v!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(v))fail('invalid-argument','Choose a valid saved request.');return v;};
const text=(v,n=200)=>typeof v==='string'?v.trim().slice(0,n):'';
const list=v=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string').map(x=>text(x)).filter(Boolean))].slice(0,40):[];
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const millis=v=>typeof v==='number'&&Number.isFinite(v)?v:v?.toMillis?.()??(typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null);
const polygon=g=>[[[...g.map(p=>[p.longitude,p.latitude]),[g[0].longitude,g[0].latitude]]]];
const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
const serviceTokens=value=>text(value,800).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  .filter(t=>!['get','more','new','job','jobs','inquiry','inquiries','request','requests','service','services','promote','build','building'].includes(t))
  .map(t=>t.length>5&&t.endsWith('ing')?t.slice(0,-3):t.length>4&&t.endsWith('ies')?t.slice(0,-3)+'y':t.length>3&&t.endsWith('s')?t.slice(0,-1):t)
  .filter(t=>t.length>2);
const excludedService=(service,excluded)=>{
  const tokens=new Set(serviceTokens(service));return excluded.some(value=>{const deny=serviceTokens(value);return deny.length&&deny.every(t=>tokens.has(t));});
};
function serviceFocus(context={}){
  const excluded=list(context.excludedServices),offered=list(context.services).filter(s=>!excludedService(s,excluded));
  const goalTokens=new Set(serviceTokens(context.goal));
  if(excluded.some(s=>{const tokens=serviceTokens(s);return tokens.length&&tokens.every(t=>goalTokens.has(t));}))
    return {services:[],error:'This goal names a service excluded by your saved Business preferences.'};
  const selected=offered.filter(s=>serviceTokens(s).some(t=>goalTokens.has(t)));
  const priority=list(context.priorityServices).filter(s=>offered.some(v=>v.toLowerCase()===s.toLowerCase()));
  const services=selected.length?selected:(priority.length?priority:offered);
  return {services,error:services.length?null:'No eligible offered service is available for this goal.'};
}
function serviceIntents(context={}) {
  const focus=serviceFocus(context),goal=String(context.goal||'').toLowerCase();
  // An explicit service goal must not silently acquire unrelated saved priority
  // services. Profile priorities are fallback context only for general goals.
  const words=/roof|deck|cement|concrete|driveway/.test(goal)?goal:`${goal} ${focus.services.join(' ')}`.toLowerCase();
  const requested=[];
  if(/roof/.test(words))requested.push('roofing');
  if(/deck/.test(words)) {
    if(/repair|restor/.test(goal))requested.push('deck_repair');
    if(/build|new deck|construction/.test(goal))requested.push('deck_build');
    if(!requested.some(s=>s.startsWith('deck_')))requested.push('deck_unspecified');
  }
  if(/cement|concrete|driveway/.test(words))requested.push('concrete');
  if(!requested.length)requested.push('general_offered_services');
  const targetIntent=context.targetIntent||marketingTargetIntent(context.campaignType,context.goal);
  return {version:'PropertyServiceIntentV1',requested,targetIntent,services:focus.services,error:focus.error,
    propertyConstraint:/\b(?:only|exclusively)\b[^.!?]{0,35}\bdetached\b/.test(goal)?'detached_residential':
      /\b(?:only|exclusively)\b[^.!?]{0,35}\bsingle.family\b/.test(goal)?'single_family_residential':null};
}
function projectPropertyFacts(analysis,sectionGeometry) {
  if(!Array.isArray(analysis?.propertyRecords))return null;
  const records=analysis.propertyRecords.filter(r=>propertyIntelligence.pointInPolygon(r,sectionGeometry));
  const projected=propertyIntelligence.analyzeParcelObservations(records.map(r=>({...r,
    yearBuiltBucket:propertyIntelligence.yearBucket(r.yearBuilt)})),{geometry:sectionGeometry,
    partialCoverage:analysis.partialCoverage===true,sourceUpdatedAt:analysis.dataUpdatedAt});
  return {...projected,source:analysis.source,sourceVersion:analysis.sourceVersion,generatedAt:analysis.generatedAt,
    geometryDigest:propertyIntelligence.geometryDigest(sectionGeometry),retrievedAt:analysis.retrievedAt,
    providerPagination:analysis.providerPagination,matchingRule:analysis.recordCoverage?.method};
}
function marketingTargetIntent(campaignType,goal){
  const maintained=require('./smart_zone_serviceability').intent(campaignType);
  if(!['residential','business'].includes(maintained))return 'unsupported';
  // Keep "non-residential" as one intent token so its suffix does not also
  // trigger the conflicting-residential guard below.
  const words=text(goal,800).toLowerCase().replace(/\bnon[-\s]?residential\b/g,'nonresidential');
  const business=/\b(?:b2b|commercial|nonresidential)\b|\bbusiness(?:es)?\s+(?:customers|clients|owners|outreach|leads|prospects)\b|\b(?:target|find|reach|market to|sell to)\b[^.!?]{0,70}\b(?:businesses|companies|offices|restaurants|cafes|retail shops)\b/.test(words);
  const residential=/\bhomeowners?\b|\bresidential\b|\bhouseholds?\b/.test(words);
  // Conflicting targets need an explicit choice; a campaign format such as a
  // flyer does not itself decide who the Business is trying to reach.
  if(business&&residential)return 'unsupported';
  return business?'business':residential?'residential':maintained;
}
// Shared with the maintained saved-service-area recommendation workflow. These
// are server-loaded profile/preferences, never a client-supplied service list.
function buildMarketingContext({businessId,profile,preferences,objective,campaignType}={}){
  const b=id(businessId),prefs=preferences;
  if(prefs?.userUid!==b||prefs.role!=='business'||prefs.schemaVersion!=='ServiceAreaPreferencesV1'||profile?.businessUid!==b)
    fail('failed-precondition','Save your Business profile and service areas before analyzing.');
  const normalized=geometry.normalizeAreas(prefs);
  const excluded=list([...(profile.servicesNotOffered||[]),...(prefs.excludedServices||[])]);
  const services=list(profile.servicesOffered).filter(s=>!excludedService(s,excluded));
  if(!text(profile.businessName)||!services.length)fail('failed-precondition','Save the services your Business offers first.');
  const priorities=list(prefs.priorityServices?.length?prefs.priorityServices:profile.priorityServices)
    .filter(s=>services.some(v=>v.toLowerCase()===s.toLowerCase()));
  const goal=text(objective,800)||text(prefs.defaultResponseGoal,800)||'Review opportunities for the saved Business services';
  const context={businessId:b,businessName:text(profile.businessName),services,priorityServices:priorities,excludedServices:excluded,
    goal,campaignType:text(campaignType,80),outcomeEvidence:{status:'unknown',
      note:'No reliable geographic link between CRM outcomes and these sections is available; no conversion or revenue lift is inferred.'}};
  context.targetIntent=marketingTargetIntent(context.campaignType,goal);
  return {context,normalized,eligibleGeography:normalized.union,version:hash([prefs,profile]),
    contextVersion:hash([prefs,profile,goal,context.campaignType])};
}
function rankAnalysis(analysis,context){
  if(Array.isArray(analysis?.propertyRecords)) {
    const intents=serviceIntents(context),records=analysis.propertyRecords;
    const ground=r=>/standard unit|split foyer|split level|center unit|end unit|detached|house|bungalow|terrace/i.test(r.propertyType||'');
    const eligible=records.filter(r=>intents.targetIntent==='business'?r.residential===false&&
      (typeof r.commercial==='boolean'?r.commercial:/commercial|office|store|retail|warehouse|industrial/i.test(r.propertyType||'')):
      r.residential===true);
    const constrained=intents.propertyConstraint==='detached_residential'?eligible.filter(r=>/\bdetached\b/i.test(r.propertyType||'')&&!/semi.detached/i.test(r.propertyType||'')):
      intents.propertyConstraint==='single_family_residential'?eligible.filter(ground):eligible;
    const limitations=['Recorded structure age/type is a planning proxy, not component condition, component age, buying intent or guaranteed leads.',
      'Official parcel-point locations are not footprint matches, household counts or verified delivery stops. No nearest-property matching is used.'];
    if(intents.error||!records.length||!constrained.length||intents.targetIntent==='unsupported')return {fit:null,reasons:[],limitations:[...limitations,intents.error||'No supported property records match this target constraint.'],serviceIntents:intents};
    const shares=constrained.length/records.length*100,components=[];
    for(const intent of intents.requested) {
      const groundRequired=['deck_repair','deck_build','deck_unspecified','concrete'].includes(intent);
      const typed=constrained.filter(r=>r.propertyType&&r.propertyType!=='unknown'&&
        (!groundRequired||!/^(residential|residential condominium)$/i.test(r.propertyType)));
      const typeFit=groundRequired?(typed.length?constrained.filter(ground).length/constrained.length*100:null):shares;
      const years=constrained.filter(r=>Number.isInteger(r.yearBuilt)&&propertyIntelligence.yearBucket(r.yearBuilt));
      const ageRule=['roofing','deck_repair'].includes(intent);
      const ageFit=ageRule?(years.length?years.filter(r=>(analysis.analysisReferenceYear||new Date().getUTCFullYear())-r.yearBuilt>=20).length/years.length*100:null):null;
      const fit=typeFit===null||ageRule&&ageFit===null?null:ageRule?(typeFit+ageFit)/2:typeFit;
      components.push({intent,fit,recordCount:constrained.length,knownTypeCount:typed.length,knownYearCount:years.length,
        groundOrientedCount:constrained.filter(ground).length,typeFit,ageFit,rule:ageRule?'recorded_structure_20plus_proxy_and_type':'recorded_property_type_proxy',
        scope:'official parcel points inside candidate',assumption:true});
    }
    const supported=components.filter(c=>c.fit!==null),fit=supported.length?Math.round(supported.reduce((s,c)=>s+c.fit,0)/supported.length):null;
    const reasons=components.map(c=>c.fit===null?`${c.intent.replaceAll('_',' ')} suitability unavailable: required recorded property fields are missing.`:
      `${c.intent.replaceAll('_',' ')}: ${c.knownTypeCount} of ${c.recordCount} matching parcel records have a recorded type; ${c.knownYearCount} have a usable year built. ${c.ageFit===null?(c.intent==='general_offered_services'?'Only recorded target-property share is supported; service-specific suitability is unavailable.':'Ground-oriented property type is a disclosed suitability proxy; outdoor space is unknown.'):'Recorded structures at least 20 years old inform a disclosed outreach suitability proxy; component condition and installation dates are unknown.'}`);
    if(analysis.partialCoverage)limitations.push('Property pagination is incomplete; these facts cover only the returned subset.');
    return {fit,reasons,limitations,serviceIntents:intents,scoreComponents:components,recordCoverage:analysis.recordCoverage,
      version:'PropertyServiceFitV2',personalizationStatus:supported.some(c=>c.intent!=='general_offered_services')?'supported_proxy':'unavailable'};
  }
  const count=number(analysis?.propertyCount),residential=number(analysis?.residentialStructureCount);
  const unknown=analysis?.confidence==='INSUFFICIENT'||count===null||count<=0||residential===null||residential<=0;
  const limitations=[...list(analysis?.limitations),'Planning heuristic only; this does not establish property condition, homeowner intent, or demand.',
    'Generic residential classifications do not establish single-family homes or the presence or condition of decks, roofs, or other components.'];
  if(unknown)return {fit:null,reasons:[],limitations:[...limitations,'Insufficient supported housing data to rank this section.']};
  if(context?.targetIntent==='business')return {fit:null,reasons:[],limitations:[...limitations,
    'Housing evidence cannot rank commercial prospects. Business-category Property Intelligence is required.']};
  if(analysis.inputGranularity==='aggregate_census')return {fit:null,reasons:[],limitations:[...limitations,
    'Census housing context covers whole intersecting block groups. Its housing-only universe cannot establish the selected section\'s residential share or an individual property fit.']};
  const {services,error}=serviceFocus(context);
  if(error)return {fit:null,reasons:[],limitations:[...limitations,error]};
  const words=services.join(' ').toLowerCase(),share=Math.min(1,residential/count);
  let fit=share*50,reasons=[`${residential} residential records or housing units among ${count} analyzed; the source granularity applies.`];
  let age=null,label='';
  if(/remodel|kitchen|bathroom|renovat|window/.test(words)){age=number(analysis.percent40PlusYearsOld);label='40+';}
  else if(/roof|hvac|heating|air conditioning|replacement/.test(words)){age=number(analysis.percent20PlusYearsOld);label='20+';}
  if(label){
    if(age===null){limitations.push('The age threshold for this service is unavailable; no age-based fit is assigned.');return {fit:null,reasons,limitations};}
    fit+=Math.max(0,Math.min(100,age))*0.5;
    reasons.push(`${age}% are ${label} years old; used only as a disclosed planning proxy for ${services.join(', ')} outreach, not a service-need finding.`);
  }else{
    fit=share*100;
    reasons.push('Ranked by observed residential share only; no supported component-specific need or condition metric is available.');
  }
  if(analysis.partialCoverage===true)limitations.push('The provider reported partial coverage.');
  return {fit:Math.round(fit),reasons,limitations};
}

// One shared Property Intelligence ranking entry point for saved-area analysis
// and campaign recommendations. Map availability cannot create or erase fit.
function rankPropertySection({analysis,context,geometry:sectionGeometry}){
  let digest;
  try{digest=propertyIntelligence.geometryDigest(validateGeometry(sectionGeometry));}catch(_){return {fit:null,reasons:[],limitations:['Valid section geometry is required.']};}
  if(!analysis||analysis.geometryDigest!==digest||!analysis.source||analysis.source==='none')
    return {fit:null,reasons:[],limitations:['Matching authoritative Property Intelligence is unavailable for this section.']};
  const ranking=rankAnalysis(analysis,context),history=marketingHistorySignal(sectionGeometry,context?.marketingHistory);
  const limitations=[...ranking.limitations];
  if(history.status!=='available')limitations.push('Completed-marketing history is unavailable or incomplete; no absence of prior marketing is assumed.');
  else limitations.push(history.limitation);
  const signals=[{label:analysis.inputGranularity==='aggregate_census'?'Housing-unit context in intersecting Census block groups':'Analyzed property records',
    value:analysis.propertyCount,source:analysis.source},
  {label:'Service-area fit',value:'Inside your saved service area',source:'Saved Business service areas'}];
  if(analysis.predominantConstructionEra)signals.push({label:'Predominant construction era',value:analysis.predominantConstructionEra,source:analysis.source});
  if(history.recentCompletedOverlap===true)signals.push({label:'Recent completed-marketing overlap',value:history.overlapPercent===null?'Present':`${history.overlapPercent}%`,source:'Your Business marketing history'});
  return {...ranking,version:'PropertySectionRecommendationV3',
    fit:ranking.fit===null?null:Math.max(0,ranking.fit-history.penalty),
    limitations:[...new Set(limitations)],displaySignals:signals,
    evidence:{analysisId:analysis.analysisId||null,geometryDigest:digest,source:analysis.source,
      sourceVersion:analysis.sourceVersion||null,dataUpdatedAt:analysis.dataUpdatedAt||null,
      generatedAt:analysis.generatedAt||null,inputGranularity:analysis.inputGranularity||null,
      geographicCoverageMethod:analysis.geographicCoverageMethod||null,confidence:analysis.confidence||'INSUFFICIENT'},
    history};
}

const MARKETING_SCORE_VERSION='PropertyMarketingAreaFitV2';
const BUSINESS_CATEGORIES=[
  {label:'restaurants',tokens:['restaurant'],match:t=>t.amenity==='restaurant'},
  {label:'cafes',tokens:['cafe','coffee'],match:t=>t.amenity==='cafe'},
  {label:'retail shops',tokens:['retail','shop','store'],match:t=>!!t.shop&&t.shop!=='vacant'},
  {label:'offices',tokens:['office'],match:t=>!!t.office&&t.office!=='vacant'},
  {label:'hair and beauty businesses',tokens:['salon','hair','beauty'],match:t=>['hairdresser','beauty'].includes(t.shop)},
  {label:'automotive businesses',tokens:['automotive','garage','mechanic'],match:t=>['car','car_repair','tyres'].includes(t.shop)||t.craft==='car_repair'},
  {label:'medical practices',tokens:['medical','dentist','dental','clinic'],match:t=>['doctors','dentist','clinic'].includes(t.amenity)},
];
const dateText=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))
  ?new Date(value).toISOString():null;

// Read-only reuse of the maintained BusinessMarketingHistoryV1 completion
// semantics. Match marketing_history_geometry's calendar window, spherical
// area, meaningful-overlap thresholds and local percentage bounds. This never
// treats active/draft campaigns or recommendation inventory as completed work.
function marketingHistorySignal(candidateGeometry,history){
  const unknown={status:'unknown',recentCompletedOverlap:null,overlapPercent:null,penalty:0};
  if(history?.status!=='available'||history.inventoryComplete!==true||!Array.isArray(history.records)||
      history.records.length>200||!Number.isSafeInteger(history.checkedAtMs)||!Number.isSafeInteger(history.windowStartMs))return unknown;
  const d=new Date(history.checkedAtMs),year=d.getUTCFullYear()-1,month=d.getUTCMonth();
  const day=Math.min(d.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
  const windowStart=Date.UTC(year,month,day,d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds());
  if(history.windowStartMs!==windowStart)return unknown;
  const clipping=require('polygon-clipping'),normalize=require('./smart_zone_entry_contract').normalizeAnalysisBoundary;
  let vertices=0;
  const shape=parts=>{
    if(!Array.isArray(parts)||!parts.length||parts.length>100)throw Error('invalid_history_geometry');
    const polygons=parts.map(part=>{
      const points=normalize(part?.points||part);if(!points)throw Error('missing_history_geometry');
      vertices+=points.length;if(vertices>50000)throw Error('bounded_history_geometry');
      const ring=points.map(p=>[p.longitude,p.latitude]);
      if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])ring.push([...ring[0]]);
      return [ring];
    });
    return clipping.union(...polygons);
  };
  const area=multi=>{
    const ringArea=ring=>{let sum=0;for(let i=1;i<ring.length;i++)sum+=(ring[i][0]-ring[i-1][0])*Math.PI/180*
      (Math.sin(ring[i][1]*Math.PI/180)+Math.sin(ring[i-1][1]*Math.PI/180));return Math.abs(sum)*6371008.8**2/2;};
    return multi.reduce((sum,p)=>sum+ringArea(p[0])-p.slice(1).reduce((n,r)=>n+ringArea(r),0),0);
  };
  try{
    const subject=shape([{points:candidateGeometry}]),subjectArea=area(subject),intersections=[];
    let mostRecentCompletedAtMs=null,recentRecordCount=0;
    for(const record of history.records){
      if(!Number.isSafeInteger(record.completedAtMs)||record.completedAtMs<Date.UTC(2000,0,1)||record.completedAtMs>history.checkedAtMs||
          !['business_reported','authoritative_zone_review'].includes(record.completionEvidenceSource))return unknown;
      const previous=shape(record.geometryParts);
      if(record.completedAtMs<windowStart)continue;
      const intersection=clipping.intersection(subject,previous),overlap=area(intersection);
      if(overlap>=25&&overlap/subjectArea>=0.001){
        intersections.push(intersection);recentRecordCount++;
        mostRecentCompletedAtMs=Math.max(mostRecentCompletedAtMs||0,record.completedAtMs);
      }
    }
    const xs=candidateGeometry.map(p=>p.longitude),ys=candidateGeometry.map(p=>p.latitude);
    const reliable=Math.max(...xs)-Math.min(...xs)<=0.25&&Math.max(...ys)-Math.min(...ys)<=0.25&&Math.max(...ys.map(Math.abs))<=70;
    const overlapPercent=intersections.length&&reliable?Math.min(100,Math.max(0,Math.round(1000*area(clipping.union(...intersections))/subjectArea)/10)):null;
    return {status:'available',recentCompletedOverlap:intersections.length>0,overlapPercent,
      penalty:overlapPercent===null?0:Math.round(overlapPercent*0.15),recentRecordCount,mostRecentCompletedAtMs,
      windowStartMs:windowStart,checkedAtMs:history.checkedAtMs,source:'BusinessMarketingHistoryV1',
      limitation:'Completed-footprint overlap only; this does not measure saturation, response, conversion or customer demand.'};
  }catch(_){return unknown;}
}

// Rank already serviceable mapping candidates within the maintained Property
// Intelligence layer. This is a disclosed relative planning heuristic, not a
// probability of a sale, a property-condition model, or execution authority.
function rankMarketingArea({candidate,snapshot,analysis=null,context={}}={}){
  const focus=serviceFocus(context);
  const limitations=[
    'Relative planning fit only; mapped features are not verified households, delivery points, buying intent or guaranteed leads.',
    'Building type and age do not establish ownership, outdoor space, component condition or a need for the offered service.',
    'Supporting streets are mapped evidence; access permission and a final execution route remain unverified.',
    'CRM outcomes and customer conversion are not inferred from geography or completed-marketing records.',
  ];
  const output={version:MARKETING_SCORE_VERSION,fit:null,reasons:[],limitations,serviceFocus:focus.services,signals:{},displaySignals:[]};
  if(focus.error){limitations.push(focus.error);return output;}
  const targetIntent=context.targetIntent||marketingTargetIntent(context.campaignType,context.goal);
  if(!['residential','business'].includes(targetIntent)){
    limitations.push('This campaign intent has no supported residential or business scoring policy.');return output;
  }
  let areaSquareMeters;
  try{
    validateGeometry(candidate?.geometry);
    areaSquareMeters=require('./smart_zone_planning').polygonAreaSquareMeters(candidate.geometry);
  }catch(_){limitations.push('A valid candidate geometry is required to rank mapped evidence.');return output;}
  if(!(areaSquareMeters>=100)||!snapshot?.source||snapshot.source==='none'||!Array.isArray(snapshot.targetFeatures)||
      !Array.isArray(candidate?.features)||!candidate.features.length||candidate.features.length>5000||
      !Array.isArray(candidate.networkSegments)||!candidate.networkSegments.length||!(number(candidate.mappedRouteMeters)>0)){
    limitations.push('Mapped targets and supporting local-street evidence are unavailable for this candidate.');return output;
  }
  const sourceFeatures=new Map(snapshot.targetFeatures.slice(0,5000).map(feature=>[feature.id,feature]));
  const used=new Set(),features=[];
  for(const selected of candidate.features){
    const id=selected?.id||selected?.sourceId,feature=sourceFeatures.get(id);
    if(!feature||feature.kind!==targetIntent||used.has(id)||
        number(feature.latitude)===null||number(feature.longitude)===null||
        !propertyIntelligence.pointInPolygon(feature,candidate.geometry))continue;
    used.add(id);features.push(feature);
  }
  if(!features.length){limitations.push('No source-backed targets match this campaign intent inside the candidate.');return output;}
  const constraints=serviceIntents(context).propertyConstraint;
  if(constraints&&features.some(f=>constraints==='detached_residential'?f.observedTags?.building!=='detached':
    !['house','detached','semidetached_house','bungalow','terrace'].includes(f.observedTags?.building))){
    limitations.push('Mapped target types cannot establish the requested hard property-type constraint for every selected feature.');return output;
  }
  const counts={};
  for(const feature of features){const building=text(feature.observedTags?.building,80);if(building)counts[building]=(counts[building]||0)+1;}
  const density=features.length/(areaSquareMeters/1000000),metersPerFeature=candidate.mappedRouteMeters/features.length;
  output.signals={targetIntent,mappedTargetCount:features.length,verifiedDeliveryPoints:false,
    mappedTargetsPerSquareKm:Math.round(density*10)/10,mappedNetworkMeters:Math.round(candidate.mappedRouteMeters),
    mappedNetworkMetersPerTarget:Math.round(metersPerFeature*10)/10,buildingTypes:counts,
    source:snapshot.source,sourceDataTimestamp:dateText(snapshot.dataTimestamp),fetchedAt:dateText(snapshot.fetchedAt),
    propertyIntelligence:{status:'unavailable'}};
  output.displaySignals=[{label:'Mapped target features',value:features.length,source:'OpenStreetMap'},
    {label:'Mapped features per km²',value:Math.round(density),source:'Mapped count / candidate area'},
    {label:'Supporting street network',value:`${Math.round(candidate.mappedRouteMeters)} m`,source:'OpenStreetMap; access unverified'}];
  output.reasons.push(`${features.length} mapped ${targetIntent} target features inside this candidate; approximately ${Math.round(density)} mapped features per km².`,
    `${Math.round(candidate.mappedRouteMeters)} m of supporting local-street linework; this is not an approved execution route.`);
  // Components are explicit and bounded. Density saturates rather than turning
  // requested hours into a fictional target count. Smaller road distance per
  // observed feature is a compactness proxy, not verified pedestrian access.
  const densityFit=100*density/(density+100),compactnessFit=100/(1+metersPerFeature/100);
  let serviceFit=50,serviceBasis='generic mapped target type';
  if(targetIntent==='business'){
    const goalTokens=new Set(serviceTokens(context.goal)),serviceWords=new Set(serviceTokens(focus.services.join(' ')));
    const goalCategories=BUSINESS_CATEGORIES.filter(category=>category.tokens.some(token=>goalTokens.has(token)));
    const categories=goalCategories.length?goalCategories:BUSINESS_CATEGORIES.filter(category=>category.tokens.some(token=>serviceWords.has(token)));
    if(categories.length){
      const matching=features.filter(feature=>categories.some(category=>category.match(feature.observedTags||{}))).length;
      serviceBasis='observed business category tags';
      output.signals.businessCategories={requested:categories.map(category=>category.label),matchingMappedFeatures:matching};
      output.displaySignals.push({label:`Mapped ${categories.map(category=>category.label).join(' / ')}`,value:matching,source:'Observed OpenStreetMap category tags'});
      if(!matching){limitations.push('No observed business-category tags support the selected target category in this candidate.');return output;}
      serviceFit=matching/features.length*100;
      output.reasons.push(`${matching} mapped features have category tags matching ${categories.map(category=>category.label).join(', ')}.`);
    }else{
      output.reasons.push('Ranked as general business outreach using observed business density and supporting streets.');
      limitations.push('No specific supported business-category target was identified from the goal; category-specific customer fit is unavailable.');
    }
  }else{
    if(serviceIntents(context).requested.some(s=>s.startsWith('deck_')||s==='concrete')||/landscap|lawn|garden|fenc/.test(context.goal||'')){
      const groundTypes=new Set(['house','detached','semidetached_house','bungalow','terrace']);
      const matching=features.filter(feature=>groundTypes.has(feature.observedTags?.building)).length;
      const typed=features.filter(feature=>!!feature.observedTags?.building).length;
      output.signals.housingTypeFit={matchingMappedFeatures:matching,featuresWithBuildingType:typed};
      if(typed){
        serviceFit=matching/features.length*100;serviceBasis='observed ground-oriented housing tags';
        output.reasons.push(`${matching} mapped features are tagged as house, detached, semidetached, bungalow or terrace; used as a housing-type planning proxy for ${focus.services.join(', ')}.`);
        output.displaySignals.push({label:'Mapped ground-oriented housing types',value:matching,source:'Observed OpenStreetMap building tags; outdoor space unknown'});
      }else limitations.push('Mapped housing-type tags are unavailable; no deck, yard or lawn suitability has been inferred.');
    }
    const projected=projectPropertyFacts(analysis,candidate.geometry);
    if(projected)analysis=projected;
    let digest=null;
    try{digest=propertyIntelligence.geometryDigest(candidate.geometry);}catch(_){/* no usable PI geometry */}
    if(analysis&&analysis.geometryDigest!==digest){
      output.signals.propertyIntelligence={status:'geometry_mismatch'};
      limitations.push('Available Property Intelligence describes a different geometry and was not used.');
    }else if(analysis&&analysis.source&&analysis.source!=='none'&&(Array.isArray(analysis.propertyRecords)||analysis.confidence!=='INSUFFICIENT')){
      const ranked=rankAnalysis(analysis,context);
      output.signals.propertyIntelligence={status:ranked.fit===null?'insufficient':'used',source:text(analysis.source),
        sourceVersion:text(analysis.sourceVersion),dataUpdatedAt:text(analysis.dataUpdatedAt),geometryDigest:digest,
        inputGranularity:text(analysis.inputGranularity),fit:ranked.fit};
      output.serviceIntents=ranked.serviceIntents||serviceIntents(context);
      output.propertyScoreComponents=ranked.scoreComponents||[];
      output.propertyRecordCoverage=analysis.recordCoverage?{...analysis.recordCoverage,constructionEra:analysis.predominantConstructionEra,sourceVersion:analysis.sourceVersion,dataUpdatedAt:analysis.dataUpdatedAt,retrievedAt:analysis.retrievedAt||analysis.generatedAt||null}:null;
      output.personalizationStatus=ranked.personalizationStatus||'generic_section_context';
      if(ranked.fit===null&&output.serviceIntents.propertyConstraint){limitations.push(...ranked.limitations);return output;}
      limitations.push(...ranked.limitations);
      if(ranked.fit!==null){
        serviceFit=(serviceFit+ranked.fit)/2;serviceBasis+=' and maintained Property Intelligence service fit';
        output.reasons.push(...ranked.reasons);
        output.displaySignals.push({label:'Property Intelligence service-fit proxy',value:ranked.fit,source:text(analysis.source)});
      }
    }
    if(output.signals.propertyIntelligence.status!=='used')limitations.push('Same-area Property Intelligence age/service fit is unavailable; this ranking uses mapped evidence only.');
  }
  if(targetIntent==='business') {
    const projected=projectPropertyFacts(analysis,candidate.geometry);
    if(projected){
      const ranked=rankAnalysis(projected,context);
      output.serviceIntents=ranked.serviceIntents;output.propertyScoreComponents=ranked.scoreComponents||[];
      output.propertyRecordCoverage=projected.recordCoverage;output.personalizationStatus=ranked.personalizationStatus||'unavailable';
      output.signals.propertyIntelligence={status:ranked.fit===null?'insufficient':'used',source:projected.source,
        sourceVersion:projected.sourceVersion,dataUpdatedAt:projected.dataUpdatedAt,geometryDigest:projected.geometryDigest,inputGranularity:projected.inputGranularity,fit:ranked.fit};
      if(ranked.fit===null)return {...output,limitations:[...limitations,...ranked.limitations]};
      serviceFit=(serviceFit+ranked.fit)/2;serviceBasis+=' and recorded commercial-property proxy';
      output.reasons.push(...ranked.reasons);limitations.push(...ranked.limitations);
    }
  }
  output.signals.scoreComponents={serviceFit:Math.round(serviceFit),densityFit:Math.round(densityFit),
    compactnessFit:Math.round(compactnessFit),serviceBasis,weights:{serviceFit:0.5,densityFit:0.3,compactnessFit:0.2}};
  const history=marketingHistorySignal(candidate.geometry,context.marketingHistory);
  output.signals.marketingHistory=history;
  if(history.status==='available'){
    limitations.push(history.limitation);
    if(history.recentCompletedOverlap){
      output.reasons.push(`This candidate overlaps marketing recorded complete within the last 12 months${history.overlapPercent===null?'':` (${history.overlapPercent}% of its area)`}. A disclosed ${history.penalty}-point overlap penalty favors other supported areas; repeating this area remains allowed.`);
      output.displaySignals.push({label:'Completed marketing overlap in last 12 months',value:history.overlapPercent===null?'Percentage unavailable':`${history.overlapPercent}%`,source:'Your Business marketing completion history'});
    }else output.reasons.push('No meaningful overlap was found with the completed-marketing records in the checked 12-month history window.');
  }else limitations.push('Completed-marketing history is unavailable or incomplete; no absence of prior marketing or history-based advantage is assumed.');
  output.signals.scoreComponents.completedHistoryPenalty=history.penalty;
  output.fit=Math.max(0,Math.round(serviceFit*0.5+densityFit*0.3+compactnessFit*0.2)-history.penalty);
  output.limitations=[...new Set(limitations)];
  return output;
}
function selectSpread(candidates,areaIds,seed,maximum=12){
  const groups=areaIds.map(areaId=>candidates.filter(c=>c.areaIds.includes(areaId)).sort((a,b)=>hash([seed,a.id]).localeCompare(hash([seed,b.id]))));
  const selected=[],seen=new Set();let progressed=true;
  while(selected.length<maximum&&progressed){progressed=false;for(const group of groups){while(group.length&&seen.has(group[0].id))group.shift();const c=group.shift();if(c){progressed=true;seen.add(c.id);selected.push(c);if(selected.length===maximum)break;}}}
  return selected;
}
function createService({db,FieldValue,analyze,now=Date.now}){
  const root=b=>db.doc('propertyRecommendationWorkspaces/'+id(b));
  const profileRef=b=>db.doc('businessGrowthProfiles/'+b),prefsRef=b=>db.doc('discoveryPreferences/'+b);
  function sources(b,prefs,profile,savedAreaId){
    const source=buildMarketingContext({businessId:b,profile,preferences:prefs,campaignType:'flyer_distribution'});
    if(savedAreaId&&!source.normalized.areas.some(a=>a.id===savedAreaId))fail('failed-precondition','This saved area is no longer enabled.');
    return source;
  }
  async function bounded(query){const s=await query.limit(501).get();if(s.size>500)fail('resource-exhausted','Saved history needs a complete paginated review before another analysis. Overlap is unknown.');return rows(s);}
  function shape(record){
    const raw=record.serviceArea||record.polygon||record.boundary||record.geometry;
    if(!raw&&!record.geometryParts)return null;
    try{return geometry.normalizeAreas({areas:[{id:'history',name:'Saved history',geometry:raw,geometryParts:record.geometryParts,geometryEncoding:record.geometryEncoding}]}).union;}catch(_){return null;}
  }
  async function inventory(b){
    const [campaigns,zones,territories]=await Promise.all([bounded(db.collection('campaigns').where('businessId','==',b)),
      bounded(db.collection('campaignZones').where('businessId','==',b)),bounded(root(b).collection('territories'))]);
    const shapes=[];let unknown=0;
    for(const c of campaigns){
      if(c.businessId!==b||c.isTestCampaign===true)continue;
      const date=millis(c.completedAt)??millis(c.updatedAt)??millis(c.createdAt);
      const terminal=['completed','cancelled','canceled','archived'].includes(c.status)||c.archived===true;
      if(terminal&&date!==null&&date<now()-90*DAY)continue;
      // Drafts and uncertain status remain planning overlap, never completed coverage.
      const related=[c,...zones.filter(z=>z.businessId===b&&z.campaignId===c.id)];
      let found=false;for(const record of related){const g=shape(record);if(g){shapes.push(g);found=true;}}
      if(!found||terminal&&date===null)unknown++;
    }
    for(const t of territories){if(t.businessId!==b)fail('failed-precondition','Saved recommendation ownership needs review.');
      const last=millis(t.createdAtMs);if(last!==null&&last<now()-90*DAY)continue;
      const g=shape(t);if(g)shapes.push(g);else unknown++;}
    return {shapes,unknown,territories};
  }
  async function run({businessId,actorUid,objective,requestId,savedAreaId=null,comparisonGeometry=null}){
    const b=id(businessId),actor=id(actorUid),request=id(requestId),goal=text(objective,800),areaId=savedAreaId===null?null:id(savedAreaId);
    let anchor=null;
    if(comparisonGeometry!==null){try{anchor=validateGeometry(comparisonGeometry);}catch(_){fail('invalid-argument','Select an analyzed area to find nearby alternatives.');}}
    const inputHash=hash(anchor?[b,goal,areaId,anchor]:[b,goal,areaId]),ref=root(b).collection('runs').doc(request),control=root(b);
    const claim=await db.runTransaction(async tx=>{
      const [existing,state,p,s]=await Promise.all([tx.get(ref),tx.get(control),tx.get(profileRef(b)),tx.get(prefsRef(b))]);
      if(existing.exists){const prior=existing.data();if(prior.businessId!==b||prior.inputHash!==inputHash)fail('already-exists','This request identifier belongs to different analysis input.');
        if(prior.report)return {report:prior.report};if(prior.status!=='failed')fail('failed-precondition','This request is already being analyzed.');}
      const previous=state.data()||{};
      if(previous.leaseUntil>now())fail('aborted','Another area analysis is still running.');
      if(previous.cooldownUntil>now())fail('resource-exhausted','Wait briefly before analyzing more sections.');
      const source=sources(b,s.data(),p.data(),areaId);
      if(anchor&&!geometry.intersects(polygon(anchor),source.normalized.union))fail('failed-precondition','Choose an area inside your saved service areas to find nearby alternatives.');
      source.context.goal=goal||text(s.data().defaultResponseGoal)||'Review opportunities for the saved Business services';
      tx.set(control,{businessId:b,leaseRequestId:request,leaseUntil:now()+180000},{merge:true});
      tx.set(ref,{schemaVersion:VERSION,businessId:b,actorUid:actor,requestId:request,inputHash,sourceVersion:source.version,status:'analyzing',
        createdAtMs:existing.data()?.createdAtMs??now(),attemptedAtMs:now(),attemptCount:(existing.data()?.attemptCount||0)+1});
      return source;
    });
    if(claim.report)return claim.report;
    try{
      const past=await inventory(b),sample=geometry.candidates(claim.normalized);
      const relevant=sample.candidates.filter(c=>!areaId||c.areaIds.includes(areaId));let excluded=0;
      const fresh=relevant.filter(c=>{if((anchor&&geometry.overlapsGeometry(c.geometry,anchor))||past.shapes.some(g=>geometry.intersects(polygon(c.geometry),g))){excluded++;return false;}return true;});
      const seed=hash([b,claim.normalized.digest,goal,claim.context.services,claim.context.priorityServices]);
      const areaOrder=areaId?[areaId]:claim.normalized.areas.map(a=>a.id).sort((a,b)=>{
        const examined=x=>past.territories.filter(t=>Array.isArray(t.areaIds)&&t.areaIds.includes(x)).length;
        return examined(a)-examined(b)||hash([seed,a]).localeCompare(hash([seed,b]));
      });
      const center=g=>g.reduce((a,p)=>[a[0]+p.latitude/g.length,a[1]+p.longitude/g.length],[0,0]);
      const distance=g=>{const a=center(anchor),c=center(g);return (a[0]-c[0])**2+((a[1]-c[1])*Math.cos(a[0]*Math.PI/180))**2;};
      const selected=anchor?[...fresh].sort((a,b)=>distance(a.geometry)-distance(b.geometry)||hash([seed,a.id]).localeCompare(hash([seed,b.id]))).slice(0,6):selectSpread(fresh,areaOrder,seed,12);
      const result=new Array(selected.length);let cursor=0;
      const worker=async()=>{while(cursor<selected.length){const i=cursor++,candidate=selected[i];try{
        const response=await analyze(candidate.geometry),analysis=JSON.parse(JSON.stringify(response?.analysis||response||null));
        if(!analysis||typeof analysis!=='object')throw Error('missing_analysis');
        const ranking=rankPropertySection({analysis,context:claim.context,geometry:candidate.geometry});
        result[i]={candidate,analysis,ranking,status:ranking.fit===null?'insufficient':'recommended'};
      }catch(_){result[i]={candidate,analysis:null,ranking:null,status:'provider_failed'};}}};
      await Promise.all(Array.from({length:Math.min(3,selected.length)},worker));
      const recommendations=result.filter(r=>r.status==='recommended').sort((a,b)=>b.ranking.fit-a.ranking.fit||a.candidate.id.localeCompare(b.candidate.id)).map((r,i)=>({
        id:r.candidate.id,name:r.candidate.areaName+' · section '+(i+1),rank:i+1,fit:r.ranking.fit,geometry:r.candidate.geometry,analysis:r.analysis,
        reasons:r.ranking.reasons,limitations:r.ranking.limitations,nextAction:'Review this section and confirm a suitable offer before planning a campaign.',status:'recommended'}));
      const report={id:request,summary:recommendations.length?`${recommendations.length} sections have supported planning signals from ${selected.length} examined sections.`:'No new section has enough supported data for a recommendation.',
        context:claim.context,recommendations,examinedCount:selected.length,remainingCandidateCount:fresh.length-selected.length,overlapsExcludedCount:excluded,
        failedSectionCount:result.filter(r=>r.status==='provider_failed').length,sampling:{...sample.sampling,wholeAreaAnalyzed:false,examinedThisRun:selected.length},
        historyNote:`Overlap uses this Business's active campaign geometry and recommendations or completed marketing from the last 90 days. Older areas can be reconsidered. ${past.unknown?past.unknown+' records have unknown geometry or timing.':'No missing geometry was found in the bounded records read.'} CRM outcomes are not geographically attributed; other businesses were not read.`};
      await db.runTransaction(async tx=>{
        const [state,p,s]=await Promise.all([tx.get(control),tx.get(profileRef(b)),tx.get(prefsRef(b))]);
        if(state.data()?.leaseRequestId!==request||state.data()?.leaseUntil<=now())fail('aborted','This analysis expired; refresh before retrying.');
        if(sources(b,s.data(),p.data(),areaId).version!==claim.version)fail('aborted','Your saved profile or areas changed. Analyze again using the current settings.');
        const previous=await Promise.all(result.map(r=>tx.get(root(b).collection('territories').doc(r.candidate.id))));
        const archived=await Promise.all(result.map((r,i)=>previous[i].exists
          ? tx.get(root(b).collection('territories').doc(r.candidate.id).collection('observations').doc(previous[i].data().runId)) : Promise.resolve(null)));
        tx.update(ref,{status:'completed',completedAtMs:now(),report});
        for(const [index,r] of result.entries()){
          const territory=root(b).collection('territories').doc(r.candidate.id),prior=previous[index].data();
          if(prior&&!archived[index].exists)tx.create(territory.collection('observations').doc(prior.runId),prior);
          const observation={schemaVersion:VERSION,businessId:b,runId:request,actorUid:actor,
          status:r.status,geometry:r.candidate.geometry,areaIds:r.candidate.areaIds,areaName:r.candidate.areaName,sourceVersion:claim.version,createdAtMs:now(),
          proof:{analysis:r.analysis,ranking:r.ranking,goal:claim.context.goal}};
          tx.set(territory,observation);tx.create(territory.collection('observations').doc(request),observation);
        }
        tx.set(control,{leaseUntil:0,leaseRequestId:null,cooldownUntil:now()+60000,lastRunId:request},{merge:true});
      });
      return report;
    }catch(error){
      await db.runTransaction(async tx=>{const state=(await tx.get(control)).data();if(state?.leaseRequestId===request){tx.update(ref,{status:'failed',failedAtMs:now()});tx.set(control,{leaseRequestId:null,leaseUntil:0,cooldownUntil:now()+60000},{merge:true});}});
      throw error;
    }
  }
  async function history({businessId}){const b=id(businessId);const snapshot=await root(b).collection('territories').orderBy('createdAtMs','desc').limit(30).get();return rows(snapshot).filter(r=>r.businessId===b).map(r=>({id:r.id,status:r.status,createdAtMs:r.createdAtMs,name:r.areaName,
    runId:r.runId,geometry:r.geometry,analysis:r.proof?.analysis||null,fit:r.proof?.ranking?.fit??null,reasons:r.proof?.ranking?.reasons||[],limitations:r.proof?.ranking?.limitations||[],goal:r.proof?.goal||'',updatedAtMs:r.updatedAtMs??null}));}
  async function change({businessId,actorUid,recommendationId},status){
    const b=id(businessId),actor=id(actorUid),ref=root(b).collection('territories').doc(id(recommendationId));
    return db.runTransaction(async tx=>{
      const [record,p,s]=await Promise.all([tx.get(ref),tx.get(profileRef(b)),tx.get(prefsRef(b))]);const t=record.data();
      if(!t||t.businessId!==b||!['recommended','saved','rejected'].includes(t.status))fail('not-found','Choose a recommendation in this Business.');
      const current=sources(b,s.data(),p.data(),null),g=shape(t);
      if(!g||!geometry.isContained(t.geometry,current.normalized.union))fail('failed-precondition','This section is no longer inside your current saved areas.');
      tx.update(ref,{status,updatedAtMs:now(),updatedBy:actor});
      tx.create(ref.collection('audit').doc(),{action:status,actorUid:actor,atMs:now()});return {id:t.id||recommendationId,status};
    });
  }
  return {run,history,save:input=>change(input,'saved'),reject:input=>change(input,'rejected')};
}
module.exports={serviceIntents,projectPropertyFacts,createService,rankAnalysis,rankPropertySection,rankMarketingArea,buildMarketingContext,marketingTargetIntent,marketingHistorySignal,selectSpread,VERSION,MARKETING_SCORE_VERSION};
