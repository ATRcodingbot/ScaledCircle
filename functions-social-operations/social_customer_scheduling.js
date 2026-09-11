'use strict';
const growth = require("./social_growth_cycle");
const meta = require("./social_meta_candidate");
const {approved} = require("./social_plan_state");
const SCHEMA = 'CustomerPostApprovalV1';
const messages = {
  plan: 'Approve the current 30-Day Plan first.',
  creative: 'Finish or approve the image before scheduling.',
  permission: 'Reconnect this account to enable publishing.',
  time: 'Choose a future publish time and review the updated post.',
  content: 'Review the complete copy, call to action and destination.',
  quality: 'Resolve the content quality review before scheduling.',
  scheduler: 'Scheduling is not available for this workspace yet.',
  existing: 'Review the existing scheduled version before scheduling a replacement.',
  paused: 'Publishing is paused. Review your publishing settings first.',
};
function readiness({uid, plan, item, version, provider, connection, revision, quality,
  schedulerEnabled = false, health, config, environment, entitlement, conflictingSchedule = false, now = Date.now()}) {
  const reasons = [];
  const add = key => reasons.push({code:key, message:messages[key]});
  if (!plan || plan.businessUid !== uid || !item || item.businessUid !== uid ||
      !version || version.businessUid !== uid || item.planId !== version.planId ||
      item.currentVersion !== version.version || !['facebook','instagram'].includes(provider)) {
    return {ready:false, reasons:[{code:'content',message:messages.content}]};
  }
  if (!approved(plan)) add('plan');
  const variant = version.variants?.find(v => v.provider === provider);
  if (!variant?.copy?.trim() || (variant.callToAction && !variant.destinationUrl)) add('content');
  if (variant?.destinationUrl) {
    try { const u = new URL(variant.destinationUrl); if(u.protocol!=='https:'||u.username||u.password) add('content'); }
    catch { add('content'); }
  }
  const time = version.scheduledFor?.toMillis ? version.scheduledFor.toMillis() : Date.parse(version.scheduledFor);
  // No implicit Publish Now. The reviewed time must allow a deliberate future schedule.
  if (!Number.isFinite(time) || time < now + 5*60000) add('time');
  const mediaRequired = provider==='instagram' || variant?.mediaRequirement !== 'none';
  if (mediaRequired && (!variant?.mediaAssetId || !variant?.mediaRevisionId || !revision)) add('creative');
  if (!connection || connection.businessUid!==uid || connection.status!=='connected_write' ||
      connection.environment!==environment || connection.tokenHealth!=='healthy' || connection.requiresReconnect===true || !connection.credentialId ||
      !/^\d+$/.test(connection.providerUserId||'') ||
      !Number.isSafeInteger(connection.connectionRevision) || !Number.isSafeInteger(connection.credentialRotationGeneration) ||
      connection.capabilities?.[mediaRequired?'publishImage':'publishText']!==true) add('permission');
  if(!hasPublishingScopes(connection,provider) && !reasons.some(r=>r.code==='permission'))add('permission');
  if (quality?.businessUid!==uid || quality.immutableSourceHash!==version.contentHash || quality.readyToPublish!==true) add('quality');
  if (!schedulerEnabled || config?.enabled!==true || config.writeScopesEnabled!==true || config.provider!=='meta' || config.environment!==environment ||
      !require("./subscription_entitlements").hasActiveScaleEntitlement(entitlement,{nowMillis:now})) add('scheduler');
  if (health?.killSwitchActive===true) add('paused');
  if (conflictingSchedule) add('existing');
  if (!reasons.some(r=>['creative','permission','content'].includes(r.code))) {
    try { meta.describe({job:{id:'readiness',businessUid:uid,provider,binding:{variants:version.variants}},revision,
      account:{businessUid:uid,providerUserId:connection.providerUserId,linkedPageId:connection.linkedPageId}}); }
    catch { add(mediaRequired?'creative':'content'); }
  }
  return {ready:reasons.length===0,reasons,scheduledFor:Number.isFinite(time)?new Date(time).toISOString():null,
    contentHash:version.contentHash,version:version.version,provider};
}
// Customer capability grants may include normal optional permissions such as
// public_profile. Only the scopes needed for this platform action are required.
function hasPublishingScopes(connection,provider) {
  const required=provider==='facebook'?['pages_read_engagement','pages_manage_posts']:
    provider==='instagram'?['pages_read_engagement','instagram_basic','instagram_content_publish']:null;
  return !!required && Array.isArray(connection?.grantedScopes) && required.every(scope=>connection.grantedScopes.includes(scope));
}
// Call only after reading the exact server-selected tenant/provider document.
function connectionFromOwnedPath(record, uid) {
  if (!record) return record;
  if (record.businessUid != null && record.businessUid !== uid) throw Error('meta_connection_tenant_mismatch');
  return {...record,businessUid:uid};
}
function reviewDigest(ctx,bindingHash) {
  const c=ctx.connection||{};
  return growth.hash({uid:ctx.uid,provider:ctx.provider,bindingHash,planVersion:ctx.plan?.planVersion,
    account:[c.providerUserId,c.linkedPageId,c.credentialId,c.connectionRevision,c.credentialRotationGeneration].map(v=>v??null)});
}
function createStore({db, now=Date.now, enabledUids=[], environment}) {
  const enabled = uid => enabledUids.includes(uid);
  async function context(tx, uid, input) {
    if(!/^[a-zA-Z0-9_-]{1,220}$/.test(input?.itemId||'') || !['facebook','instagram'].includes(input?.provider)) throw Error('Choose a current post.');
    const read = ref => tx ? tx.get(ref) : ref.get();
    const itemRef=db.doc('socialContentItems/'+input.itemId),item=(await read(itemRef)).data();
    if(!item || item.businessUid!==uid) throw Error('This post is not available in your Business.');
    const versionId=input.itemId+'_v'+item.currentVersion;
    const [p,v,c,q,h,config,entitlement] = await Promise.all([
      read(db.doc('socialContentPlans/'+item.planId)),read(db.doc('socialContentVersions/'+versionId)),
      read(db.doc(`socialConnections/${uid}/providers/${input.provider}`)),
      read(db.doc('socialContentQualityAssessments/'+versionId)),read(db.doc('agentHealth/'+uid)),
      read(db.doc('socialProviderConfigs/'+environment+'_meta')),read(db.doc('businessSubscriptions/'+uid))]);
    const jobs=await read(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101));
    if(jobs.size>100)throw Error('Publication history requires review.');
    const conflictingSchedule=jobs.docs.some(doc=>{const job=doc.data();return job.provider===input.provider &&
      job.versionId?.startsWith(input.itemId+'_v') && job.versionId!==versionId && !['published','canceled'].includes(job.status);});
    const version=v.data(),variant=version?.variants?.find(v=>v.provider===input.provider);
    const revision=variant?.mediaRevisionId?(await read(db.doc(`socialMediaLibraries/${uid}/items/${variant.mediaRevisionId}`))).data():null;
    return {uid,plan:p.data(),item,version,versionId,itemRef,provider:input.provider,connection:connectionFromOwnedPath(c.data(),uid),quality:q.data(),
      conflictingSchedule,health:h.data(),config:config.data(),entitlement:entitlement.data(),environment,revision,schedulerEnabled:enabled(uid),now:now()};
  }
  return {
    async preview(uid,input) {
      const ctx=await context(null,uid,input), result=readiness(ctx);
      const bindingHash=ctx.version?growth.contentBinding({id:ctx.versionId,record:ctx.version},uid).bindingHash:null;
      return {...result,bindingHash,reviewDigest:reviewDigest(ctx,bindingHash),reviewedPost:ctx.version ? {accountName:ctx.connection?.accountDisplayName||ctx.connection?.handle||'Connected Business account',variant:ctx.version.variants?.find(v=>v.provider===input.provider),goal:ctx.version.goal||'',images:ctx.revision?.images?.map(i=>({url:i.url,sha256:i.sha256}))||[],scheduledFor:result.scheduledFor}:null};
    },
    async approve(uid,input) {
      if(!/^[a-zA-Z0-9_-]{1,220}$/.test(input?.itemId||'') || !['facebook','instagram'].includes(input.provider) ||
        !Number.isSafeInteger(input.version) || !/^[a-f0-9]{64}$/.test(input.contentHash||'') || !/^[a-f0-9]{64}$/.test(input.bindingHash||'') || !/^[a-f0-9]{64}$/.test(input.reviewDigest||'')) throw Error('Review the exact current post first.');
      return db.runTransaction(async tx=>{
        const ctx=await context(tx,uid,input);
        if(ctx.version?.version!==input.version || ctx.version.contentHash!==input.contentHash) throw Error('The post changed. Review the current version.');
        const binding=growth.contentBinding({id:ctx.versionId,record:ctx.version},uid);
        if(binding.bindingHash!==input.bindingHash || reviewDigest(ctx,binding.bindingHash)!==input.reviewDigest)throw Error('The post or its publish time changed. Review it again.');
        const identity={businessUid:uid,versionId:ctx.versionId,provider:input.provider};
        const jobId='social_growth_job_'+growth.hash(identity),ref=db.doc('socialGrowthJobs/'+jobId),old=(await tx.get(ref)).data();
        if(old) {
          if(old.bindingHash!==binding.bindingHash || old.customerApproval!==true) throw Error('This publication needs review.');
          return {status:old.status,jobId,provider:input.provider,scheduledFor:old.scheduledFor,reused:true};
        }
        const check=readiness(ctx);
        if(!check.ready) return {status:'blocked',...check};
        const account={providerUserId:ctx.connection.providerUserId,linkedPageId:ctx.connection.linkedPageId||null,
          handle:ctx.connection.handle||null,credentialId:ctx.connection.credentialId,
          connectionRevision:ctx.connection.connectionRevision,credentialRotationGeneration:ctx.connection.credentialRotationGeneration};
        if(!Number.isSafeInteger(account.connectionRevision)||!Number.isSafeInteger(account.credentialRotationGeneration)) throw Error(messages.permission);
        const canonical={schemaVersion:SCHEMA,businessUid:uid,approvedByUid:uid,providers:[input.provider],items:[binding],
          providerAccounts:{[input.provider]:account},planVersion:ctx.plan.planVersion,planId:ctx.item.planId};
        const approval={...canonical,id:'growth_approval_'+growth.hash(canonical),approvedAt:now(),externalPublishingEnabled:true};
        const job={...growth.jobs(approval)[0],status:'scheduled',customerApproval:true,externalPublishingEnabled:true};
        if(job.id!==jobId)throw Error('Publication identity mismatch.');
        tx.create(db.doc('socialGrowthApprovals/'+approval.id),approval);
        tx.create(ref,job);
        tx.update(ctx.itemRef,{['platformApprovals.'+input.provider]:{version:input.version,approvalId:approval.id,jobId,
          status:'scheduled',approvedAt:now(),scheduledFor:check.scheduledFor}});
        return {status:'scheduled',jobId,provider:input.provider,scheduledFor:check.scheduledFor,reused:false};
      });
    },
  };
}
function authorizeRuntime({approval,connection,config,uid,provider,environment,enabledUids}) {
  const a=approval?.providerAccounts?.[provider];
  if(approval?.schemaVersion!==SCHEMA || approval.businessUid!==uid || approval.approvedByUid!==uid ||
    approval.externalPublishingEnabled!==true || approval.revokedAt!=null || !enabledUids.includes(uid) || approval.providers?.length!==1 || approval.providers[0]!==provider ||
    config?.enabled!==true || config.writeScopesEnabled!==true || config.environment!==environment || config.provider!=='meta' ||
    connection?.businessUid!==uid || connection.environment!==environment || connection.status!=='connected_write' ||
    connection.tokenHealth!=='healthy' || connection.requiresReconnect===true ||
    !a || ['providerUserId','linkedPageId','credentialId','connectionRevision','credentialRotationGeneration'].some(k=>a[k]!==connection[k])) {
    throw Error('meta_customer_authority_changed');
  }
}
module.exports={SCHEMA,readiness,createStore,authorizeRuntime,hasPublishingScopes,connectionFromOwnedPath,messages};
