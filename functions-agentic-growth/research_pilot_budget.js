'use strict';
// Separate research ledger in one central Firestore database. The same terminal
// transition primitive as Social; never read or consume a Social grant.
const {reservationTransition}=require('./shared/generation_budget');
const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
const MAXIMUM=5000000,PER_CALL=100000,TERM=7*86400000;
function valid(g,workspace,at){return g?.status==='active'&&g.revokedAt==null&&g.product==='public_web_research'&&g.approvedBy&&g.authorizationReference&&g.workspaces?.includes(workspace)&&g.startsAt<=at&&g.expiresAt===g.startsAt+TERM&&at<g.expiresAt&&g.maximumCostMicros===MAXIMUM&&g.renewal===false;}
function createStore({db,grantId,now=Date.now}){
 const grantRef=db.doc('researchOperatingGrants/'+grantId);
 const usage=(g,w,day)=>[db.doc('researchOperatingUsage/'+g),db.doc('researchOperatingUsage/'+g+'_'+hash(w)),db.doc('researchOperatingUsage/'+g+'_'+hash(w)+'_'+day)];
 async function reserve({project,businessUid,attemptId,maximumCostMicros}){
  if(maximumCostMicros!==PER_CALL||!project||!businessUid||!attemptId)throw Error('research_bound_invalid');
  const workspace=project+'/'+businessUid,id=hash(grantId+'/'+workspace+'/'+attemptId),ref=db.doc('researchOperatingReservations/'+id),at=now();
  return db.runTransaction(async tx=>{
   const [g,r]=await Promise.all([tx.get(grantRef),tx.get(ref)]);if(!valid(g.data(),workspace,at))throw Error('research_not_authorized');
   if(r.exists)return {...r.data(),idempotentReplay:true};
   const refs=usage(grantId,workspace,new Date(at).toISOString().slice(0,10)),snapshots=await Promise.all(refs.map(x=>tx.get(x))),rows=snapshots.map(x=>x.data()||{});
   if((rows[0].actualCostMicros||0)+(rows[0].outstandingCostMicros||0)+PER_CALL>MAXIMUM)throw Error('research_budget_exhausted');
   if((rows[2].attempts||0)>=2)throw Error('research_daily_call_limit');
   const value={id,grantId,workspace,usagePaths:refs.map(x=>x.path),reservedUnits:0,reservedCostMicros:PER_CALL,status:'reserved',createdAt:at};tx.create(ref,value);
   refs.forEach((r,i)=>tx.set(r,{...rows[i],outstandingCostMicros:(rows[i].outstandingCostMicros||0)+PER_CALL,attempts:(rows[i].attempts||0)+1},{merge:true}));return value;
  });
 }
 async function claim({reservation}){return db.runTransaction(async tx=>{const ref=db.doc('researchOperatingReservations/'+reservation.id),[r,g]=await Promise.all([tx.get(ref),tx.get(grantRef)]),v=r.data();if(!v||v.grantId!==grantId||v.workspace!==reservation.workspace||!valid(g.data(),v.workspace,now()))throw Error('research_not_authorized');if(v.status!=='reserved'||v.dispatchedAt)return false;tx.update(ref,{dispatchedAt:now()});return true;});}
 async function reconcile({reservation,status,cost,providerAccepted}){return db.runTransaction(async tx=>{
  const ref=db.doc('researchOperatingReservations/'+reservation.id),r=await tx.get(ref),v=r.data();if(!v||v.grantId!==grantId||v.workspace!==reservation.workspace)throw Error('research_binding_invalid');
  if(status==='released')throw Error('research_release_requires_provider_reconciliation');
  if(status==='settled'&&(!Number.isSafeInteger(cost?.actualCostMicros)||cost.actualCostMicros<0))throw Error('research_usage_unknown');
  const delta=reservationTransition(v,{status,cost,providerAccepted});if(!delta.apply)return;
  const refs=v.usagePaths.map(p=>db.doc(p)),snapshots=await Promise.all(refs.map(x=>tx.get(x)));
  refs.forEach((r,i)=>{const old=snapshots[i].data()||{};tx.set(r,{outstandingCostMicros:(old.outstandingCostMicros||0)+delta.outstandingCostMicrosDelta,actualCostMicros:(old.actualCostMicros||0)+delta.actualCostMicrosDelta},{merge:true});});
  tx.update(ref,{status,...(cost?{cost}:{}),providerAccepted:providerAccepted===true,reconciledAt:now()});
 });}
 return {reserve,claim,reconcile};
}
module.exports={createStore,valid,MAXIMUM,PER_CALL,TERM};
