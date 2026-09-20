'use strict';
const UID='IqRjZYHKOzXYuJcSyL68LYNwtDg1';
const {reviewCost}=require('./generation_paid_bounds');
// Covers the full documented 4.1-mini context/output envelope, not an average
// image-review estimate. Unknown attempts remain reserved, never free or zero.
const UNKNOWN_MICROS=500000;
async function reconcile({db,operator,now=Date.now}){
 if(!operator)throw Error('admin_required');
 return db.runTransaction(async tx=>{
  const auditRef=db.doc('visualGenerationAccountingReconciliations/'+UID);
  const [audit,rows,counters,config]=await Promise.all([tx.get(auditRef),tx.get(db.collection('socialCreativeVisualAssessments').where('businessUid','==',UID).limit(101)),tx.get(db.collection('socialVisualCheckUsage').limit(401)),tx.get(db.doc('providerConfigurations/generated-service-visuals'))]);
  if(audit.exists)return {...audit.data(),reused:true};
  if(rows.size>100||counters.size>400)throw Error('historical_review_inventory_limit');
  const totals={},entries=[];
  for(const doc of rows.docs){const r=doc.data();if(!['gpt-4.1-mini','gpt-4.1-mini-2025-04-14'].includes(r.model)||!/^\d{4}-\d{2}-\d{2}$/.test(r.attemptDay||'')||!Number.isInteger(r.attempts)||r.attempts<1||r.attempts>2)throw Error('historical_review_evidence_incomplete');
   totals[r.attemptDay]=(totals[r.attemptDay]||0)+r.attempts;
   const known=!!r.responseId&&Number.isSafeInteger(r.inputTokens)&&Number.isSafeInteger(r.outputTokens),cost=known?reviewCost('gpt-4.1-mini',{input_tokens:r.inputTokens,output_tokens:r.outputTokens}):null;
   for(let i=0;i<r.attempts;i++){const settled=known&&i===r.attempts-1,jobId='historical_review_'+doc.id+'_'+i,keys={day:r.attemptDay,month:r.attemptDay.slice(0,7)};
    entries.push({jobId,businessUid:UID,operation:'review',sourceAssessmentId:doc.id,status:settled?'settled':'unknown_provider_outcome',keys,usageIds:[`business_${UID}_${keys.month}`,`global_day_${keys.day}`,`global_month_${keys.month}`,`business_day_${UID}_${keys.day}`],reservedUnits:0,reservedCostMicros:settled?0:UNKNOWN_MICROS,providerAccepted:settled,customerConsumed:false,cost:settled?{actualCostMicros:cost,basis:'recorded_tokens_standard_rate_upper_bound'}:null,dispatchStartedAt:r.startedAt||r.completedAt||now(),createdAt:r.startedAt||r.completedAt||now(),updatedAt:now()});}
  }
  const actual=Object.fromEntries(counters.docs.filter(d=>d.id.startsWith(UID+'_')).map(d=>[d.id.slice(UID.length+1),d.data().attempts]));
  if(JSON.stringify(Object.entries(actual).sort())!==JSON.stringify(Object.entries(totals).sort()))throw Error('historical_attempt_inventory_mismatch');
  const old=await Promise.all(entries.map(e=>tx.get(db.doc('visualGenerationReservations/'+e.jobId))));
  if(old.some(s=>s.exists))throw Error('historical_partial_reconciliation_requires_review');
  const live=await Promise.all(rows.docs.map(d=>tx.get(db.doc('visualGenerationReservations/review_'+d.id))));
  if(live.some(s=>s.exists))throw Error('historical_review_already_accounted');
  const ids=[...new Set(entries.flatMap(e=>e.usageIds))],snaps=await Promise.all(ids.map(id=>tx.get(db.doc('visualGenerationUsage/'+id)))),usage=new Map(snaps.map((s,i)=>[ids[i],s.data()||{}]));
  for(const e of entries){tx.create(db.doc('visualGenerationReservations/'+e.jobId),e);for(const id of e.usageIds){const v=usage.get(id);v.actualCostMicros=(v.actualCostMicros||0)+(e.cost?.actualCostMicros||0);v.outstandingCostMicros=(v.outstandingCostMicros??v.reservedCostMicros??0)+e.reservedCostMicros;v.reservedCostMicros=v.outstandingCostMicros;v.updatedAt=now();}}
  for(const [id,v]of usage)tx.set(db.doc('visualGenerationUsage/'+id),v,{merge:true});
  const result={businessUid:UID,operator,reconciledAt:now(),version:'combined_v1',attempts:entries.length,knownAttempts:entries.filter(e=>e.status==='settled').length,accountedCostMicros:entries.reduce((s,e)=>s+(e.cost?.actualCostMicros||0),0),unknownReservedMicros:entries.reduce((s,e)=>s+e.reservedCostMicros,0),basis:'Unknown attempts retain full model-envelope reservations; known tokens priced conservatively. No invoice claim.',subscriptionChanged:false,allowanceChanged:false};
  tx.create(auditRef,result);
  tx.update(config.ref,{paidPreparationAccountingByBusiness:{...(config.data()?.paidPreparationAccountingByBusiness||{}),[UID]:'combined_v1'}});
  return result;
 });
}
module.exports={UID,UNKNOWN_MICROS,reconcile};
