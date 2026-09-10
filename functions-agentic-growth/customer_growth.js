'use strict';
const growth=require('./growth_operations');
const agentic=require('./agentic_growth');
const sources=require('./customer_growth_sources');
const workspace=require('./shared/business_workspace');
const legal=require('./shared/legal_consent');
const entitlements=require('./shared/subscription_entitlements');
const VERSION='CustomerGrowthWorkspaceV1';
const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
const clean=(s,max=500)=>typeof s==='string'?s.trim().slice(0,max):'';

function createService({db,auth,FieldValue,Timestamp,project,allowedBusinesses='',readSource,now=Date.now}) {
  const ws=workspace.createWorkspaceService({db,auth,FieldValue,Timestamp,now});
  const consent=legal.createLegalConsentService({db,FieldValue});
  async function authority(request) {
    const uid=request.auth?.uid;
    if(!uid)fail('unauthenticated','Sign in to your Business.');
    await ws.actor(uid);
    const businessId=request.data?.businessId||uid;
    if(!allowedBusinesses.split(',').map(s=>s.trim()).includes(businessId))fail('permission-denied','Growth Agents are available by private invitation.');
    const a=await ws.authority({uid,businessId,permission:'intelligence'});
    if(!entitlements.hasActiveManagedGrowthEntitlement(a.entitlement,{nowMillis:now()}))fail('permission-denied','An active Managed Growth workspace is required.');
    await consent.requireCurrent({uid,agreementTypes:['terms','privacy']});
    return a;
  }
  async function context(a) {
    const profile=(await db.doc('businessGrowthProfiles/'+a.businessId).get()).data()||{};
    if(profile.businessUid!==a.businessId||!clean(profile.businessName)||!(profile.servicesOffered||[]).length)
      fail('failed-precondition','Complete your Business Growth profile first.');
    const services=(profile.priorityServices?.length?profile.priorityServices:profile.servicesOffered).map(x=>clean(x,120)).filter(Boolean).slice(0,6);
    return {businessUid:a.businessId,authorized:true,name:clean(profile.businessName,160),profile,
      draft:(source,partner)=>partner?
        `Hello ${source.name} team, ${clean(profile.businessName,160)} lists ${services.join(', ')} among its services. We are reviewing legitimate recruitment channels for construction and marketing work. Could you share your employer requirements and appropriate next steps? We have not assumed candidate availability or eligibility, and will follow your review process before sharing any opening.`:
        `Hello ${source.name} team, ${clean(profile.businessName,160)} provides ${services.join(', ')}. We found your public contractor information and would like to understand whether these services fit your program. ${source.cta}. We have not assumed a current project, qualification or award. Please direct us to the appropriate published application process.`};
  }
  function research(a,c) {return growth.createService({db,FieldValue,project,target:a.businessId,customerContext:c,
    sourceCatalog:sources.select(c.profile),readSource,now});}
  async function initialize(a,c) {
    if(!a.isOwner)fail('permission-denied','The Business owner must activate this workspace.');
    return db.runTransaction(async tx=>{
      const healthRef=db.doc('agentHealth/'+a.businessId),health=await tx.get(healthRef);
      const refs=growth.AGENTS.map(([type])=>db.doc(`agentProfiles/${a.businessId}_${type}`));
      const existing=await Promise.all(refs.map(r=>tx.get(r)));
      if(health.exists&&health.data().workspaceKind!=='customer')fail('failed-precondition','Existing agent authority requires review.');
      if(health.exists)return {initialized:true,reused:true};
      const prefRef=db.doc('agentCommunicationPreferences/'+a.businessId),prefs=await tx.get(prefRef);
      for(let i=0;i<refs.length;i++)if(!existing[i].exists)tx.create(refs[i],{
        schemaVersion:agentic.SCHEMA_VERSION,businessUid:a.businessId,agentType:growth.AGENTS[i][0],name:growth.AGENTS[i][1],
        enabled:true,autonomyMode:'approval_required',workspaceKind:'customer',externalActionsEnabled:false,
        createdBy:a.actorUid,createdAt:FieldValue.serverTimestamp()});
      tx.create(healthRef,{schemaVersion:VERSION,workspaceKind:'customer',businessUid:a.businessId,
        businessName:c.name,externalActionsEnabled:false,killSwitchActive:true,researchPaused:false,
        createdBy:a.actorUid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      if(!prefs.exists)tx.create(prefRef,{businessUid:a.businessId,...growth.preferences(),updatedAt:FieldValue.serverTimestamp()});
      tx.create(db.doc('agentApprovals/customer_setup_'+a.businessId),{businessUid:a.businessId,actorUid:a.actorUid,
        action:'research_and_drafts_enabled',executionAuthorized:false,createdAt:FieldValue.serverTimestamp()});
      return {initialized:true,reused:false};
    });
  }
  async function load(a,c) {
    const result=await research(a,c).load();
    const health=(await db.doc('agentHealth/'+a.businessId).get()).data();
    const [plans,snapshots,connections]=await Promise.all([
      db.collection('socialContentPlans').where('businessUid','==',a.businessId).limit(30).get(),
      db.collection('socialPerformanceSnapshots').where('businessUid','==',a.businessId).limit(30).get(),
      db.collection('socialConnections').doc(a.businessId).collection('providers').get()]);
    result.initialized=health?.workspaceKind==='customer';
    result.businessContext={businessName:c.name,services:c.profile.priorityServices||c.profile.servicesOffered,
      website:c.profile.website||null,adBudget:c.profile.plannedAdBudget||'Not provided',
      profileAreas:c.profile.serviceAreas||[],maintainedAreas:result.workspace.scope.areas.map(x=>x.label)};
    result.social={planCount:plans.size,plans:plans.docs.map(d=>({id:d.id,...d.data()})),
      baselines:snapshots.docs.filter(d=>d.data().schemaVersion==='MetaBaselineV1').map(d=>({id:d.id,...d.data()})),
      connections:connections.docs.map(d=>({provider:d.id,status:d.data().status,name:d.data().accountDisplayName})),
      attribution:'Existing provider history is not evidence of ScaledCircle publication.',approvalMode:'approval_required'};
    for(const a of result.agents){
      if(a.type==='marketing_manager'){a.status=plans.size?'Plan awaiting review':'Prepare a content plan';a.result=`${plans.size} saved plans; ${result.social.baselines.length} provider baseline snapshots.`;a.nextAction='Review the strategy and each proposed post before approval.';}
      if(a.type==='business_assistant'){a.status='Private Beta · Recommendations only';a.result='No customer messages sent. Confirm current offer, project examples and brand assets before drafting replies.';a.nextAction='Review the saved profile and any outdated free-text service areas.';}
      if(a.type==='ad_manager'){a.status='Approval required · No spend';a.result=`Saved budget preference: ${c.profile.plannedAdBudget||'Not provided'}. No advertising changes made.`;a.nextAction='Review organic results first; approve a separate budget before advertising.';}
    }
    result.measurement={prospects:['Found','Qualified','Contacted','Appointment','Estimate','Won','Attributed Revenue'],
      workforce:['Found','Qualified','Contacted','Available','Used / Hired'],
      social:['Baseline','Published','Reach / engagement','Attributed traffic / leads'],
      contacted:0,appointments:null,estimates:null,won:null,attributedRevenue:null,individualHires:null,
      note:'No contact or conversion event has been recorded by this workspace cycle. A lead is not revenue.'};
    return result;
  }
  async function execute(request) {
    const a=await authority(request),c=await context(a),data=request.data||{};
    if(Object.keys(data).some(k=>!['businessId','operation','input'].includes(k)))fail('invalid-argument','Unsupported request.');
    const op=data.operation||'load';
    if(op==='load')return load(a,c);
    if(op==='initialize')return initialize(a,c);
    const health=(await db.doc('agentHealth/'+a.businessId).get()).data();
    if(health?.workspaceKind!=='customer')fail('failed-precondition','Activate your Growth workspace first.');
    if(op==='research'){if(data.input&&Object.keys(data.input).length)fail('invalid-argument','Research uses your saved Business context.');return research(a,c).run();}
    if(op==='preferences'){if(!a.isOwner)fail('permission-denied','The owner manages report email preferences.');return research(a,c).savePreferences(data.input||{});}
    if(op==='review')return research(a,c).review(data.input||{},a.actorUid);
    fail('invalid-argument','Choose a supported action.');
  }
  return {execute,authority};
}
module.exports={VERSION,createService};
