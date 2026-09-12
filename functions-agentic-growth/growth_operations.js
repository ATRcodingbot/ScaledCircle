'use strict';
const crypto=require('node:crypto');
const agentic=require('./agentic_growth');
const sources=require('./growth_sources');
const geography=require('./growth_geography');
const internalWorkspace=require('./internal_growth_workspace');
const opportunityPreferences=require('./growth_opportunity_preferences');
const VERSION='GrowthDogfoodResearchV1';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const day=ms=>new Date(ms).toISOString().slice(0,10);
const fail=message=>{const e=Error(message);e.code='failed-precondition';throw e;};
const AGENTS=[['lead_generation','Lead Generator'],['workforce_recruiter','Workforce Recruiter'],['marketing_manager','Social Manager'],['ad_manager','Ad Manager'],['business_assistant','Business Assistant'],['growth_strategist','Growth Manager']];
function assertScope({project,target,actor}) {
  if(project!=='scaledcircle-staging'&&!project?.startsWith('demo-'))fail('Growth dogfood is not enabled in this environment.');
  if(!target||actor?.uid!==target||actor?.verified!==true||actor?.active!==true||actor?.role!=='admin')fail('Use the existing ScaledCircle dogfood Admin.');
}
function preferences(input={}) {
  const mode=input.mode||'important';
  if(!['off','important','daily','weekly','daily_weekly'].includes(mode)||Object.keys(input).some(k=>!['mode','opportunities'].includes(k)))fail('Choose a supported communication preference.');
  return {mode,important:mode!=='off',daily:['daily','daily_weekly'].includes(mode),weekly:['weekly','daily_weekly'].includes(mode),opportunities:opportunityPreferences.normalize(input.opportunities)};
}
function analyzeSource(source,html,now) {
  const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&[^;]+;/g,' ').replace(/\s+/g,' ');
  const qualified=source.signals.every(s=>text.toLowerCase().includes(s.toLowerCase()));
  const email=source.email&&html.toLowerCase().includes(source.email.toLowerCase())?source.email:null;
  const digits=text.replace(/\D/g,'');
  const phone=source.phone&&digits.includes(source.phone.replace(/\D/g,''))?source.phone:null;
  return {sourceUrl:source.url,sourceHash:hash(html),observedAt:now,supportedSignals:source.signals.filter(s=>text.toLowerCase().includes(s.toLowerCase())),qualified,email,phone,contactPath:source.url,confidence:qualified?'medium':'low',contactConfidence:'source_published_not_contact_authorized'};
}
async function fetchSource(source) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(source.url,{signal:controller.signal,redirect:'manual',headers:{'User-Agent':'ScaledCircleResearch/1.0 (+https://scaledcircle.com/#/support)'}});
    // Never follow an arbitrary redirect or user-supplied URL.
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))fail('Official source unavailable.');
    const reader=response.body.getReader();let body='',size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();fail('Source exceeds bounded research size.');}body+=Buffer.from(value).toString('utf8');}
    return body;
  }finally{clearTimeout(timer);}
}
// Only coarse, enumerated dimensions leave a tenant. No names, contacts,
// addresses, source URLs or free-form text enter network learning.
function networkPattern(observations) {
  const valid=observations.filter(o=>o?.verifiedOutcome===true&&['landscaping','workforce partnerships'].includes(o.industry)&&['email','website'].includes(o.channel)&&['positive_reply','no_reply'].includes(o.outcome)&&typeof o.businessUid==='string');
  const tenants=new Set(valid.map(o=>o.businessUid));
  if(tenants.size<5||valid.length<20)return {status:'INSUFFICIENT_EVIDENCE',sample:valid.length,tenantSupport:tenants.size,confidence:'low',patterns:[]};
  return {status:'AVAILABLE',sample:valid.length,tenantSupport:tenants.size,confidence:'medium',patterns:['Review supported channel outcomes within their industry segment.']};
}
function recommendationEvidence({local=[],network=[]}) {return local.length?{source:'business',evidence:local}:network.length?{source:'network',evidence:network}:{source:'generic',confidence:'low',evidence:[]};}
function report(rows,runs,scope={status:'MISSING_MAINTAINED_GEOGRAPHY',areas:[]},observations=[],sourceCatalog=sources,outreach=null) {
  const count=k=>rows.filter(x=>x.kind===k).length;
  const groups=geography.groupedDiscovery(rows.map(r=>({...r,serviceArea:r.serviceArea||sourceCatalog.find(s=>s.url===r.sourceUrl)?.serviceArea})),scope);
  const latest=[...runs].filter(r=>r.status==='completed').sort((a,b)=>b.createdAt-a.createdAt)[0];
  for(const group of groups){const checked=observations.filter(o=>o.runId===latest?.id&&geography.matchArea(o.serviceArea?o:sourceCatalog.find(s=>s.url===o.sourceUrl)||{},scope)?.id===group.serviceAreaId);
    group.researched=latest?checked.length:null;group.unavailable=latest?checked.filter(o=>o.evidenceState==='UNAVAILABLE').length:null;}
  return {serviceAreaStatus:scope.status,serviceAreaPriority:scope.areas.map(a=>a.label),discoveryByServiceArea:groups,businessesFound:count('business'),partnersFound:count('referral_partner'),individualScalersFound:count('scaler'),qualified:rows.filter(x=>x.qualified).length,awaitingApproval:rows.filter(x=>x.approvalState==='awaiting_approval').length,
    completedSourceChecks:runs.filter(r=>r.status==='completed').reduce((n,r)=>n+(r.sourceChecks||0),0),contacted:outreach?.sent||0,replied:outreach?.replied??null,meetings:outreach?.outcomeCounts?.meeting??null,signedUp:null,paid:null,externalActions:outreach?.sent||0,
    learned:outreach?.learningBasis||'Published service areas and recruitment channels support initial fit. Buying interest, candidate availability and conversion performance remain unknown.',
    ...(outreach?{outreach:{...outreach,evidenceWindow:'Up to 250 recent operations; certification traffic excluded.',attributedRevenue:null}}:{}),
    next:outreach?.followups?.length?'Review suggested follow-ups and local outcome patterns. Nothing is sent automatically.':'Review the sourced decision packages and outreach drafts. No prospect will be contacted automatically.'};
}
function createService({db,FieldValue,project,target,readSource=fetchSource,now=Date.now,areaPriorityIds=[],sourceCatalog=sources,customerContext=null}) {
  const query=async c=>(await db.collection(c).where('businessUid','==',target).limit(250).get()).docs.map(d=>({id:d.id,...d.data()}));
  const customer=customerContext?.businessUid===target&&customerContext?.authorized===true;
  const origin=customer?'https://scaledcircle.com/#/business/growth-agents':'https://scaledcircle-staging.web.app/#/growth-agents';
  async function areaScope(){if(customer)return geography.serviceAreaScope((await db.doc('discoveryPreferences/'+target).get()).data(),target);const registry=await db.doc('internalGrowthWorkspaces/'+target).get();
    if(registry.exists)return internalWorkspace.scope(registry.data(),target);
    return geography.serviceAreaScope((await db.doc('discoveryPreferences/'+target).get()).data(),target,areaPriorityIds);}
  async function check(){if(!customer&&project!=='scaledcircle-staging'&&!project?.startsWith('demo-'))fail('Staging dogfood only.');if(!target)fail('Dogfood binding required.');const h=(await db.doc('agentHealth/'+target).get()).data();if(!h||h.businessUid!==target||h.externalActionsEnabled!==false||h.killSwitchActive!==true)fail('Existing Supervisor safety state must be preserved.');if(h.researchPaused===true)fail('Research is paused by the Supervisor.');return h;}
  async function run() {
    await check();const initialScope=await areaScope();
    const initialPreferences=opportunityPreferences.normalize((await db.doc('agentCommunicationPreferences/'+target).get()).data()?.opportunities);
    const scopeVersion=(await db.doc('internalGrowthWorkspaces/'+target).get()).exists?initialScope.preferenceVersion:null;
    const started=now(),runId='growth_research_'+hash([target,day(started),VERSION,...(scopeVersion===null?[]:[scopeVersion]),...(customerContext?.researchVersion?[customerContext.researchVersion]:[])]).slice(0,40),ref=db.doc('agentRuns/'+runId);
    const claim=crypto.randomUUID();
    const duplicate=await db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.data()?.status==='completed')return true;if(old.exists&&old.data().leaseUntil>now())fail('Research is already running.');tx.set(ref,{businessUid:target,...(customer?{workspaceKind:'customer'}:{}),agentType:'growth_strategist',schemaVersion:VERSION,status:'running',claim,leaseUntil:now()+180000,createdAt:old.data()?.createdAt||started,externalMutationEnabled:false},{merge:true});return false;});
    if(duplicate){await makeReport('daily');await makeReport('weekly');return {runId,reused:true};}
    const [scope,existing]=await Promise.all([areaScope(),query('agentProspects')]);
    const discovered=customerContext?.discover?await customerContext.discover(scope,readSource,initialPreferences):{sources:[],checks:[]};
    const localLearning=await outreachEvidence(existing);
    const restrictions=await db.collection('businessMailboxes/'+target+'/suppression').where('active','==',true).limit(501).get();
    if(restrictions.size>500)fail('The contact restriction inventory needs a bounded review before more research.');
    const suppressedRecipients=new Set(restrictions.docs.map(d=>d.data().recipient));
    const selected=geography.prioritizeSources([...discovered.sources,...sourceCatalog],scope,existing.map(p=>p.sourceUrl))
      .filter(source=>opportunityPreferences.enabled(source,initialPreferences))
      .filter(source=>!suppressedRecipients.has(source.email?.toLowerCase()))
      .filter(source=>!customerContext?.researchVersion||!existing.some(p=>p.id==='growth_prospect_'+hash([target,source.key]).slice(0,40)))
      .map((source,index)=>{const area=scope.areas.findIndex(a=>a.id===geography.matchArea(source,scope)?.id);return {source,index,area:area<0?999:area};})
      .sort((a,b)=>a.area-b.area||require('./mailbox_growth_learning').priority(b.source,localLearning.patterns)-require('./mailbox_growth_learning').priority(a.source,localLearning.patterns)||a.index-b.index)
      .map(x=>x.source)
      .slice(0,12);
    const results=[];
    for(const source of selected){try{results.push({source,observation:analyzeSource(source,source.evidenceHtml||await readSource(source),now())});}catch(_){results.push({source,error:'Public source could not be verified; retry on the next research cycle.'});}}
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref),health=await tx.get(db.doc('agentHealth/'+target));if(current.data()?.claim!==claim||health.data()?.researchPaused===true||health.data()?.externalActionsEnabled!==false||health.data()?.killSwitchActive!==true)fail('Research commit held by Supervisor.');
      const currentWorkspace=await tx.get(db.doc('internalGrowthWorkspaces/'+target));
      if(scopeVersion!==null&&currentWorkspace.data()?.revision!==scopeVersion)fail('Territories changed during research. Retry using the current priority.');
      const records=[];for(const result of results){const id='growth_prospect_'+hash([target,result.source.key]).slice(0,40),p=db.doc('agentProspects/'+id);records.push({...result,id,ref:p,old:await tx.get(p)});}
      const pref=await tx.get(db.doc('agentCommunicationPreferences/'+target));
      if(hash(opportunityPreferences.normalize(pref.data()?.opportunities))!==hash(initialPreferences))fail('Growth Preferences changed during research. Retry using your current focus.');
      for(const result of records){const {source,observation:o,id,old}=result,agentType=source.kind==='business'?'lead_generation':'workforce_recruiter';
        const obsId='growth_observation_'+hash([runId,source.key]).slice(0,40);
        tx.create(db.doc('agentObservations/'+obsId),{businessUid:target,agentType,runId,schemaVersion:VERSION,sourceUrl:source.url,...(source.serviceArea?{serviceArea:source.serviceArea}:{}),...(o||{}),evidenceState:o?'AVAILABLE':'UNAVAILABLE',safeSummary:o?'Checked a public source; inspect its supported signals before acting.':result.error,createdAt:now()});
        if(!o){if(old.exists)tx.update(result.ref,{sourceAvailable:false,nextAction:result.error});continue;}
        if(old.exists){tx.update(result.ref,{lastCheckedAt:now(),sourceAvailable:o.qualified,latestSourceHash:o.sourceHash});continue;}
        const qualified=o.qualified,partner=source.kind==='referral_partner';
        const draft=customer?customerContext.draft(source,partner):partner?`Hello ${source.name} team, ScaledCircle is preparing clearly described local canvassing opportunities in Maryland. Your published services include workforce connections. Could you advise whether your channel accepts contract-work opportunities and what review requirements apply? We would follow your process before sharing any opportunity. No candidate details are requested at this stage.`:
          `Hello ${source.name} team, your website lists landscaping services in ${source.region}. ScaledCircle helps Businesses organize authorized neighborhood campaigns with route evidence and response tracking. Would a short product overview be useful for evaluating a small local campaign? We have not assumed a current marketing need or budget. If this is not relevant, we will not follow up.`;
        const prospect={businessUid:target,displayName:source.name,kind:source.kind,candidateClassification:partner?'REFERRAL PARTNER':null,geography:source.region,serviceArea:source.serviceArea,category:source.industry,source:'official_website',sourceRecordId:source.url,sourceEvidenceIds:[obsId],provenanceImmutable:true,sourceUrl:source.url,sourceHash:o.sourceHash,discoveredAt:now(),lastCheckedAt:now(),sourceAvailable:o.qualified,email:o.email,phone:o.phone,contactPath:o.contactPath,contactConfidence:o.contactConfidence,confidence:o.confidence,qualified,fit:qualified?'potential_fit':'research_needed',reason:source.reason,useCase:source.useCase,skills:null,transportation:null,availability:null,workInterests:null,doNotContact:false,lifecycleState:qualified?'drafted':'discovered',approvalState:qualified?'awaiting_approval':'research_required',lastAction:'Official source reviewed',result:qualified?'Initial fit supported; interest remains unknown':'Source requires more review',nextAction:qualified?'Founder reviews channel, exact draft and CTA':'Recheck source evidence',recommendedChannel:o.email?'email':'website',recommendedCta:customer?source.cta:partner?'Confirm recruiting-channel eligibility':'Review a short product overview',draft:qualified?draft:null,outreachAuthorized:false,externalMessageSent:false};
        if(customerContext?.researchVersion)Object.assign(prospect,{opportunityType:source.opportunityType||(partner?'recruitment_channel':'partner_channel'),explicitNeed:source.explicitNeed===true,deadline:source.deadline||null,unknowns:source.unknowns||'Current project, budget and willingness to engage are unknown.',sourceRecordId:source.sourceRecordId||source.url});
        if(source.opportunityType)prospect.opportunityType=source.opportunityType;
        tx.create(result.ref,prospect);
        if(qualified){const qualification={status:'AVAILABLE',score:70,fit:'medium_fit',reasonCodes:['OFFICIAL_SOURCE','INTEREST_UNKNOWN']};
          const crm=agentic.crmProspectProjection({businessUid:target,prospect:{...prospect,prospectId:id,prospectType:partner?'scaler':'business'},qualification,now:now()});
          tx.create(db.doc('agentCrmProspects/'+crm.id),{...crm.record,kind:source.kind,individualCandidate:!partner&&source.kind==='scaler'});
          const action=agentic.createAction({businessUid:target,agentType:partner?'lead_generation':'lead_generation',actionType:'draft_outreach',subjectId:id,inputEvidenceIds:[obsId],payload:{draft,channel:prospect.recommendedChannel,cta:prospect.recommendedCta},now:now()});
          tx.create(db.doc('agentActions/'+action.id),{...action.record,state:'awaiting_approval',displayAgent:agentType});
          tx.create(db.doc('notifications/'+id),{userId:target,type:partner?'agent_referral_partner':'agent_qualified_prospect',title:partner?'Referral partner opportunity':'New qualified prospect',message:source.name+' is ready for source and draft review. No contact has occurred.',deepLink:{destination:customer?'business_growth_agents':'growth_agents',prospectId:id},read:false,createdAt:FieldValue.serverTimestamp()});
        }
      }
      tx.update(ref,{status:'completed',...(customerContext?.researchVersion?{discoveryVersion:customerContext.researchVersion,discoveryChecks:discovered.checks}:{}),serviceAreaStatus:scope.status,serviceAreaPriority:scope.areas.map(a=>a.label),geographyPreferenceVersion:scope.preferenceVersion,sourceChecks:results.filter(r=>r.observation).length,unavailableSources:results.filter(r=>r.error).length,completedAt:now(),result:'Research and draft preparation complete; external contact held for approval.',leaseUntil:0});
      tx.set(db.doc('agentHealth/'+target),{researchEnabled:true,nextResearchAfter:customer?null:Date.parse(day(started)+'T13:00:00Z')+86400000,lastResearchRunId:runId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      if(!pref.exists)tx.create(pref.ref,{businessUid:target,...preferences(),updatedAt:FieldValue.serverTimestamp()});
    });
    await makeReport('daily');await makeReport('weekly');return {runId,reused:false,sourceChecks:results.filter(r=>r.observation).length};
  }
  async function makeReport(kind) {
    if(!['daily','weekly'].includes(kind))fail('Invalid report.');
    const [allRows,runs,scope,observations,pref]=await Promise.all([query('agentProspects'),query('agentRuns'),areaScope(),query('agentObservations'),db.doc('agentCommunicationPreferences/'+target).get()]);
    const rows=await applyRestrictions(opportunityPreferences.active(allRows,pref.data()?.opportunities));
    const outreach=await outreachEvidence(rows);
    const period=kind==='daily'?day(now()):day(now()-((new Date(now()).getUTCDay()+6)%7)*86400000);
    const registered=(await db.doc('internalGrowthWorkspaces/'+target).get()).exists;
    const id='growth_report_'+hash([target,kind,period,...(registered?[scope.preferenceVersion]:[])]).slice(0,40),summary={...report(rows,runs.filter(r=>r.schemaVersion===VERSION),scope,observations,sourceCatalog,outreach),...(customerContext?.researchVersion?{opportunityGroups:require('./growth_opportunities').summarize(rows.map(p=>require('./growth_opportunities').project(p,now())))}:{}),newApprovalsToday:rows.filter(r=>r.qualified&&day(r.discoveredAt)===day(now())).length};
    await db.runTransaction(async tx=>{const ref=db.doc('agentReports/'+id),old=await tx.get(ref);if(old.exists)return;tx.create(ref,{businessUid:target,...(customer?{workspaceKind:'customer',businessName:customerContext.name,deepLink:origin}:{}),kind,period,summary,scope:'Research inventory at creation plus bounded confirmed correspondence and owner-recorded outcomes. Revenue and product activation require linked authority.',createdAt:now(),emailStatus:'preference_controlled'});tx.create(db.doc('notifications/'+id),{userId:target,type:kind==='daily'?'agent_daily_brief':'agent_weekly_report',title:kind==='daily'?'Daily brief ready':'Weekly report ready',message:`${summary.businessesFound} Business prospects, ${summary.partnersFound} partner prospects. ${summary.awaitingApproval} drafts awaiting review.`,deepLink:{destination:customer?'business_growth_agents':'growth_agents',reportId:id},read:false,createdAt:FieldValue.serverTimestamp()});});return id;
  }
  async function applyRestrictions(rows) {
    const restrictions=await db.collection('businessMailboxes/'+target+'/suppression').where('active','==',true).limit(501).get();
    if(restrictions.size>500)fail('The contact restriction inventory needs a bounded review.');
    const suppressed=new Set(restrictions.docs.map(d=>d.data().recipient));
    return rows.map(p=>({...p,doNotContact:p.doNotContact===true||suppressed.has(p.email?.toLowerCase())}));
  }
  async function outreachEvidence(rows) {
    const [ops,events]=await Promise.all([db.collection('businessMailboxes/'+target+'/operations').orderBy('requestedAt','desc').limit(250).get(),db.collection('businessMailboxes/'+target+'/outcomes').orderBy('recordedAt','desc').limit(250).get()]);
    return require('./mailbox_growth_learning').project({businessId:target,operations:ops.docs.map(d=>({id:d.id,...d.data()})),
      outcomes:events.docs.map(d=>d.data()),prospects:rows,now:now(),funnel:customer?'services':'business'});
  }
  async function load() {
    const [allRows,runs,reports,health,pref,scope]=await Promise.all([query('agentProspects'),query('agentRuns'),query('agentReports'),db.doc('agentHealth/'+target).get(),db.doc('agentCommunicationPreferences/'+target).get(),areaScope()]);
    const focus=opportunityPreferences.normalize(pref.data()?.opportunities),rows=await applyRestrictions(opportunityPreferences.active(allRows,focus));
    const outreach=await outreachEvidence(rows);
    const excluded=allRows.filter(p=>!opportunityPreferences.enabled(p,focus));
    const alerts=(await db.collection('notifications').where('userId','==',target).limit(250).get()).docs
      .filter(d=>['agent_qualified_prospect','agent_referral_partner','agent_daily_brief','agent_weekly_report'].includes(d.data().type))
      .filter(d=>!excluded.some(p=>p.id===d.id))
      .map(d=>({id:d.id,title:d.data().title,message:d.data().message,createdAt:d.data().createdAt?.toMillis?.()||null}))
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const history=runs.filter(r=>r.schemaVersion===VERSION).sort((a,b)=>b.createdAt-a.createdAt),summary=report(rows,history,scope,await query('agentObservations'),sourceCatalog,outreach);
    return {title:customer?customerContext.name+' Growth Agents':'ScaledCircle Growth Agents',workspaceKind:customer?'customer':'internal',notifications:alerts,workspace:{registered:(await db.doc('internalGrowthWorkspaces/'+target).get()).exists,scope},schemaVersion:VERSION,prospects:rows.sort((a,b)=>Number(b.qualified)-Number(a.qualified)||a.displayName.localeCompare(b.displayName)),reports:reports.sort((a,b)=>b.createdAt-a.createdAt),runs:history,summary,outreach,preferences:{...(pref.data()||preferences()),opportunities:focus},excludedProspects:excluded.map(p=>opportunityPreferences.project(p,focus)),externalActionsEnabled:false,killSwitchActive:health.data()?.killSwitchActive!==false,researchPaused:health.data()?.researchPaused===true,nextResearchAfter:customer?null:health.data()?.nextResearchAfter||null,
      agents:AGENTS.map(([type,name])=>({type,name,status:['lead_generation','workforce_recruiter','growth_strategist'].includes(type)?history.length?'Waiting for review':'Ready for research':'Needs approved input',lastAction:['lead_generation','workforce_recruiter','growth_strategist'].includes(type)&&history.length?'Official-source research and report generation':'No new run performed in this research cycle',result:type==='lead_generation'?`${summary.businessesFound} sourced Business prospects`:type==='workforce_recruiter'?`${summary.partnersFound} organization partner prospects; ${summary.individualScalersFound} individual Scalers`:type==='growth_strategist'?`${summary.awaitingApproval} drafts awaiting review`:'Existing specialist authority preserved; no send or spend',nextAction:type==='marketing_manager'?'Review existing Social evidence without changing schedules':type==='ad_manager'?'Prepare a budget-free proposal when campaign input is approved':type==='business_assistant'?'Wait for an authorized Business inquiry': 'Review evidence and proposed next actions',needsApproval:true})),network:networkPattern([])};
  }
  async function savePreferences(input={}){return db.runTransaction(async tx=>{const ref=db.doc('agentCommunicationPreferences/'+target),old=(await tx.get(ref)).data();preferences(input);const p=preferences({mode:old?.mode||'important',...input,opportunities:{...opportunityPreferences.normalize(old?.opportunities),...(input.opportunities||{})}});tx.set(ref,{businessUid:target,...p,updatedAt:FieldValue.serverTimestamp()});return p;});}
  async function review({prospectId,decision},actorUid=target) {
    if(!/^growth_prospect_[a-f0-9]{40}$/.test(prospectId)||!['ready_for_founder_send','do_not_contact'].includes(decision))fail('Choose a supported review decision.');
    return db.runTransaction(async tx=>{
      const ref=db.doc('agentProspects/'+prospectId),p=(await tx.get(ref)).data();
      if(!p||p.businessUid!==target)fail('Prospect is not in this workspace.');
      const pref=(await tx.get(db.doc('agentCommunicationPreferences/'+target))).data();
      const recipient=typeof p.email==='string'?p.email.trim().toLowerCase():null;
      const restrictionRef=recipient?db.doc('businessMailboxes/'+target+'/suppression/'+hash(recipient)):null;
      const restriction=restrictionRef?(await tx.get(restrictionRef)).data():null;
      if(decision!=='do_not_contact') {
        if(!opportunityPreferences.enabled(p,pref?.opportunities))fail('This opportunity is excluded by your Growth Preferences.');
        if(p.doNotContact||restriction?.active||!p.qualified||!p.draft||p.sourceAvailable!==true||now()-p.lastCheckedAt>7*86400000)fail('Source review is incomplete or contact is restricted.');
      }
      if(p.approvalState===decision&&p.doNotContact===(decision==='do_not_contact'))return {duplicate:true};
      const revision=(p.contactDecisionRevision||0)+1,audit=db.doc('agentApprovals/'+hash([target,prospectId,decision,revision]));
      tx.create(audit,{businessUid:target,prospectId,actorUid,decision,draftHash:hash(p.draft||''),executionAuthorized:false,createdAt:FieldValue.serverTimestamp()});
      if(decision==='do_not_contact'&&restrictionRef)tx.set(restrictionRef,{businessId:target,recipient,active:true,reason:'do_not_contact',actorUid,updatedAt:now()});
      tx.update(ref,{approvalState:decision,doNotContact:decision==='do_not_contact',contactDecisionRevision:revision,outreachAuthorized:false,
        nextAction:decision==='do_not_contact'?'No contact permitted':'Reviewed; no message sent'});
      return {saved:true,externalMessageSent:false};
    });
  }
  return {run,load,savePreferences,review,makeReport};
}
module.exports={VERSION,AGENTS,assertScope,preferences,analyzeSource,fetchSource,networkPattern,recommendationEvidence,report,createService};
