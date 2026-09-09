'use strict';
const crypto=require('node:crypto'),contract=require('./subscription_contract');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const id=x=>typeof x==='string'?x:x?.id;
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
const sourceTerms=p=>digest({id:p.id,status:p.status,cancel:p.cancel_at_period_end,items:p.items.data.map(i=>({id:i.id,price:i.price.id,quantity:i.quantity||1,start:i.current_period_start||p.current_period_start,end:i.current_period_end||p.current_period_end})).sort((a,b)=>a.id.localeCompare(b.id))});
const cleanItems=items=>items.map(i=>({price:id(i.price),quantity:i.quantity})).sort((a,b)=>a.price.localeCompare(b.price));
function standardBilling(provider){
 // Do not drop special terms while replacing subscription items. These need a
 // separately reviewed provider preview; the launch flow changes standard USD terms.
 if(provider.status!=='active'||provider.discounts?.length||provider.discount||provider.automatic_tax?.enabled||provider.default_tax_rates?.length||provider.pending_update||provider.pause_collection||provider.items.data.some(i=>i.discounts?.length||i.tax_rates?.length))fail('failed-precondition','This membership has special billing terms that need review before changing its selection. Your current access is unchanged.');
}
function scheduleBinding(schedule,a,provider,released=false){
 if(!schedule||schedule.livemode!==provider.livemode||id(released?schedule.released_subscription:schedule.subscription)!==a.subscriptionId||id(schedule.customer)!==a.customerId)fail('failed-precondition','The scheduled membership identity needs reconciliation.');
}
function createSelectionService({db,FieldValue,workspace,stripe,read,planForPrice,priceForPlan,validatePrice,now=Date.now}) {
 async function scheduleFor(a,provider){
  if(!provider.schedule)return null;
  const schedule=await stripe().subscriptionSchedules.retrieve(id(provider.schedule));
  scheduleBinding(schedule,a,provider);
  if(id(schedule.subscription)!==a.subscriptionId||id(schedule.customer)!==a.customerId||schedule.metadata?.businessId!==a.businessId||schedule.metadata?.purpose!=='workspace_selection_v1')fail('failed-precondition','This scheduled membership change needs reconciliation before another change.');
  return schedule;
 }
 async function hasPendingChange(r){const s=await scheduleFor(r.a,r.provider);return !!s?.phases.some(p=>p.start_date*1000>now());}
 async function ensureEditable(r){
  if(!r.provider.schedule)return r;
  const s=await stripe().subscriptionSchedules.retrieve(id(r.provider.schedule));
  if(s.metadata?.purpose!=='workspace_selection_v1'||s.metadata?.businessId!==r.a.businessId)return r;
  scheduleBinding(s,r.a,r.provider);if(s.phases.some(p=>p.start_date*1000>now()))return r;
  const phase=[...s.phases].sort((a,b)=>b.start_date-a.start_date)[0];
  if(!phase||JSON.stringify(cleanItems(phase.items))!==JSON.stringify(cleanItems(r.provider.items.data)))fail('failed-precondition','The applied membership selection needs reconciliation.');
  // After the new phase starts, release only its scheduling wrapper as part
  // of the authorized next billing action. Paid items and history stay intact.
  try {await stripe().subscriptionSchedules.release(s.id,{preserve_cancel_date:false},{idempotencyKey:`workspace_selection_applied_release_${s.id}`});
   const released=await stripe().subscriptionSchedules.retrieve(s.id);scheduleBinding(released,r.a,r.provider,true);if(released.status!=='released')throw Error('release_unconfirmed');
  }catch(_){fail('unavailable','The prior membership change needs confirmation. Refresh before retrying.');}
  return read(r.a.actorUid,r.a.businessId);
 }
 async function decorate(r){const schedule=await scheduleFor(r.a,r.provider);if(!schedule)return r.view;
  const phase=schedule.phases.find(p=>p.start_date*1000>now());if(!phase)return r.view;
  const ids=phase.items.map(i=>planForPrice(id(i.price))),bundled=ids.includes(contract.BUNDLE);
  const s=contract.selectionTerms(bundled?{bundle:contract.BUNDLE}:{plan:ids.find(p=>contract.PLANS[p]),addons:ids.filter(p=>contract.ADDONS[p])});
  if(ids.length!==s.items.length||new Set(ids).size!==ids.length||phase.items.some(i=>i.quantity!==1))fail('failed-precondition','Scheduled membership terms need verification.');
  const result={...r.view,scheduledChange:{selection:{plan:s.plan,bundle:s.bundle,addons:s.addons},monthlyCents:s.monthlyCents,effectiveAtMs:phase.start_date*1000,name:s.name||s.plan},canCancelScheduledChange:true};
  const w=(await db.doc(`businessWorkspaces/${r.a.businessId}`).get()).data();
  if(w?.billingOperationId&&schedule.metadata?.operationId===w.billingOperationId){
   const ref=db.doc(`businessBillingOperations/${w.billingOperationId}`),op=(await ref.get()).data();
   if(op?.action==='changeSelection'&&op.quote?.effectiveAtMs===phase.start_date*1000&&JSON.stringify(cleanItems(phase.items))===JSON.stringify(cleanItems(op.quote.items))){result.changePending=false;await finish(ref,{...r.a,actorUid:op.actorUid},result);}
  }
  return result;
 }
 async function preview({uid,businessId,selection}){
  const r=await read(uid,businessId),{a,provider,view}=r;const chosen=contract.selectionTerms(selection);standardBilling(provider);
  if(!view.paidAccess||view.cancelAtPeriodEnd||await hasPendingChange(r))fail('failed-precondition','Withdraw cancellation or remove the scheduled change before changing your selection.');
  const current=contract.selection({plan:view.plan,bundle:view.bundle,addons:view.bundle?[]:view.addons});
  if(JSON.stringify(current)===JSON.stringify(contract.selection(chosen)))fail('invalid-argument','This is already your membership selection.');
  const items=[];let monthlyCents=0;
  for(const item of chosen.items){const price=priceForPlan(item);const verified=await validatePrice(price);if(!verified?.price||verified.terms.plan!==item)fail('failed-precondition','The selected billing item is not configured.');items.push({price,quantity:1});monthlyCents+=verified.price.unit_amount;}
  if(monthlyCents!==chosen.monthlyCents)fail('failed-precondition','The recurring price needs verification.');
  const changes=[...provider.items.data.map(i=>({id:i.id,deleted:true})),...items];
  // The current paid phase stays intact; the replacement becomes effective at renewal.
  const invoice=await stripe().invoices.createPreview({customer:a.customerId,subscription:a.subscriptionId,subscription_details:{items:changes,proration_behavior:'none'}});
  if(invoice.currency!=='usd'||!Number.isSafeInteger(invoice.amount_due)||invoice.total!==monthlyCents)fail('failed-precondition','The next invoice includes other adjustments and needs review before changing membership.');
  const ref=db.collection('businessBillingQuotes').doc(),q={businessId:a.businessId,actorUid:uid,subscriptionId:a.subscriptionId,action:'changeSelection',selection:contract.selection(chosen),items,monthlyCents,seatLimit:chosen.seats,effectiveAtMs:view.periodEndMs,sourceTerms:sourceTerms(provider),amountDueCents:invoice.amount_due,totalCents:invoice.total,expiresAtMs:now()+300000,createdAt:FieldValue.serverTimestamp()};await ref.create(q);
  return {quoteId:ref.id,selection:q.selection,planName:chosen.name||view.planNames?.[chosen.plan]||chosen.plan,monthlyCents,price:monthlyCents/100,seatLimit:chosen.seats,effectiveAtMs:q.effectiveAtMs,amountDueCents:invoice.amount_due,totalCents:invoice.total,chargeNowCents:0,proration:'none_at_renewal',expiresAtMs:q.expiresAtMs};
 }
 async function finish(ref,a,result){await db.runTransaction(async tx=>{const op=await tx.get(ref),wref=db.doc(`businessWorkspaces/${a.businessId}`),w=await tx.get(wref);if(op.data()?.status==='succeeded')return;tx.update(ref,{status:'succeeded',result,completedAt:FieldValue.serverTimestamp()});if(w.data()?.billingOperationId===ref.id)tx.update(wref,{billingOperationId:FieldValue.delete(),revision:FieldValue.increment(1)});tx.create(db.doc(`businessWorkspaces/${a.businessId}/activity/billing_${ref.id}`),{businessId:a.businessId,actorUid:a.actorUid,action:op.data().action,subscriptionId:a.subscriptionId,createdAt:FieldValue.serverTimestamp()});});}
 async function change({uid,businessId,requestId,quoteId,action='changeSelection'}){
  if(!['changeSelection','cancelScheduledChange'].includes(action)||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId||''))fail('invalid-argument','A valid membership request is required.');
  let r=await read(uid,businessId);if(action==='changeSelection')r=await ensureEditable(r);const {a,provider,view}=r;
  const operationId=digest(`${a.businessId}:${requestId}`),ref=db.doc(`businessBillingOperations/${operationId}`),inputDigest=digest({uid,action,quoteId:quoteId||null});let op,existingRequest=false;
  await db.runTransaction(async tx=>{await workspace.authority({uid,businessId:a.businessId,permission:'billing',allowExpired:true,transaction:tx});const existing=(await tx.get(ref)).data(),wref=db.doc(`businessWorkspaces/${a.businessId}`),w=await tx.get(wref);
   if(existing){if(existing.inputDigest!==inputDigest)fail('already-exists','This request belongs to another change.');op=existing;existingRequest=true;return;}
   if(w.data()?.billingOperationId)fail('aborted','Another membership change is being reconciled.');
   if(action==='changeSelection'&&w.data()?.pendingMembershipSelection)fail('aborted','A membership selection is already scheduled. Refresh before changing it.');
   if(!view.paidAccess)fail('failed-precondition','An active paid membership is required.');
   let quote=null;
   if(action==='changeSelection'){
    if(provider.schedule||view.cancelAtPeriodEnd)fail('failed-precondition','Remove the pending change or cancellation first.');standardBilling(provider);
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(quoteId||''))fail('invalid-argument','Review the next invoice before confirming.');
    quote=(await tx.get(db.doc(`businessBillingQuotes/${quoteId}`))).data();
    if(!quote||quote.action!==action||quote.businessId!==a.businessId||quote.actorUid!==uid||quote.expiresAtMs<=now()||quote.sourceTerms!==sourceTerms(provider))fail('failed-precondition','The preview expired or membership changed. Request a new preview.');
    const inventory=await workspace.inventory(a.businessId,tx);
    if(inventory.members.filter(m=>m.status==='active').length+1+inventory.invitations.filter(i=>i.status==='pending'&&i.expiresAt?.toMillis()>now()).length>quote.seatLimit)fail('failed-precondition','Review Team and remove extra seats or invitations before reducing capacity. The owner remains.');
    // Compact only active seat indices so a reserved future capacity cannot
    // revoke an existing member merely because earlier removals left gaps.
    inventory.members.filter(m=>m.status==='active').sort((x,y)=>x.seatIndex-y.seatIndex).forEach((m,i)=>tx.update(db.doc(`businessWorkspaces/${a.businessId}/members/${m.uid}`),{seatIndex:i+1}));
   }else if(!provider.schedule)fail('failed-precondition','There is no scheduled change to remove.');
   op={action,inputDigest,businessId:a.businessId,actorUid:uid,subscriptionId:a.subscriptionId,sourceTerms:sourceTerms(provider),quote,status:'processing',createdAtMs:now(),scheduleId:id(provider.schedule)||null};
   tx.create(ref,{...op,createdAt:FieldValue.serverTimestamp()});tx.set(wref,{billingOperationId:operationId,...(quote?{pendingSeatLimit:quote.seatLimit,pendingMembershipSelection:{items:quote.items,effectiveAtMs:quote.effectiveAtMs}}:{}),revision:FieldValue.increment(1)},{merge:true});
  });
  if(op.status==='succeeded')return {...op.result,duplicate:true};
  // A persisted unresolved request is reconciled by GET only. Never create another schedule on ambiguity.
  if(op.status==='reconcile_required'||existingRequest){
   const sid=op.scheduleId||id(provider.schedule);if(!sid)fail('unavailable','The provider outcome is unknown. Membership is held for reconciliation.');
   const s=await stripe().subscriptionSchedules.retrieve(sid);
   if(op.action==='cancelScheduledChange'&&s.status==='released'){scheduleBinding(s,a,provider,true);if(s.metadata?.businessId!==a.businessId||s.metadata?.purpose!=='workspace_selection_v1')fail('failed-precondition','The released schedule needs reconciliation.');await db.doc(`businessWorkspaces/${a.businessId}`).set({pendingSeatLimit:FieldValue.delete(),pendingMembershipSelection:FieldValue.delete()},{merge:true});await finish(ref,a,view);return view;}
   scheduleBinding(s,a,provider);
   if(s.metadata?.operationId===operationId&&s.metadata?.businessId===a.businessId&&s.phases.some(p=>p.start_date*1000===op.quote?.effectiveAtMs&&JSON.stringify(cleanItems(p.items))===JSON.stringify(cleanItems(op.quote.items)))){const latest=await read(uid,businessId),result=await decorate(latest);await finish(ref,a,result);return result;}
   fail('unavailable','The scheduled change needs reconciliation. No additional billing action was taken.');
  }
  try{
   if(action==='cancelScheduledChange'){
    const s=await scheduleFor(a,provider);await stripe().subscriptionSchedules.release(s.id,{preserve_cancel_date:false},{idempotencyKey:`workspace_selection_release_${operationId}`});
    const released=await stripe().subscriptionSchedules.retrieve(s.id);scheduleBinding(released,a,provider,true);if(released.status!=='released')throw Error('release_not_confirmed');
    await db.doc(`businessWorkspaces/${a.businessId}`).set({pendingSeatLimit:FieldValue.delete(),pendingMembershipSelection:FieldValue.delete()},{merge:true});const result=(await read(uid,businessId)).view;await finish(ref,a,result);return result;
   }
   for(const item of op.quote.items)await validatePrice(item.price);
   if(op.sourceTerms!==sourceTerms(provider)||provider.schedule)fail('failed-precondition','Membership changed before the scheduled update.');
   const created=await stripe().subscriptionSchedules.create({from_subscription:a.subscriptionId},{idempotencyKey:`workspace_selection_create_${operationId}`});
   op.scheduleId=created.id;await ref.update({scheduleId:created.id});
   scheduleBinding(created,a,provider);if(!created.current_phase)throw Error('schedule_binding_mismatch');
   const start=created.current_phase.start_date,end=op.quote.effectiveAtMs/1000;
   if(created.current_phase.end_date!==end)throw Error('schedule_period_mismatch');
   await stripe().subscriptionSchedules.update(created.id,{end_behavior:'release',proration_behavior:'none',metadata:{purpose:'workspace_selection_v1',businessId:a.businessId,operationId},phases:[{start_date:start,end_date:end,items:cleanItems(provider.items.data.map(i=>({...i,quantity:i.quantity||1}))),proration_behavior:'none',metadata:{...provider.metadata}},{start_date:end,duration:{interval:'month',interval_count:1},items:op.quote.items,proration_behavior:'none',metadata:{...provider.metadata,...contract.selectionMetadata(op.quote.selection)}}]},{idempotencyKey:`workspace_selection_update_${operationId}`});
   const result=await decorate(await read(uid,businessId));if(!result.scheduledChange)throw Error('schedule_not_confirmed');await finish(ref,a,result);return result;
  }catch(_){await ref.set({status:'reconcile_required',scheduleId:op.scheduleId||null,updatedAt:FieldValue.serverTimestamp()},{merge:true});fail('unavailable','Membership change needs provider verification. Refresh before any retry.');}
 }
 return {preview,change,decorate,ensureEditable};
}
module.exports={createSelectionService,sourceTerms};
