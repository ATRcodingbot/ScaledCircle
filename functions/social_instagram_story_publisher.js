"use strict";
const {isDeepStrictEqual: equal}=require('node:util');
const crypto=require('node:crypto');
const model=require('./social_story_model');
const transport=require('./social_instagram_story_transport');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const fingerprint=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');

// Only an explicitly pinned Story plan can be discovered. There is no feed
// fallback, client-selected job, or callable that starts provider execution.
function createPublisher({db,config,credentials,fetchImpl=fetch,now=Date.now}) {
  const read=async p=>(await db.doc(p).get()).data();
  async function context() {
    const plan=await read(`socialStoryPlans/${config.planId}`);
    if(!plan||plan.digest!==config.digest||plan.owner!==config.owner||plan.provider!=='instagram'||plan.accountId!==config.accountId)throw Error('story_plan_denied');
    const expected=model.draftJobs({...plan, executionEnabled: false});
    const approval=await read(`socialStoryApprovals/${config.approvalId}`);
    if(!approval||fingerprint(approval)!==config.approvalFingerprint||approval.id!==config.approvalId||approval.linkedPageId!==config.pageId||
      approval.planId!==plan.id||approval.planDigest!==plan.digest||approval.validFrom!==plan.startsAt||approval.validUntil!==plan.endsAt||
      !equal(approval.items,plan.items)||!equal(approval.jobIds,expected.map(j=>j.id))||
      !equal(approval.maximumEffects,{containers:3,mediaPublishCalls:3,publishedStories:3,totalCreateRequests:6})||approval.revokedAt!==null)throw Error('story_approval_denied');
    const connection=await read(`socialConnections/${plan.owner}/providers/instagram`);
    if(connection?.providerUserId!==config.accountId||connection.linkedPageId!==config.pageId||connection.handle!==config.handle)throw Error('story_identity_denied');
    const account={id:config.accountId,linkedPageId:config.pageId,owner:plan.owner,type:'BUSINESS',login:'facebook',scopes:connection.grantedScopes};
    const authority=transport.createAuthority({db,plan,account});
    async function authorize(tx,job,action) {
      await authority(tx,job,action);
      const get=async p=>(await(tx?tx.get(db.doc(p)):db.doc(p).get())).data();
      const currentApproval=await get(`socialStoryApprovals/${config.approvalId}`);
      const version=await get(`socialStoryVersions/${job.versionId}`);
      if(job.approvalId!==config.approvalId||fingerprint(currentApproval)!==config.approvalFingerprint||!equal(version,plan.items.find(i=>i.versionId===job.versionId)))throw Error('story_binding_denied');
      if(['claim','create'].includes(action)) {
        const currentPlan=await get(`socialStoryPlans/${plan.id}`);
        if(!config.enabled||currentPlan.executionEnabled!==true||job.publishingEnabled!==true||job.status!=='approved'||
          now()<Date.parse(plan.startsAt)||now()>=Date.parse(plan.endsAt)||now()<Date.parse(job.scheduledFor)||now()>Date.parse(job.scheduledFor)+900000)throw Error('story_execution_closed');
      }
    }
    return {plan,expected,account,connection,authorize};
  }
  async function inspect() {
    const c=await context(),health=await read(`agentHealth/${config.owner}`),allowance=await read(model.paths(config.owner,'instagram').authority);
    const jobs=[];
    for(const e of c.expected){const job=await read(`socialStoryJobs/${e.id}`);await c.authorize(null,job,'inspect');
      const steps=await Promise.all(['container','publish'].map(k=>read(`socialStoryJobs/${e.id}/steps/${k}`)));
      jobs.push({jobId:e.id,scheduledFor:e.scheduledFor,future:now()<Date.parse(e.scheduledFor),publishingEnabled:job.publishingEnabled,steps:steps.filter(Boolean).length,containers:steps[0]?.providerId?1:0,publications:steps[1]?.providerId?1:0,receipts:steps[1]?.receipt?1:0});}
    return {planId:c.plan.id,approvalId:config.approvalId,planExecutionEnabled:c.plan.executionEnabled,deploymentCreateEnabled:config.enabled,channelPaused:allowance?.killSwitchActive!==false,publishingEnabled:allowance?.publishingEnabled===true,globalKillSwitchActive:health?.killSwitchActive!==false,jobs};
  }
  async function tick() {
    const c=await context(),results=[];
    for(const e of c.expected){
      if(now()<Date.parse(e.scheduledFor)){results.push({jobId:e.id,state:'FUTURE'});continue;}
      const job=await read(`socialStoryJobs/${e.id}`),revision=await read(`socialStoryMediaRevisions/${e.mediaRevisionId}`);
      const store=transport.createStore({db,authorize:c.authorize});
      const old=await store.get(job,'publish');
      // After the bounded create window only a known final ID may reconcile.
      const reconcileOnly=now()>Date.parse(e.scheduledFor)+900000||!config.enabled||c.plan.executionEnabled!==true;
      if(reconcileOnly&&!old?.providerId){results.push({jobId:e.id,state:'HELD'});continue;}
      try{const runner=transport.createTransport({job,revision,account:c.account,store,authorize:(j,a)=>c.authorize(null,j,a),credentials:()=>credentials(c.connection),fetchImpl,deploymentEnabled:config.enabled,now});
        const result=await runner.run({reconcileOnly});results.push({jobId:e.id,state:result.state});
      }catch{results.push({jobId:e.id,state:'HOLD_RECONCILE_BEFORE_RETRY'});}
    }
    return results;
  }
  return {inspect,tick};
}
module.exports={createPublisher,fingerprint};
