"use strict";
const crypto=require('node:crypto');
const route=require('./route_progress'), coverage=require('./canvassing_completion');
const finance=require('./campaign_reserve_settlement');
const VERSION='IntentionalWorkPause24hV1';
const DISCLOSURE='If you stop before the base completion requirement, the Business may offer partial payment for accepted partial work. Partial payment is not guaranteed.';
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
const ms=v=>v?.toMillis?.() ?? (typeof v==='string'?Date.parse(v):Number(v));
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function createService({db,FieldValue,Timestamp,project,clock=()=>Date.now()}) {
 const stamp=()=>FieldValue.serverTimestamp();
 function staging(){if(project!=='scaledcircle-staging')fail('failed-precondition','This work-pause release is staging only.');}
 async function records(tx,zoneId){
  const z=(await tx.get(db.doc('campaignZones/'+zoneId))).data();if(!z)fail('not-found','Assignment unavailable.');
  const [c,k]=await Promise.all([tx.get(db.doc('campaigns/'+z.campaignId)),tx.get(db.doc('assignmentCompensations/'+zoneId))]);
  const campaign=c.data(),contract=k.data();
  if(!campaign||!coverage.applies(project,campaign)||z.groupAssignmentId||contract?.immutable!==true||contract.zoneId!==zoneId||contract.campaignId!==z.campaignId||
    contract.businessId!==z.businessId||contract.scalerId!==z.assignedScalerId||z.disputeOpen||z.settlementBlocked)fail('failed-precondition','This assignment needs authoritative review.');
  return {zone:z,campaign,contract};
 }
 async function evidence(tx,zoneId,z,sessionId){
  const ref=db.doc('trackingSessions/'+sessionId),s=(await tx.get(ref)).data();
  if(!s||s.zoneId!==zoneId||s.campaignId!==z.campaignId||s.scalerId!==z.assignedScalerId)fail('failed-precondition','Tracking identity does not match this assignment.');
  const chunkSnap=await tx.get(ref.collection('chunks').orderBy('startSequence'));
  const chunks=chunkSnap.docs.map(d=>d.data());let points=route.acceptedEvidence({...s,sessionId},chunks);
  // An intentional pause is also valid before two accepted fixes exist. Keep
  // coverage unknown; never fabricate progress or authorize a settlement.
  if(!points && chunks.length===Number(s.chunkCount||0)) {
    let next=1;const accepted=[];let valid=true;
    for(const c of chunks){
      if(c.sessionId!==sessionId||c.zoneId!==zoneId||c.scalerId!==s.scalerId||c.startSequence!==next||!Array.isArray(c.points)){valid=false;break;}
      for(const point of c.points){if(point.sequence!==next++){valid=false;break;}if(point.accepted===true)accepted.push(point);}
    }
    if(valid&&next-1===Number(s.pointCount||0)&&accepted.length<2)points=accepted;
  }
  if(!points)fail('failed-precondition','Saved GPS evidence needs reconciliation. Retry synchronization before pausing.');
  let estimate;
  try {estimate=coverage.coverage(z,points);}
  catch(_){estimate={state:'unavailable',coveragePercentage:null,reason:'Assigned route needs technical review.'};}
  return {session:s,estimate,evidenceHash:hash(chunks.map(c=>({start:c.startSequence,end:c.endSequence,digest:c.payloadDigest,points:c.points}))),
    routeHash:z.executionRoute?.routeHash||null,corridorHash:z.executionRoute?.corridorHash||null,pointCount:points.length};
 }
 function notify(tx,id,z,type,title,body,userId){tx.create(db.doc('notifications/'+id),{userId,type,title,body,read:false,
   campaignId:z.campaignId,zoneId:z.id,route:`/job-room/${z.id}`,createdAt:stamp()});}
 async function pause({zoneId,sessionId,expectedPointCount},actor){staging();return db.runTransaction(async tx=>{
  const {zone:z,contract}=await records(tx,zoneId);if(actor.uid!==z.assignedScalerId)fail('permission-denied','Only the assigned Scaler can pause work.');
  const pauseId=`${sessionId}_${Number(z.pauseCount||0)+1}`,existingId=z.intentionalPauseId;
  if(existingId&&z.status==='paused_work_window'){
    const prior=(await tx.get(db.doc('workPauses/'+existingId))).data();
    if(prior?.sessionId!==sessionId)fail('failed-precondition','The paused session changed.');
    return {...prior,status:'paused',resumeByMs:ms(prior.resumeBy)};
  }
  if(z.status!=='in_progress'||z.activeTrackingSessionId!==sessionId)fail('failed-precondition','Only active work can be paused.');
  const ev=await evidence(tx,zoneId,z,sessionId);
  if(ev.session.status!=='active'||Number(ev.session.pointCount)!==expectedPointCount)fail('failed-precondition','Finish syncing saved route points before pausing.');
  const pointerRef=db.doc('activeTrackingSessions/'+actor.uid),pointer=(await tx.get(pointerRef)).data();
  if(pointer?.sessionId!==sessionId)fail('failed-precondition','The active tracking session changed.');
  const deadline=Timestamp.fromMillis(clock()+24*60*60*1000),ref=db.doc('workPauses/'+pauseId);
  const snapshot={version:VERSION,pauseId,zoneId,campaignId:z.campaignId,businessId:z.businessId,scalerId:actor.uid,sessionId,
    state:'paused',pausedAt:stamp(),resumeBy:deadline,estimate:ev.estimate,evidenceHash:ev.evidenceHash,routeHash:ev.routeHash,
    corridorHash:ev.corridorHash,pointCount:ev.pointCount,contractHash:hash(contract),baseAmountCents:contract.baseAmountCents,
    bonusAmountCents:contract.bonusAmountCents||0,createdBy:actor.uid};
  tx.create(ref,snapshot);
  tx.update(db.doc('trackingSessions/'+sessionId),{status:'paused',pauseReason:'intentional_finish_later',pausedAt:stamp(),syncStatus:'paused_saved',updatedAt:stamp()});
  if(ev.session.currentSegmentId)tx.set(db.doc(`trackingSessions/${sessionId}/segments/${ev.session.currentSegmentId}`),
    {status:'paused',endedAt:stamp(),closeReason:'intentional_finish_later',updatedAt:stamp()},{merge:true});
  tx.delete(pointerRef);
  tx.update(db.doc('campaignZones/'+zoneId),{status:'paused_work_window',activeTrackingSessionId:FieldValue.delete(),gpsTracking:false,
    resumableTrackingSessionId:sessionId,intentionalPauseId:pauseId,pauseCount:FieldValue.increment(1),resumeDeadline:deadline,
    pausedAt:stamp(),pauseReason:'intentional_finish_later',updatedAt:stamp()});
  notify(tx,'work-paused_'+pauseId,{...z,id:zoneId},'work_paused','Scaler paused',
    'Progress is saved. Your Scaler has 24 hours to resume; no action is needed to allow this.',z.businessId);
  return {...snapshot,status:'paused',resumeByMs:deadline.toMillis()};
 });}
 async function resume(tx,zoneId,z,sessionId,actor){staging();
  const ref=db.doc('workPauses/'+z.intentionalPauseId),p=(await tx.get(ref)).data();
  if(!p||p.state!=='paused'||p.sessionId!==sessionId||p.zoneId!==zoneId||p.scalerId!==actor.uid||clock()>=ms(p.resumeBy))
    fail('failed-precondition','The resume window ended or work was reviewed. Open Job Room for review.');
  const offer=p.offerId?(await tx.get(db.doc('partialWorkOffers/'+p.offerId))).data():null;
  tx.update(ref,{state:'resumed',resumedAt:stamp()});
  if(offer?.state==='offered')tx.update(db.doc('partialWorkOffers/'+p.offerId),{state:'voided_on_resume',resolvedAt:stamp()});
 }
 async function read(zoneId,actor){staging();return db.runTransaction(async tx=>{
  const {zone:z,contract}=await records(tx,zoneId);
  if(actor.uid!==z.assignedScalerId&&actor.uid!==z.businessId&&!actor.isAdmin)fail('permission-denied','This assignment is private.');
  if(!z.intentionalPauseId)return null;
  const p=(await tx.get(db.doc('workPauses/'+z.intentionalPauseId))).data();if(!p)return null;
  const expired=clock()>=ms(p.resumeBy),offer=p.offerId?(await tx.get(db.doc('partialWorkOffers/'+p.offerId))).data():null;
  return {...p,resumeByMs:ms(p.resumeBy),state:p.state==='paused'&&expired?'incomplete_review':p.state,
    canResume:p.state==='paused'&&!expired&&z.status==='paused_work_window',
    securedBaseCents:p.estimate.state==='available'&&p.estimate.coveragePercentage>=80?contract.baseAmountCents:null,
    eligibleBonusCents:p.estimate.coveragePercentage>=95?(contract.bonusAmountCents||0):0,offer};
 });}
 async function expire(){staging();const docs=await db.collection('workPauses').where('state','==','paused').get();let changed=0;
  for(const pauseDoc of docs.docs){if(ms(pauseDoc.data().resumeBy)>clock())continue;
   const zoneId=pauseDoc.data().zoneId,zoneRef=db.doc('campaignZones/'+zoneId);
   await db.runTransaction(async tx=>{const z=(await tx.get(zoneRef)).data();if(z.status!=='paused_work_window'||z.pauseReason!=='intentional_finish_later'||ms(z.resumeDeadline)>clock())return;
    const p=(await tx.get(db.doc('workPauses/'+z.intentionalPauseId))).data();if(!p||p.state!=='paused')return;
    tx.update(zoneRef,{status:'incomplete_review',updatedAt:stamp()});tx.update(db.doc('workPauses/'+z.intentionalPauseId),{state:'incomplete_review',expiredAt:stamp()});
    notify(tx,'work-expired_'+z.intentionalPauseId,{...z,id:zoneId},'work_review_required','Incomplete work needs review','The resume window ended. Saved route evidence and compensation eligibility are preserved.',z.businessId);changed++;
   });
  }return {changed};
 }
 async function review({zoneId,action,amountCents,reason,offerId},actor){staging();return db.runTransaction(async tx=>{
  const {zone:z,contract,campaign}=await records(tx,zoneId);
  if(!z.intentionalPauseId)fail('failed-precondition','This assignment was not intentionally paused.');
  const pauseRef=db.doc('workPauses/'+z.intentionalPauseId),p=(await tx.get(pauseRef)).data();
  if(!p)fail('failed-precondition','Saved pause unavailable.');
  const business=actor.uid===z.businessId,scaler=actor.uid===z.assignedScalerId;
  if((['offer_partial','accept_current'].includes(action)&&!business)||(['accept_offer','decline_offer'].includes(action)&&!scaler))fail('permission-denied','This action requires the intended assignment participant.');
  if(!['offer_partial','accept_current','accept_offer','decline_offer'].includes(action))fail('invalid-argument','Choose a supported review action.');
  if(p.state==='settled'&&((business&&action==='accept_current')||(scaler&&action==='accept_offer'&&p.offerId===offerId)))return {alreadyProcessed:true,status:'settled'};
  if(!['paused_work_window','incomplete_review'].includes(z.status)||!['paused','incomplete_review'].includes(p.state))fail('failed-precondition','Work has resumed or already been reviewed.');
  const ev=await evidence(tx,zoneId,z,p.sessionId);
  if(ev.session.status!=='paused'||ev.evidenceHash!==p.evidenceHash||ev.routeHash!==p.routeHash||ev.corridorHash!==p.corridorHash||hash(contract)!==p.contractHash)fail('failed-precondition','Saved evidence or accepted terms changed. Technical review is required.');
  const percent=ev.estimate.coveragePercentage;
  if(ev.estimate.state!=='available'||!Number.isFinite(percent))fail('failed-precondition','Coverage needs technical review. No payment decision has been made.');
  if(action==='offer_partial'){
    if(percent>=80)fail('failed-precondition','Full accepted base is secured and cannot be reduced.');
    if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>contract.baseAmountCents||!String(reason||'').trim()||String(reason).length>1000)fail('invalid-argument','Enter a positive partial amount within base pay and a reason.');
    if(p.offerId){const old=(await tx.get(db.doc('partialWorkOffers/'+p.offerId))).data();if(old?.state==='offered')return old;}
    const id='partial_'+hash([p.pauseId,amountCents,reason]).slice(0,40),ref=db.doc('partialWorkOffers/'+id),prior=await tx.get(ref);
    if(prior.exists)fail('failed-precondition','This offer was already resolved.');
    const offer={offerId:id,version:VERSION,pauseId:p.pauseId,zoneId,campaignId:z.campaignId,businessId:z.businessId,scalerId:z.assignedScalerId,
      amountCents,reason:String(reason).trim(),evidenceHash:p.evidenceHash,contractHash:p.contractHash,state:'offered',createdAt:stamp(),offeredBy:actor.uid};
    tx.create(ref,offer);tx.update(pauseRef,{offerId:id});
    notify(tx,'partial-offer_'+id,{...z,id:zoneId},'partial_work_offer','Partial-work offer', 'Your Business offered payment for the saved partial work. Review the exact amount before accepting.',z.assignedScalerId);return offer;
  }
  let offer=null;
  if(action==='accept_offer'||action==='decline_offer'){
    if(!offerId||offerId!==p.offerId)fail('failed-precondition','That offer is not current.');
    offer=(await tx.get(db.doc('partialWorkOffers/'+offerId))).data();
    if(!offer||offer.state!=='offered'||offer.scalerId!==actor.uid||offer.pauseId!==p.pauseId||offer.evidenceHash!==ev.evidenceHash||offer.contractHash!==hash(contract))fail('failed-precondition','The offer needs review.');
    if(action==='decline_offer'){tx.update(db.doc('partialWorkOffers/'+offerId),{state:'declined',respondedAt:stamp()});return {status:'declined'};}
    if(percent>=80)fail('failed-precondition','A partial settlement cannot reduce secured base pay.');
  }else if(percent<80)fail('failed-precondition','Offer partial payment for Scaler acceptance below 80%.');
  const paymentId=z.fundingPaymentId||campaign.fundingPaymentId,payment=(await tx.get(db.doc('campaignPayments/'+(paymentId||'missing')))).data();
  if(!payment)fail('failed-precondition','Authoritative funding unavailable.');
  const base=offer?offer.amountCents:contract.baseAmountCents,bonus=!offer&&percent>=95?(contract.bonusAmountCents||0):0;
  const result=await finance.createService({db,FieldValue,project}).commit(tx,{zoneId,zone:z,contract,paymentId,payment,
    payout:{transferAmountCents:base+bonus,baseAmountCents:base,bonusAmountCents:bonus},actorUid:actor.actorUid||actor.uid,
    source:offer?'partial_settlement':'business_accepted_paused_work',evidence:{pauseId:p.pauseId,sessionId:p.sessionId,evidenceHash:p.evidenceHash,
      coveragePercentage:percent,offerId:offer?.offerId||null,scalerAcceptedBy:offer?actor.uid:null}});
  tx.update(pauseRef,{state:'settled',settledAt:stamp(),settledBy:actor.uid});
  tx.update(db.doc('trackingSessions/'+p.sessionId),{status:'closed_business_review',endedAt:stamp(),syncStatus:'closed',updatedAt:stamp()});
  if(offer)tx.update(db.doc('partialWorkOffers/'+offerId),{state:'accepted',acceptedBy:actor.uid,acceptedAt:stamp()});
  return result;
 });}
 return {pause,read,expire,review,resume};
}
module.exports={VERSION,DISCLOSURE,createService,ms};
