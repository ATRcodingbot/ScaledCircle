'use strict';
const {createHash}=require('node:crypto');
const geometry=require('./property_service_area_geometry');
const {validateGeometry}=require('./property_intelligence');
const VERSION='PropertyServiceAreaAnalysisV1',DAY=86400000;
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
function rankAnalysis(analysis,context){
  const count=number(analysis?.propertyCount),residential=number(analysis?.residentialStructureCount);
  const unknown=analysis?.confidence==='INSUFFICIENT'||count===null||count<=0||residential===null||residential<=0;
  const limitations=[...list(analysis?.limitations),'Planning heuristic only; this does not establish property condition, homeowner intent, or demand.',
    'Generic residential classifications do not establish single-family homes or the presence or condition of decks, roofs, or other components.'];
  if(unknown)return {fit:null,reasons:[],limitations:[...limitations,'Insufficient supported housing data to rank this section.']};
  const offered=context.services.filter(s=>!excludedService(s,context.excludedServices||[])),goalTokens=new Set(serviceTokens(context.goal));
  if((context.excludedServices||[]).some(s=>{const tokens=serviceTokens(s);return tokens.length&&tokens.every(t=>goalTokens.has(t));}))
    return {fit:null,reasons:[],limitations:[...limitations,'This goal names a service excluded by your saved Business preferences.']};
  const selected=offered.filter(s=>serviceTokens(s).some(t=>goalTokens.has(t)));
  const priority=context.priorityServices.filter(s=>offered.includes(s));
  const services=selected.length?selected:(priority.length?priority:offered);
  if(!services.length)return {fit:null,reasons:[],limitations:[...limitations,'No eligible offered service is available for this goal.']};
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
    if(prefs?.userUid!==b||prefs.role!=='business'||prefs.schemaVersion!=='ServiceAreaPreferencesV1'||profile?.businessUid!==b)
      fail('failed-precondition','Save your Business profile and service areas before analyzing.');
    const normalized=geometry.normalizeAreas(prefs);
    if(savedAreaId&&!normalized.areas.some(a=>a.id===savedAreaId))fail('failed-precondition','This saved area is no longer enabled.');
    const excluded=list([...(profile.servicesNotOffered||[]),...(prefs.excludedServices||[])]);
    const services=list(profile.servicesOffered).filter(s=>!excludedService(s,excluded));
    if(!text(profile.businessName)||!services.length)fail('failed-precondition','Save the services your Business offers first.');
    const priorities=list(prefs.priorityServices?.length?prefs.priorityServices:profile.priorityServices).filter(s=>services.some(v=>v.toLowerCase()===s.toLowerCase()));
    return {normalized,version:hash([prefs,profile]),context:{businessName:text(profile.businessName),services,priorityServices:priorities,excludedServices:excluded,
      outcomeEvidence:{status:'unknown',note:'No reliable geographic link between CRM outcomes and these sections is available; no conversion or revenue lift is inferred.'}}};
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
        const ranking=rankAnalysis(analysis,claim.context);
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
module.exports={createService,rankAnalysis,selectSpread,VERSION};
