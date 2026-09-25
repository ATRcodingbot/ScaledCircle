'use strict';
const crypto=require('node:crypto');
const DAY=86400000;
function createService({db,FieldValue,run,now=Date.now}){
  async function configure(businessId,actorUid,enabled){
    if(typeof enabled!=='boolean')throw Error('Choose whether recurring research is enabled.');
    await db.runTransaction(async tx=>{
      const ref=db.doc('customerResearchSchedules/'+businessId),old=(await tx.get(ref)).data();
      tx.set(ref,{businessUid:businessId,enabled,cadence:'daily',nextRunAt:old?.enabled?old.nextRunAt:now(),
        configuredBy:actorUid,configuredAt:FieldValue.serverTimestamp(),authoritySource:'owner_opt_in'},{merge:true});
    });return {enabled,cadence:'daily'};
  }
  async function runDue(){
    const due=await db.collection('customerResearchSchedules').where('enabled','==',true).where('nextRunAt','<=',now()).orderBy('nextRunAt').limit(10).get();
    const results=[],started=Date.now();
    // One bounded cycle at a time; the maintained runner additionally owns a
    // per-Business/day lease and idempotent run ID shared with manual research.
    for(const doc of due.docs){
      if(Date.now()-started>180000)break;
      const claim=crypto.randomUUID();
      const acquired=await db.runTransaction(async tx=>{
        const s=(await tx.get(doc.ref)).data();
        if(s?.businessUid!==doc.id||!s.enabled||s.nextRunAt>now()||s.leaseUntil>now())return false;
        tx.update(doc.ref,{claim,leaseUntil:now()+240000,lastAttemptAt:now(),lastStatus:'running'});return true;
      });
      if(!acquired)continue;
      let result,error;
      try{result=await run(doc.id);if(typeof result?.runId!=='string'||!result.runId)throw Error('Research did not return a saved run.');}catch(e){error=e;result=null;}
      const completed=now();
      await db.runTransaction(async tx=>{
        const current=(await tx.get(doc.ref)).data();
        if(current?.claim!==claim)return;
        const patch={leaseUntil:0,lastStatus:error?'held':'completed',
          // Authority failures remain visible and are retried on the next day;
          // no stale schedule causes a rapid provider retry loop.
          nextRunAt:completed+DAY,lastErrorCode:error?(error.code||'unavailable'):null};
        if(!error)Object.assign(patch,{lastCompletedAt:completed,lastRunId:result.runId,lastReused:result.reused===true,
          lastDiscoveryState:result.discoveryOutcome?.state||'unknown',lastDiscoveryFailure:result.discoveryOutcome?.failure||null,lastSourceChecks:Number.isFinite(result.sourceChecks)?result.sourceChecks:null});
        tx.update(doc.ref,patch);
      });
      results.push({businessUid:doc.id,status:error?'held':'completed',...(result?{runId:result.runId,reused:result.reused===true}:{})});
    }
    return {examined:due.size,results};
  }
  return {configure,runDue};
}
module.exports={DAY,createService};
