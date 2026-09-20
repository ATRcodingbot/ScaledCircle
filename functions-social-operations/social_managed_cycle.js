'use strict';

// Bounded preparation is separate from the time-critical publisher. This worker
// creates canonical schedule jobs only; provider publication stays with the
// existing scheduler and its execution-time authority checks.
const crypto=require('node:crypto');
const bounded=require('./social_bounded_authority');
function candidates(plan,policy) {
  const result=[];
  for(const item of plan.items||[])for(const variant of item.variants||[]) {
    if(policy.providers.includes(variant.provider))result.push({
      itemId:policy.planId+'_'+item.itemKey,provider:variant.provider});
  }
  if(result.length>120)throw Error('managed_social_candidate_limit');
  return result;
}
function createCycle({db,store,preparation,editor,media,replenish=false,now=Date.now,leaseMillis=600000}) {
  return {async run(uid,{limit=2}={}) {
    if(!/^[A-Za-z0-9_-]{1,220}$/.test(uid)||!Number.isInteger(limit)||limit<1||limit>4)throw Error('managed_social_cycle_input');
    const ref=db.doc('socialManagedCycles/'+uid),token=crypto.randomUUID();
    const claimed=await db.runTransaction(async tx=>{
      const previous=(await tx.get(ref)).data();
      if(previous?.leaseUntil>now())return null;
      tx.set(ref,{businessUid:uid,token,leaseUntil:now()+leaseMillis,startedAt:now(),status:'preparing'}, {merge:true});
      return {cursor:Number.isSafeInteger(previous?.cursor)?previous.cursor:0};
    });
    if(!claimed)return {status:'already_running',results:[]};
    const results=[];let cursor=claimed.cursor;
    try {
      const policy=(await db.doc('socialManagedPolicies/'+uid).get()).data();
      if(!policy?.planId)throw Error('managed_social_authority_missing');
      const plan=(await db.doc('socialContentPlans/'+policy.planId).get()).data();
      const approval={businessUid:uid,planId:policy.planId,managedPolicyId:policy.id,managedStrategyDigest:policy.strategyDigest};
      bounded.assertRuntimePolicy({uid,policy,plan,approval,now:now()});
      if(replenish)await require('./social_managed_categories').reconcile({db,uid,now:now()});
      let supply=null;
      if(replenish)supply=await require('./social_managed_supply').replenish({db,uid,now:now()});
      if(['history_incomplete','history_limit','context_changed'].includes(supply?.status)) {
        throw Error('managed_social_supply_'+supply.status);
      }
      const extra=await require('./social_managed_supply').supplemental({db,uid,planId:policy.planId});
      const known=new Set((plan.items||[]).map(i=>i.itemKey));
      const queue=candidates({...plan,items:[...(plan.items||[]),...extra.filter(i=>!known.has(i.itemKey))]},policy);
      let preparedCount=0;
      for(let scanned=0;scanned<Math.min(24,queue.length)&&preparedCount<limit;scanned++) {
        const input=queue[cursor%queue.length];cursor++;
        // Pause, revocation and strategy changes are checked between expensive
        // preparations and again transactionally when scheduling.
        const currentPolicy=(await db.doc('socialManagedPolicies/'+uid).get()).data();
        const currentPlan=(await db.doc('socialContentPlans/'+policy.planId).get()).data();
        bounded.assertRuntimePolicy({uid,policy:currentPolicy,plan:currentPlan,approval,now:now()});
        let preview=await store.preview(uid,input);
        if(preview.managedHold){results.push({...input,status:preview.managedHold.status,preserved:true});continue;}
        if(preview.publicationStatus){results.push({...input,status:preview.publicationStatus,preserved:true});continue;}
        preparedCount++;
        const externalBlockers=preview.reasons.filter(r=>['permission','scheduler','paused','plan','existing'].includes(r.code));
        if(externalBlockers.length){results.push({...input,status:'needs_attention',reasons:externalBlockers});continue;}
        if(editor){
          const jobs=await db.collection('socialGrowthJobs').where('businessUid','==',uid).limit(101).get();
          if(jobs.size>100)throw Error('managed_social_history_limit');
          const scheduledFor=bounded.nextSlot({policy:currentPolicy,history:jobs.docs.map(d=>d.data()),provider:input.provider,
            now:now(),preferred:preview.scheduledFor});
          if(!scheduledFor){results.push({...input,status:'needs_attention',reasons:[{code:'cadence',message:'The current strategy window has no remaining cadence slots.'}]});continue;}
          if(scheduledFor!==preview.scheduledFor){
            const variant=preview.reviewedPost.variant;
            await editor.save(uid,{...input,version:preview.version,copy:variant.copy,callToAction:variant.callToAction,
              destinationUrl:variant.destinationUrl,scheduledFor,textOnly:variant.mediaRequirement==='none'});
            preview=await store.preview(uid,input);
          }
        }
        if(preview.creativeNeedsPreparation){
          let prepared=await preparation.prepare(uid,{...input,version:preview.version,action:'auto'});
          if(prepared?.reviewCandidate?.preparation?.subjectQuality?.status==='blocked'){
            const current=await store.preview(uid,input);
            const recovery=await require('./social_managed_recovery').recover({db,uid,input:{...input,version:current.version},policyId:policy.id,candidate:prepared.reviewCandidate,preparation,now:now()});
            if(recovery.exhausted){results.push({...input,status:'needs_attention',reasons:[{code:'creative_recovery_exhausted',message:recovery.reason}]});continue;}
            prepared=recovery.result;
          }
          if(prepared?.reviewCandidate&&media){
            const current=await store.preview(uid,input);
            await require('./social_managed_creative').authorize({db,uid,input:{...input,version:current.version},policyId:policy.id,candidate:prepared.reviewCandidate,now:now()});
            await media.attach(uid,{...input,version:current.version,assetId:prepared.reviewCandidate.assetId,revisionId:prepared.reviewCandidate.revisionId,confirmPublicUse:true});
          }
          if(prepared?.generationRequest){
            const request=prepared.generationRequest;
            const ref=db.doc('socialManagedGenerationRequests/'+crypto.createHash('sha256').update(uid+':'+request.requestId).digest('hex'));
            const generationState=await db.runTransaction(async tx=>{
              const old=await tx.get(ref);
              const grant=(await tx.get(db.doc("visualGenerationGrants/"+uid))).data();
              if(old.data()?.status==="needs_attention"&&!old.data().jobId&&grant?.startsAt>old.data().checkedAt&&require("./generation_operating_access").activeGrant(grant,policy,uid,now())){tx.update(ref,{status:"pending",resumedAt:now(),resumeReason:"operating_grant_activated"});return "pending";}
              if(!old.exists)tx.create(ref,{businessUid:uid,policyId:policy.id,planId:policy.planId,input:request,status:'pending',createdAt:now()});
              if(old.data()?.status==='paused'&&old.data().policyId===policy.id){
                tx.update(ref,{status:'pending',resumedAt:now()});return 'pending';
              }
              return old.data()?.status||'pending';
            });
            results.push({...input,status:generationState==='needs_attention'?'needs_attention':'preparing_creative',
              ...(generationState==='needs_attention'?{reasons:[{code:'generation',message:'Creative generation needs attention. Review the saved draft.'}]}:{})});continue;
          }
        }
        if(editor){const current=await store.preview(uid,input);await editor.assess(uid,{...input,version:current.version});}
        const result=await store.scheduleManaged(uid,input,policy.id);
        const state={...input,...result,status:result.status==='blocked'?'needs_attention':result.status};
        await db.doc(`socialManagedCycles/${uid}/posts/${input.itemId}_${input.provider}`).set({...state,at:now()});
        results.push(state);
      }
      for(const result of results)await db.doc(`socialManagedCycles/${uid}/posts/${result.itemId}_${result.provider}`).set({...result,at:now()});
      await db.runTransaction(async tx=>{
        const current=(await tx.get(ref)).data();
        if(current?.token!==token)throw Error('managed_social_cycle_lease_changed');
        tx.set(ref,{cursor,status:'complete',finishedAt:now(),leaseUntil:0,results,...(supply?{supply}: {})},{merge:true});
      });
      return {status:'complete',results};
    } catch(error) {
      await db.runTransaction(async tx=>{
        const current=(await tx.get(ref)).data();
        if(current?.token===token)tx.set(ref,{cursor,status:'needs_attention',finishedAt:now(),leaseUntil:0,
          reason:'Managed publishing needs attention. Review your strategy, connections and publishing status.'},{merge:true});
      });
      throw error;
    }
  }};
}
module.exports={candidates,createCycle};
