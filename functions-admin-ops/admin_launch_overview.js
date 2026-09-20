"use strict";

// Read-only projections for the existing Admin overview. Never copy credentials,
// message content, bank details or arbitrary provider responses into this view.
const LIMIT = 101;
const number = v => Number.isFinite(v) ? v : null;
const time = v => typeof v?.toMillis === 'function' ? v.toMillis() : number(v);
const label = v => typeof v === 'string' ? v.slice(0, 120) : null;
const rows = s => s.docs.map(d => ({...d.data(), docId:d.id}));
function count(items, predicate) { return items === null ? null : items.filter(predicate).length; }
function research(schedule, run, now) {
  if (!schedule) return {status:'unavailable',lastRunAt:null,nextRunAt:null};
  const lease=time(schedule.leaseUntil);
  return {status:schedule.enabled===false?'paused':lease>0&&lease<now?'stale_lease':
    schedule.lastStatus==='completed'?'completed':label(schedule.lastStatus)||'not_run',
    lastRunAt:time(schedule.lastCompletedAt),nextRunAt:time(schedule.nextRunAt),
    newOpportunities:number(run?.newProspectCount),duplicatesSuppressed:number(run?.duplicatesExcludedCount),
    sourceChecks:number(run?.sourceChecks),unavailableSources:number(run?.unavailableSources),
    runId:label(schedule.lastRunId)};
}
async function load({db,now=Date.now(),paidWorkEnabled=null,project=null}) {
  const unavailable=[];
  async function read(name, query=db.collection(name)) {
    try {const s=await query.limit(LIMIT).get();if(s.docs.length>=LIMIT){unavailable.push(name);return null;}return rows(s);}
    catch {unavailable.push(name);return null;}
  }
  async function doc(path) {try {const s=await db.doc(path).get();return s.exists?s.data():null;}catch {unavailable.push(path.split('/')[0]);return null;}}
  const [subscriptions,schedules,policies,cycles,jobs,mailboxes,workspaces,notifications,operations]=await Promise.all([
    'businessSubscriptions','customerResearchSchedules','socialManagedPolicies','socialManagedCycles',
    'socialGrowthJobs','businessMailboxes','businessWorkspaces','mobilePushReceipts','financialOperations',
  ].map(n=>read(n)));
  const teamInventories=workspaces===null?null:await Promise.all(workspaces.map(async w=>{
    if(!/^[A-Za-z0-9_-]{1,160}$/.test(w.docId))return null;
    const members=await read('businessWorkspaces/'+w.docId+'/members');
    const entitlement=subscriptions?.find(v=>v.docId===w.docId);
    if(!members||subscriptions===null)return null;
    const capacity=require('./business_workspace').seats(entitlement||{},now);
    const active=members.filter(m=>m.status==='active'&&m.uid!==w.docId);
    return {businessId:w.docId,seatsUsed:1+active.length,capacity,
      needsReview:active.some(m=>m.businessId!==w.docId||!Number.isInteger(m.seatIndex)||m.seatIndex<1||m.seatIndex>=capacity)||active.length+1>capacity};
  }));
  const ids=[...new Set([...(schedules||[]),...(policies||[]),...(cycles||[])].map(x=>x.businessUid||x.docId))];
  if(ids.length>20)unavailable.push("workspace_inventory_truncated");
  const businesses=await Promise.all(ids.slice(0,20).map(async uid=>{
    if(!/^[A-Za-z0-9_-]{1,160}$/.test(uid))return null;
    const [profile,user]=await Promise.all([doc('businessGrowthProfiles/'+uid),doc('users/'+uid)]);
    const schedule=schedules?.find(s=>s.docId===uid&&s.businessUid===uid);
    const run=schedule?.lastRunId&&/^[A-Za-z0-9_-]{1,160}$/.test(schedule.lastRunId)?await doc('agentRuns/'+schedule.lastRunId):null;
    const policy=policies?.find(p=>p.docId===uid&&p.businessUid===uid);
    const cycle=cycles?.find(c=>c.docId===uid&&c.businessUid===uid);
    const own=jobs===null?null:jobs.filter(j=>j.businessUid===uid);
    let managedScheduled=null;
    if(own&&policy){
      const pending=own.filter(j=>j.status==='scheduled');
      const approvalIds=[...new Set(pending.map(j=>j.approvalId))];
      if(approvalIds.length<=20){
        const approved=await Promise.all(approvalIds.map(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(id)?doc('socialGrowthApprovals/'+id):null));
        if(approved.every(Boolean))managedScheduled=pending.filter(j=>{const a=approved[approvalIds.indexOf(j.approvalId)];return a?.businessUid===uid&&a.managedPolicyId===policy.id&&a.authorizationSource==='approved_strategy';}).length;
      }
    }
    const connections=await Promise.all(['facebook','instagram'].map(async provider=>{
      const c=await doc('socialConnections/'+uid+'/providers/'+provider);
      return {provider,status:c?label(c.status):'unavailable',health:c?label(c.tokenHealth):null};
    }));
    return {businessId:uid,name:label(profile?.businessName||user?.companyName||user?.businessName)||'Business workspace',
      research:research(schedule,run?.businessUid===uid?run:null,now),
      social:{authorization:policy?label(policy.status):'not_authorized',lastRunAt:time(cycle?.finishedAt),
        workerStatus:cycle?.leaseUntil>0&&cycle.leaseUntil<now?'stale_lease':label(cycle?.status)||'unavailable',
        nextWorkerRun:null,connections,
        scheduled:count(own,j=>j.status==='scheduled'),publishing:count(own,j=>['publishing','processing'].includes(j.status)),
        published:count(own,j=>j.status==='published'),needsAttention:Array.isArray(cycle?.results)?cycle.results.filter(r=>r.status==='needs_attention').length:null,
        failedPublishingJobs:count(own,j=>['failed','blocked','needs_attention'].includes(j.status)),
        managedScheduled}};
  }));
  return {generatedAt:now,unavailableSources:[...new Set(unavailable)],boundedInventoryLimit:LIMIT-1,
    paidWork:paidWorkEnabled===null?'unavailable':paidWorkEnabled?'enabled':'held',
    payoutCertification:project==='scaled-circle'?{onboarding:'founder_certified',readiness:'founder_certified',cashoutAndBankReceipt:'pending',
      evidenceKind:'Founder observation, September 19, 2026; not a provider readiness override'}:null,
    businesses:businesses.filter(Boolean),
    billing:{teamIssues:teamInventories?.every(Boolean)?teamInventories.filter(t=>t.needsReview).length:null,comped:count(subscriptions,s=>s.comped===true),plans:subscriptions?.map(s=>({businessId:s.docId,plan:label(s.planId||s.plan),status:label(s.status),comped:s.comped===true}))??null,active:count(subscriptions,s=>['active','trialing'].includes(s.status)),
      paymentIssues:count(subscriptions,s=>['past_due','unpaid','incomplete','incomplete_expired'].includes(s.status)),
      cancellationScheduled:count(subscriptions,s=>s.cancelAtPeriodEnd===true||s.cancel_at_period_end===true),
      workspaceCount:workspaces?.length??null,
      reconciliationIssues:count(operations,o=>['failed','attention','review_required'].includes(o.state||o.status)),
      moneySummary:'Customer payments, worker reserves and ScaledCircle revenue are separate. See each authoritative payment timeline; no gross-payment revenue total is inferred.'},
    email:{mailboxes:mailboxes?.map(m=>({businessId:m.docId,status:label(m.status),health:label(m.health)}))??null,
      branding:project==='scaled-circle'?'verified_checkpoint':'unavailable',gmailReview:project==='scaled-circle'?'submitted_under_review':'unavailable',newCustomerOnboarding:'verify_configuration',demoVideo:project==='scaled-circle'?'recorded_submitted':'unavailable',
      evidenceKind:'September 20, 2026 Google verification checkpoint; data access under review, CASA not complete; not a live provider probe'},
    notificationFailures:count(notifications,n=>['provider_configuration','uncertain'].includes(n.status)||(n.status==='retryable'&&n.attempts>=3)),
    release:project==='scaled-circle'?require('./admin_launch_candidate_evidence'):null};
}
module.exports={load,research,count};
