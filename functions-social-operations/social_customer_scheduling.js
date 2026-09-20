'use strict';
const growth = require("./social_growth_cycle");
const meta = require("./social_meta_candidate");
const {approved} = require("./social_plan_state");
const SCHEMA = 'CustomerPostApprovalV1';
const messages = {
  plan: 'Approve the current 30-Day Plan first.',
  creative: 'Finish or approve the image before scheduling.',
  permission: 'Review this account’s publishing permissions.',
  time: 'Choose a future publish time and review the updated post.',
  content: 'Review the complete copy, call to action and destination.',
  quality: 'Resolve the content quality review before scheduling.',
  scheduler: 'Scheduling is not available for this workspace yet.',
  existing: 'Review the existing scheduled version before scheduling a replacement.',
  paused: 'Publishing is paused by a workspace safety restriction. Your post is preserved.',
};
function readiness({uid, plan, item, version, provider, connection, revision, quality,
  schedulerEnabled = false, internalOwnerAuthorized = false, health, config, environment, entitlement, conflictingSchedule = false, mediaAuthorityValid=true, creativePreparation=null, now = Date.now()}) {
  const reasons = [];
  const add = key => reasons.push({code:key, message:messages[key]});
  if (!plan || plan.businessUid !== uid || !item || item.businessUid !== uid ||
      !version || version.businessUid !== uid || item.planId !== version.planId ||
      (item.platformVersions?.[provider]??item.currentVersion) !== version.version || !['facebook','instagram'].includes(provider)) {
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
  if(revision?.customerDeliveryId&&revision.preparation?.policy!==require('./social_customer_media').MEDIA_POLICY&&!reasons.some(r=>r.code==='creative'))add('creative');
  if(!mediaAuthorityValid&&!reasons.some(r=>r.code==='creative'))add('creative');
  if((creativePreparation?.state==='preparing'||creativePreparation?.recommendation?.format==='generated'&&creativePreparation.state!=='prepared')&&!reasons.some(r=>r.code==='creative'))add('creative');
  if (!connection || connection.businessUid!==uid || connection.status!=='connected_write' ||
      connection.environment!==environment || connection.tokenHealth!=='healthy' || connection.requiresReconnect===true || !connection.credentialId ||
      !/^\d+$/.test(connection.providerUserId||'') ||
      !Number.isSafeInteger(connection.connectionRevision) || !Number.isSafeInteger(connection.credentialRotationGeneration) ||
      connection.capabilities?.[mediaRequired?'publishImage':'publishText']!==true) add('permission');
  if(!hasPublishingScopes(connection,provider) && !reasons.some(r=>r.code==='permission'))add('permission');
  if (quality?.businessUid!==uid || quality.immutableSourceHash!==version.contentHash || quality.readyToPublish!==true) add('quality');
  if (!schedulerEnabled || config?.enabled!==true || config.writeScopesEnabled!==true || config.provider!=='meta' || config.environment!==environment ||
      (!internalOwnerAuthorized && !require("./subscription_entitlements").hasActiveManagedGrowthEntitlement(entitlement,{nowMillis:now}))) add('scheduler');
  if (health?.killSwitchActive===true) add('paused');
  if (conflictingSchedule) add('existing');
  if (!reasons.some(r=>['creative','permission','content'].includes(r.code))) {
    try { meta.describe({job:{id:'readiness',businessUid:uid,provider,binding:{variants:version.variants}},revision,
      account:{businessUid:uid,providerUserId:connection.providerUserId,linkedPageId:connection.linkedPageId}}); }
    catch { add(mediaRequired?'creative':'content'); }
  }
  try {meta.assertMediaEnvironment(revision,environment);} catch {if(!reasons.some(r=>r.code==='creative'))add('creative');}
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
function createStore({db, now=Date.now, enabledUids=[], planEntitled=false, environment,authorizeActor,bucket,stageInline}) {
  const enabled = (uid,entitlement) => planEntitled?require('./social_customer_enrollment').eligible(entitlement,now()):enabledUids.includes(uid);
  // One workspace response reuses its bounded history read across platform cards.
  // Authority checks below always read exact current records independently.
  const historyReads=new Map();
  const creativeHistory=uid=>{if(!historyReads.has(uid))historyReads.set(uid,require('./social_creative_diversity').readCreativeContext(db,uid));return historyReads.get(uid);};
  async function context(tx, uid, input) {
    if(!/^[a-zA-Z0-9_-]{1,220}$/.test(input?.itemId||'') || !['facebook','instagram'].includes(input?.provider)) throw Error('Choose a current post.');
    const read = ref => tx ? tx.get(ref) : ref.get();
    const itemRef=db.doc('socialContentItems/'+input.itemId),item=(await read(itemRef)).data();
    if(!item || item.businessUid!==uid) throw Error('This post is not available in your Business.');
    const versionId=input.itemId+'_v'+(item.platformVersions?.[input.provider]??item.currentVersion);
    const [p,v,c,q,h,config,entitlement,platformQuality,preparation] = await Promise.all([
      read(db.doc('socialContentPlans/'+item.planId)),read(db.doc('socialContentVersions/'+versionId)),
      read(db.doc(`socialConnections/${uid}/providers/${input.provider}`)),
      read(db.doc('socialContentQualityAssessments/'+versionId)),read(db.doc('agentHealth/'+uid)),
      read(db.doc('socialProviderConfigs/'+environment+'_meta')),read(db.doc('businessSubscriptions/'+uid)),
      read(db.doc('socialContentQualityAssessments/'+versionId+'_'+input.provider)),
      read(db.doc('socialCreativePreparation/'+require('./social_creative_diversity').leaseId(uid,input)))]);
    const jobs=await read(db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101));
    if(jobs.size>100)throw Error('Publication history requires review.');
    const existingJob=jobs.docs.map(d=>d.data()).find(job=>job.provider===input.provider&&job.versionId?.startsWith(input.itemId+'_v')&&job.customerApproval===true&&job.status!=='canceled');
    const conflictingSchedule=jobs.docs.some(doc=>{const job=doc.data();return job.provider===input.provider &&
      job.versionId?.startsWith(input.itemId+'_v') && job.versionId!==versionId && !['published','canceled'].includes(job.status);});
    const version=v.data(),variant=version?.variants?.find(v=>v.provider===input.provider);
    const revision=variant?.mediaRevisionId?(await read(db.doc(`socialMediaLibraries/${uid}/items/${variant.mediaRevisionId}`))).data():null;
    let mediaAuthorityValid=true;
    try{await require('./social_customer_media').assertDeliveryAuthority({db,read,uid,revision});}
    catch{mediaAuthorityValid=false;}
    let quality=platformQuality.data()||q.data();
    if(!existingJob && quality?.businessUid===uid && quality.immutableSourceHash===version?.contentHash){
      const recent=await read(db.collection('socialContentVersions').where('businessUid','==',uid).limit(101));
      if(recent.size>100)throw Error('Content history needs review.');
      const checks=require('./social_customer_quality').reviewChecks({variant,revision,mediaAuthorityValid,
        recentVariants:recent.docs.filter(d=>!d.id.startsWith(input.itemId+'_v')).flatMap(d=>d.data().variants||[])});
      quality={...quality,readyToPublish:checks.passed,reviewChecks:checks};
    }
    return {uid,plan:p.data(),item,version,versionId,itemRef,history:jobs.docs.map(d=>d.data()),creativePreparation:preparation.data(),provider:input.provider,connection:connectionFromOwnedPath(c.data(),uid),quality,
      conflictingSchedule,existingJob,mediaAuthorityValid,health:h.data(),config:config.data(),entitlement:entitlement.data(),environment,revision,internalOwnerAuthorized:!!await require('./social_internal_managed').authority({db,uid,read}),schedulerEnabled:enabled(uid,entitlement.data())||!!await require('./social_internal_managed').authority({db,uid,read}),now:now()};
  }
  return {
    async preview(uid,input,{actorUid=uid}={}) {
      const original=await context(null,uid,input);let inline=null,inlineError=null;
      if(!original.existingJob)try{inline=await require('./social_inline_creative').proposal({db,ctx:original});}catch(e){inlineError=e.message;}
      const ctx=inline?.ctx||original, result=readiness(ctx);
      let publicationStatus=ctx.existingJob?.status||null;
      if(publicationStatus==='scheduled'){
        const steps=await db.doc('socialGrowthJobs/'+ctx.existingJob.id).collection('providerSteps').limit(20).get();
        publicationStatus=publicationPresentation(ctx.existingJob,steps.docs.map(d=>d.data()),now());
      }
      const managed=(await db.doc('socialManagedPolicies/'+uid).get()).data();
      result.automaticMode=false;
      try{require('./social_bounded_authority').assertRuntimePolicy({uid,policy:managed,plan:original.plan,
        approval:{businessUid:uid,planId:original.item.planId,managedPolicyId:managed?.id,managedStrategyDigest:managed?.strategyDigest},now:now()});result.automaticMode=true;}catch{/* Missing or changed authority is never inferred from an old plan. */}
      if(result.automaticMode){
        const state=(await db.doc(`socialManagedCycles/${uid}/posts/${input.itemId}_${input.provider}`).get()).data();
        result.automaticState=state?.status==='needs_attention'?'needs_attention':'preparing';
        result.automaticReasons=state?.reasons||[];
      }
      const bindingHash=ctx.version?growth.contentBinding({id:ctx.versionId,record:ctx.version},uid).bindingHash:null;
      const recommendation=require('./social_creative_diversity').presentation(ctx.creativePreparation);
      const needsNew=!!recommendation&&recommendation.format==='generated'&&recommendation.state!=='prepared';
      result.creativeRecommendation=recommendation;
      const candidate=ctx.creativePreparation?.version===ctx.version?.version&&ctx.creativePreparation?.state==='creative_review'?ctx.creativePreparation.reviewCandidate:null;
      if(candidate?.status==='pending_owner_review'&&candidate.approved===false){
        const a=(await db.doc(`businessMediaLibraries/${uid}/mediaAssets/${candidate.assetId}`).get()).data();
        const r=(await db.doc(`businessMediaLibraries/${uid}/mediaAssets/${candidate.assetId}/revisions/${candidate.revisionId}`).get()).data();
        if(a?.businessUid===uid&&!a.removed&&a.currentRevisionId===candidate.revisionId&&r?.status==='ready'&&r.approvalStatus==='pending'&&r.contentHash===candidate.sourceSha256)
          result.reviewCandidate=candidate;
      }
      result.creativeNeedsPreparation=!original.existingJob&&(!recommendation||original.creativePreparation.version!==original.version?.version);
      if(original.creativePreparation?.reviewCandidate&&!original.creativePreparation.reviewCandidate.preparation?.subjectQuality)result.creativeNeedsPreparation=true;
      if(inline)result.reviewCandidate=inline.candidate;
      if(!original.existingJob){
        const diversity=require('./social_creative_diversity'),history=await creativeHistory(uid),mix=diversity.planCreativeMix(history);
        result.creativeSupply=mix.supply;
        result.creativeAssets=mix.assets;
        const planned=mix.decisions[diversity.key(input)],old=original.creativePreparation?.recommendation;
        if(old?.format!=='owner_selected'&&planned&&(old?.historyPolicy!=='SocialCreativeHistoryV2'||old?.assetId!==planned.assetId||old?.requestId!==planned.requestId))result.creativeNeedsPreparation=true;
        result.creativeLabel=require('./social_lifecycle_presentation').creativeLabel({
          origin:ctx.revision?.sourceOrigin,format:ctx.revision?.format,
          mediaRequirement:ctx.version?.variants?.find(v=>v.provider===input.provider)?.mediaRequirement,
          newCreative:!!original.creativePreparation?.reviewCandidate});
      }
      if(inline&&actorUid!==uid){result.ready=false;result.reasons.push({code:'creative_owner',message:'The Business owner must approve this new service-concept image.'});}
      if(inlineError){result.ready=false;result.reasons=result.reasons.filter(r=>r.code!=='creative');result.reasons.push({code:'creative',message:inlineError});}
      if(needsNew&&!inline)ctx.revision=null;
      const state=ctx.existingJob?.status|| (original.creativePreparation?.state==='preparing'?'preparing_creative':result.ready?'ready_for_review':
        !inline&&!result.reviewCandidate&&result.reasons.some(r=>r.code==='creative')?'needs_creative':'needs_attention');
      const presentation=require('./social_lifecycle_presentation');
      const profile=(await db.doc('businessGrowthProfiles/'+uid).get()).data();
      const cycle=original.existingJob?.preparedCycleId?(await db.doc('socialGrowthCycles/'+original.existingJob.preparedCycleId).get()).data():null;
      let savedZone=profile?.timeZone||profile?.timezone||original.plan?.timeZone||(cycle?.businessUid===uid?cycle.timeZone:null);
      if(!savedZone){
        const cycles=await db.collection('socialGrowthCycles').where('businessUid','==',uid).limit(101).get();
        if(cycles.size<=100){const zones=new Set(cycles.docs.map(d=>d.data()).filter(c=>c.businessUid===uid).map(c=>c.timeZone).filter(Boolean));if(zones.size===1)savedZone=[...zones][0];}
      }
      const timeZone=presentation.zone({timeZone:savedZone});
      result.creativeLabel=result.creativeLabel||presentation.creativeLabel({origin:ctx.revision?.sourceOrigin,format:ctx.revision?.format,mediaRequirement:ctx.version?.variants?.find(v=>v.provider===input.provider)?.mediaRequirement});
      return {...result,timeZone,scheduledForLabel:presentation.timeLabel(result.scheduledFor,timeZone),proposedFutureTimeLabel:presentation.timeLabel(require('./social_customer_preparation').futureSlot(result.scheduledFor,now()),timeZone),managedHold:original.item.managedHolds?.[input.provider]||null,jobId:ctx.existingJob?.id||null,version:original.version?.version,contentHash:original.version?.contentHash,reviewState:state,
        inlineCreativeApproval:inline?{digest:inline.digest,creativeSha256:inline.candidate.sha256,prospectiveVersion:inline.version.version}:null,
        reviewCandidate:result.reviewCandidate||null,publicationStatus,proposedFutureTime:require('./social_customer_preparation').futureSlot(result.scheduledFor,now()),bindingHash,
        reviewDigest:reviewDigest(ctx,bindingHash),reviewedPost:ctx.version ? {mediaOrigin:ctx.revision?.sourceOrigin||null,accountName:ctx.connection?.accountDisplayName||ctx.connection?.handle||'Connected Business account',variant:ctx.version.variants?.find(v=>v.provider===input.provider),goal:ctx.version.goal||'',images:inline?[]:ctx.revision?.images?.map(i=>({url:i.url,sha256:i.sha256,width:i.width,height:i.height}))||[],creativePrepared:ctx.revision?.preparation?.policy===require('./social_customer_media').MEDIA_POLICY,quality:ctx.quality||null,scheduledFor:result.scheduledFor}:null};
    },
    async approve(uid,input,{actorUid=uid,managedPolicyId=null}={}) {
      if(!/^[a-zA-Z0-9_-]{1,220}$/.test(input?.itemId||'') || !['facebook','instagram'].includes(input.provider) ||
        !Number.isSafeInteger(input.version) || !/^[a-f0-9]{64}$/.test(input.contentHash||'') || !/^[a-f0-9]{64}$/.test(input.bindingHash||'') || !/^[a-f0-9]{64}$/.test(input.reviewDigest||'')) throw Error('Review the exact current post first.');
      const inlineApi=require('./social_inline_creative');let staged=null;
      const receiptId=input.inlineCreativeDigest;
      if(receiptId!=null){
        if(actorUid!==uid)throw Error('The Business owner must approve a new service-concept image.');
        if(!/^[a-f0-9]{64}$/.test(receiptId)||input.confirmCreativeAndSchedule!==true)throw Error('Confirm the exact creative and post together.');
        // A retry returns the one committed job. It never creates a second version.
        const done=(await db.doc('socialCreativeApprovals/'+receiptId).get()).data();
        if(done){
          if(done.businessUid!==uid||done.itemId!==input.itemId||done.provider!==input.provider||done.actorUid!==actorUid)throw Error('Approval belongs to another review.');
          const job=(await db.doc('socialGrowthJobs/'+done.schedule.jobId).get()).data();
          if(!job||job.businessUid!==uid)throw Error('Confirming the saved schedule.');
          return {status:job.status,jobId:job.id,provider:job.provider,scheduledFor:job.scheduledFor,reused:true};
        }
        const original=await context(null,uid,input),p=await inlineApi.proposal({db,ctx:original});
        if(!p||p.digest!==receiptId||original.version.version!==input.version||original.version.contentHash!==input.contentHash)throw Error('The creative or post changed. Review it again.');
        if(managedPolicyId!==null){
          const policy=(await db.doc('socialManagedPolicies/'+uid).get()).data();
          if(policy?.id!==managedPolicyId)throw Error('Managed strategy authority changed.');
          const check=require('./social_bounded_authority').assess({uid,policy,planId:original.item.planId,
            plan:original.plan,version:p.ctx.version,provider:input.provider,quality:p.ctx.quality,history:original.history,now:now()});
          if(!check.ready)return {status:'blocked',...check};
        }
        const ready=readiness(p.ctx);if(!ready.ready)return {status:'blocked',...ready};
        staged=await (stageInline||inlineApi.stage)({bucket,proposal:p});
      }
      return db.runTransaction(async tx=>{
        if(actorUid!==uid){
          if(!authorizeActor)throw Error('Your team access does not allow Social approval.');
          await authorizeActor({businessUid:uid,actorUid,approve:true,transaction:tx});
        }
        const original=await context(tx,uid,input);
        if(receiptId){const done=(await tx.get(db.doc('socialCreativeApprovals/'+receiptId))).data();if(done){
          if(done.businessUid!==uid||done.actorUid!==actorUid||done.itemId!==input.itemId||done.provider!==input.provider)throw Error('Approval identity changed.');
          const j=(await tx.get(db.doc('socialGrowthJobs/'+done.schedule.jobId))).data();return {status:j.status,jobId:j.id,provider:j.provider,scheduledFor:j.scheduledFor,reused:true};}}
        if(original.version?.version!==input.version || original.version.contentHash!==input.contentHash) throw Error('The post changed. Review the current version.');
        const inline=receiptId?await inlineApi.proposal({db,ctx:original,read:ref=>tx.get(ref)}):null;
        if(receiptId&&(!inline||inline.digest!==receiptId||inline.candidate.sha256!==staged.sha256))throw Error('The image changed. Review it again.');
        const ctx=inline?.ctx||original;
        let managedPolicy = null;
        if (managedPolicyId !== null) {
          if(original.item.managedHolds?.[input.provider])return {status:'blocked',reasons:[{code:'owner_hold',message:'This post is held for your edits or was canceled.'}]};
          managedPolicy = (await tx.get(db.doc('socialManagedPolicies/'+uid))).data();
          if (managedPolicy?.id !== managedPolicyId) throw Error('Managed strategy authority changed.');
          const bounded = require('./social_bounded_authority').assess({uid, policy:managedPolicy,
            planId:ctx.item.planId, plan:ctx.plan, version:ctx.version, provider:input.provider,
            quality:ctx.quality, history:original.history.filter(j=>j.versionId!==ctx.versionId), now:now()});
          if (!bounded.ready) return {status:'blocked', ...bounded};
        }
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
        const canonical={schemaVersion:SCHEMA,businessUid:uid,approvedByUid:actorUid,
          ...(managedPolicy ? {authorizationSource:'approved_strategy',managedPolicyId:managedPolicy.id,
            managedStrategyDigest:managedPolicy.strategyDigest,strategyAuthorizedByUid:managedPolicy.approvedByUid,
            executionActor:'managed_social_scheduler'} : {authorizationSource:'individual_post_approval'}),
          ...(actorUid===uid?{}:{actorAuthority:{type:'workspace_member',businessUid:uid,actorUid}}),providers:[input.provider],items:[binding],
          providerAccounts:{[input.provider]:account},planVersion:ctx.plan.planVersion,planId:ctx.item.planId};
        const approval={...canonical,id:'growth_approval_'+growth.hash(canonical),approvedAt:now(),externalPublishingEnabled:true};
        const job={...growth.jobs(approval)[0],status:'scheduled',customerApproval:true,externalPublishingEnabled:true};
        if(job.id!==jobId)throw Error('Publication identity mismatch.');
        const targets=inline?await inlineApi.readCommitTargets({db,tx,uid,p:inline}):null;
        // Serialize different posts against the same cadence authority as well
        // as deduplicating retries of one post. Concurrent workers cannot both
        // consume the last permitted slot using an empty history snapshot.
        if(managedPolicy)tx.update(db.doc('socialManagedPolicies/'+uid),{
          lastScheduledJobId:jobId,lastScheduledAt:now()});
        if(inline)inlineApi.commit({tx,uid,actorUid,p:inline,staged,targets,now:now(),approvalId:approval.id,jobId,managedPolicy});
        tx.create(db.doc('socialGrowthApprovals/'+approval.id),approval);
        tx.create(ref,job);
        tx.update(ctx.itemRef,{['platformApprovals.'+input.provider]:{version:ctx.version.version,approvalId:approval.id,jobId,
          status:'scheduled',approvedAt:now(),scheduledFor:check.scheduledFor}});
        return {status:'scheduled',jobId,provider:input.provider,scheduledFor:check.scheduledFor,reused:false};
      });
    },
    async scheduleManaged(uid,input,policyId) {
      const preview=await this.preview(uid,input);
      if(preview.publicationStatus) return {status:preview.publicationStatus,reused:true};
      if(!preview.ready) return {status:'blocked',reasons:preview.reasons};
      return this.approve(uid,{itemId:input.itemId,provider:input.provider,
        version:preview.version,contentHash:preview.contentHash,bindingHash:preview.bindingHash,
        reviewDigest:preview.reviewDigest,
        ...(preview.inlineCreativeApproval?{inlineCreativeDigest:preview.inlineCreativeApproval.digest,confirmCreativeAndSchedule:true}:{})},
      {actorUid:uid,managedPolicyId:policyId});
    },
  };
}
function authorizeRuntime({approval,connection,config,uid,provider,environment,enabledUids}) {
  const a=approval?.providerAccounts?.[provider];
  if(approval?.schemaVersion!==SCHEMA || approval.businessUid!==uid || !require('./social_workspace_authority').validApprovalActor(approval,uid) ||
    approval.externalPublishingEnabled!==true || approval.revokedAt!=null || !enabledUids.includes(uid) || approval.providers?.length!==1 || approval.providers[0]!==provider ||
    config?.enabled!==true || config.writeScopesEnabled!==true || config.environment!==environment || config.provider!=='meta' ||
    connection?.businessUid!==uid || connection.environment!==environment || connection.status!=='connected_write' ||
    connection.tokenHealth!=='healthy' || connection.requiresReconnect===true ||
    !a || ['providerUserId','linkedPageId','credentialId','connectionRevision','credentialRotationGeneration'].some(k=>a[k]!==connection[k])) {
    throw Error('meta_customer_authority_changed');
  }
}
function publicationPresentation(job,steps,now=Date.now()){
  if(job.status!=='scheduled'||!steps.length)return require('./social_lifecycle_presentation').state(job,now);
  if(steps.some(s=>!s.receipt&&s.leaseUntil>now))return 'publishing';
  // A durable provider attempt without final job reconciliation is not a fresh
  // scheduled post. Preserve its records and require safe reconciliation.
  return 'reconciliation_required';
}
module.exports={SCHEMA,readiness,createStore,authorizeRuntime,hasPublishingScopes,connectionFromOwnedPath,messages,publicationPresentation};
