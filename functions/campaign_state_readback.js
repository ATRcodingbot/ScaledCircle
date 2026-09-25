'use strict';
// Read-only presentation. No reservation, provider mutation or start operation.
const funds=require('./campaign_fund_allocation');
const legal=require('./legal_consent');
const types=require('./canvassing_completion');
const TERMINAL=new Set(['completed','approved']);
function safeReason(error) {
  const reason=error?.reason||error?.message;
  if(reason==='legal_consent_required')return 'consent_required';
  if(reason==='campaign_funds_pending')return 'funds_pending';
  if(reason==='campaign_cash_protection_required')return 'funds_verification_required';
  if(reason==='assignment_reserve_required')return 'compensation_reserve_required';
  if(/material receipt/i.test(reason||''))return 'materials_required';
  if(/may only run between/i.test(reason||''))return 'outside_work_window';
  if(/deadline/i.test(reason||''))return 'deadline_passed';
  return 'work_start_requirements_not_met';
}
async function read({db,auth,Timestamp,HttpsError,input,scalerUid=null,checkoutAllowed=false,checkoutReason=null,loadProvider,now=Date.now}) {
  const legalService=legal.createLegalConsentService({db});
  const inspectStart=require('./campaign_start_readback')({db,Timestamp,HttpsError,legalService});
  return db.runTransaction(async tx=>{
    const campaign=(await tx.get(input.ref)).data();
    if(!campaign||campaign.businessId!==input.campaign.businessId)throw new HttpsError('permission-denied','Campaign access changed.');
    const query=db.collection('campaignZones').where('campaignId','==',input.campaignId).limit(101);
    const snapshots=await tx.get(query);
    if(snapshots.size>100)throw new HttpsError('unavailable','Campaign state requires review.');
    let zones=snapshots.docs.map(d=>({...d.data(),id:d.id}));
    if(scalerUid){zones=zones.filter(z=>z.assignedScalerId===scalerUid);if(!zones.length)throw new HttpsError('permission-denied','No current assignment in this campaign.');}
    const paymentId=campaign.fundingPaymentId;
    const payment=typeof paymentId==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(paymentId)?(await tx.get(db.doc('campaignPayments/'+paymentId))).data():null;
    let allocation=null;
    if(payment?.fundingAllocation)allocation=funds.view(paymentId,payment);
    const status=payment?.status||campaign.fundingStatus||'unfunded';
    const supported=types.isCanvassing(campaign.campaignType||campaign.type);
    const checkedAtMs=now(),zoneStates=[];
    let providerProof,providerError;
    for(const zone of zones){
      let state='awaiting_scaler',reason=null;
      if(TERMINAL.has(zone.status))state='completed';
      else if(['submitted','pending_review','awaiting_review'].includes(zone.status))state='submitted';
      else if(zone.status==='in_progress')state='in_progress';
      else if(zone.assignedScalerId){
        state='assignment_pending';
        const contract=(await tx.get(db.doc('assignmentCompensations/'+zone.id))).data();
        if(!contract?.immutable||!contract.acceptedAtMs)reason='assignment_acceptance_required';
        else if(!supported)reason='unsupported_campaign_type';
        else if(!['assigned','accepted','paused_work_window'].includes(zone.status))reason='assignment_state_changed';
        else try {
          const [actor,profile]=await Promise.all([auth.getUser(zone.assignedScalerId),tx.get(db.doc('users/'+zone.assignedScalerId))]);
          if(actor.disabled||!actor.emailVerified||profile.data()?.active!==true||profile.data()?.role!=='scaler')throw Error('scaler_account_unavailable');
          await legalService.requireCurrent({uid:zone.assignedScalerId,agreementTypes:legal.ROLE_REQUIREMENTS.scaler_tracking,transaction:tx});
          const pointer=(await tx.get(db.doc('activeTrackingSessions/'+zone.assignedScalerId))).data();
          if(pointer?.sessionId){const session=(await tx.get(db.doc('trackingSessions/'+pointer.sessionId))).data();if(['active','finalizing'].includes(session?.status))throw Error('tracking_session_active');}
          if(providerProof===undefined&&providerError===undefined){
            try {
              const records=await tx.get(db.collection('campaignPayments').limit(501));
              if(records.size>500)throw Error('inventory_unavailable');
              providerProof=require('./campaign_fund_protection').inspect({payment,...await loadProvider(payment),records:records.docs.map(d=>({id:d.id,data:d.data()})),nowMs:now()});
            }catch(error){providerError=error;}
          }
          if(providerError)throw providerError;
          const readOnly={get:async ref=>{
            const snapshot=await tx.get(ref);
            if(ref.path==='campaignPayments/'+paymentId)return {exists:snapshot.exists,data:()=>({...snapshot.data(),fundingProtection:providerProof})};
            return snapshot;
          }};
          await inspectStart(readOnly,{campaign,zone,context:{uid:zone.assignedScalerId},participant:null});
          state='ready';
        }catch(error){state='blocked';reason=safeReason(error);}
      }
      zoneStates.push({zoneId:zone.id,state,reason});
    }
    if(scalerUid&&allocation){
      const own=Object.values(payment.fundingAllocation.assignments).filter(a=>a.scalerId===scalerUid);
      allocation={workerReserveCents:own.reduce((s,a)=>s+a.reservedCents,0),workerEarnedCents:own.reduce((s,a)=>s+a.earnedCents,0),workerPaidCents:own.reduce((s,a)=>s+a.paidCents,0),fundingState:allocation.fundingState};
    }
    const issue=['disputed','refund_pending','refund_review_required','payment_failed'].includes(status)||['shortfall','disputed'].includes(allocation?.fundingState);
    let state=!supported?'unsupported':issue?'funding_issue':status==='payment_pending'?'payment_processing':status==='refunded'?'refunded':status!=='paid'?'payment_required':'funding_confirmed';
    if(supported&&!issue&&status==='paid'&&campaign.status!=='draft'){
      if(zoneStates.some(z=>z.state==='in_progress'))state='in_progress';
      else if(zoneStates.some(z=>z.state==='submitted'))state='submitted';
      else if(zoneStates.length&&zoneStates.every(z=>z.state==='completed'))state='completed';
      else if(zoneStates.some(z=>z.state==='ready'))state='ready';
      else if(zoneStates.some(z=>z.state==='blocked'))state='blocked';
      else if(zoneStates.some(z=>z.state==='assignment_pending'))state='assignment_pending';
      else state='awaiting_scaler';
    }
    if((allocation?.workerEarnedCents||0)>(allocation?.workerPaidCents||0)&&['completed','funding_confirmed','refunded'].includes(state))state='worker_payment_pending';
    return {status,checkoutAllowed:!scalerUid&&supported&&checkoutAllowed,allocation,
      eligibility:{version:1,campaignId:input.campaignId,state,reason:!supported?'unsupported_campaign_type':checkoutReason,checkedAtMs,expiresAtMs:checkedAtMs+15000,
        readyZoneCount:zoneStates.filter(z=>z.state==='ready').length,zones:zoneStates}};
  },{readOnly:true});
}
module.exports={read,safeReason};
