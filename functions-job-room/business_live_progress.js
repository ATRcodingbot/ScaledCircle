'use strict';
const {hash,acceptedEvidence}=require('./route_progress');
const {coverage,isCanvassing}=require('./canvassing_completion');
const iso=value=>value?.toDate?.().toISOString()||null;
const currentSession=(zone,sessionId)=>zone.activeTrackingSessionId===sessionId || (!zone.activeTrackingSessionId && (zone.routeId===sessionId || (zone.pauseReason==='intentional_finish_later' && zone.resumableTrackingSessionId===sessionId)));
function milestoneNames({status,coveragePercentage,reliable,bonusAmountCents,submitted}) {
 return [...(['active','completed'].includes(status)?['started']:[]),
  ...(reliable&&coveragePercentage>=80?['base80']:[]),
  ...(reliable&&coveragePercentage>=95&&bonusAmountCents>0?['bonus95']:[]),...(submitted?['submitted']:[])];
}
function createProgressService({db,FieldValue,now=Date.now}) {
 return {
  async project(sessionId,{readOnly=false}={}) {
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId))return {skipped:true};
   return db.runTransaction(async tx=>{
    const snapshot=await tx.get(db.doc(`trackingSessions/${sessionId}`)),session=snapshot.data();if(!session)return {skipped:true};
    const zoneRef=db.doc(`campaignZones/${session.zoneId}`),zone=(await tx.get(zoneRef)).data();
    if(!zone||zone.campaignId!==session.campaignId||zone.assignedScalerId!==session.scalerId||!currentSession(zone,sessionId))return {skipped:true};
    const campaign=(await tx.get(db.doc(`campaigns/${session.campaignId}`))).data();
    if(!campaign||campaign.businessId!==zone.businessId||!isCanvassing(campaign.campaignType||campaign.type))return {skipped:true};
    // Reads use the same accepted-evidence calculation without writing a projection.
    // Old/cancelled session events cannot replace the current assignment result.
    const [chunksSnapshot,contractSnapshot,notesSnapshot]=await Promise.all([
      tx.get(snapshot.ref.collection('chunks').orderBy('startSequence').limit(2000)),
      tx.get(db.doc(`assignmentCompensations/${session.zoneId}`)),
      tx.get(snapshot.ref.collection('workNotes').orderBy('createdAt','desc').limit(20))]);
    const contract=contractSnapshot.data()||{},chunks=chunksSnapshot.docs.map(d=>d.data());
    const accepted=acceptedEvidence({...session,sessionId},chunks)||[];
    const supportedPolicy=(process.env.GCLOUD_PROJECT==='scaledcircle-staging'||process.env.GOOGLE_CLOUD_PROJECT==='scaledcircle-staging'||contract.completionPolicyVersion==='CanvassingRoute80_95V1');
    const contractBound=supportedPolicy && contract.immutable===true && contract.zoneId===session.zoneId && contract.campaignId===session.campaignId && contract.scalerId===session.scalerId && contract.businessId===zone.businessId && Number.isSafeInteger(contract.baseAmountCents) && Number.isSafeInteger(contract.bonusAmountCents||0);
    let estimate={state:'calculating',coveragePercentage:null};
    try{estimate=coverage(zone,accepted);}catch(_){estimate={state:'unavailable',coveragePercentage:null,reason:'Route evidence needs review'};}
    const reliable=contractBound&&estimate.state==='available'&&zone.settlementBlocked!==true&&zone.disputeOpen!==true;
    const milestoneKey=hash({zoneId:session.zoneId,scalerId:session.scalerId,contract:contract.contractDigest||contract.acceptedOfferDigest||contract.createdAt?.toMillis?.()||contract.baseAmountCents});
    const milestones=milestoneNames({status:session.status,coveragePercentage:estimate.coveragePercentage,reliable,
      bonusAmountCents:contract.bonusAmountCents||0,submitted:zone.status==='submitted'});
    const path=accepted.filter((_,i)=>i%Math.max(1,Math.ceil(accepted.length/300))===0||i===accepted.length-1).map(p=>({latitude:p.latitude,longitude:p.longitude}));
    const result={businessId:zone.businessId,campaignId:session.campaignId,zoneId:session.zoneId,scalerId:session.scalerId,sessionId,
      state:session.status,startedAt:iso(session.startedAt),endedAt:iso(session.endedAt),lastAcceptedGpsAt:accepted.length?new Date(accepted.at(-1).timestampMs).toISOString():null,
      estimate,reliable,baseAmountCents:contract.baseAmountCents??null,bonusAmountCents:contract.bonusAmountCents??0,
      baseThresholdReached:reliable&&estimate.coveragePercentage>=80,bonusThresholdReached:reliable&&estimate.coveragePercentage>=95&&(contract.bonusAmountCents||0)>0,
      path,route:zone.executionRoute||null,corridor:zone.serviceArea||[],acceptedPointCount:accepted.length,
      notes:notesSnapshot.docs.map(d=>({kind:d.data().kind,note:d.data().note,createdAt:iso(d.data().createdAt)})),updatedAt:FieldValue.serverTimestamp()};
    if(readOnly)return {...result,updatedAt:iso(session.lastSyncAt),active:zone.activeTrackingSessionId===sessionId&&session.status==='active'};
    // Reuse the maintained submission notification identity across both producers.
    const notificationId=name=>name==='submitted'?`completion-submitted_${session.zoneId}`:`work_${milestoneKey}_${name}`;
    const notifications=await Promise.all(milestones.map(name=>tx.get(db.doc(`notifications/${notificationId(name)}`))));
    const legacySubmission=milestones.includes('submitted')
      ? await tx.get(db.doc(`notifications/zone_completion_${session.zoneId}`)) : null;
    const labels={started:['Work started','Your Scaler started the assigned route.'],base80:['80% route coverage reached','The base coverage threshold is satisfied. Completion and evidence checks still apply.'],bonus95:['95% route coverage reached','The accepted bonus coverage threshold is satisfied. Final evidence checks still apply.'],submitted:['Work submitted','The submission is ready for Business review.']};
    const active=zone.activeTrackingSessionId===sessionId&&session.status==='active';
    const fresh=accepted.length && now()-accepted.at(-1).timestampMs<=120000;
    const emitted=[];
    for(let i=0;i<milestones.length;i++)if(!notifications[i].exists){
      const name=milestones[i],label=labels[name];
      if(name==='submitted'&&legacySubmission?.exists)continue;
      // Late/out-of-order trigger delivery must never announce starting after submitting.
      const relevant=name==='submitted' ? zone.status==='submitted' : active&&fresh&&(name!=='started'||now()-(session.startedAt?.toMillis?.()||0)<=120000);
      if(relevant){tx.create(notifications[i].ref,{id:notificationId(name),deepLink:{destination:'job_room',zoneId:session.zoneId},channel:'in_app',userId:zone.businessId,businessId:zone.businessId,type:'work_milestone',milestone:name,title:label[0],message:label[1],campaignId:session.campaignId,zoneId:session.zoneId,read:false,createdAt:FieldValue.serverTimestamp()});emitted.push(name);}
    }
    tx.set(db.doc(`businessWorkProgress/${session.zoneId}`),result);
    return {updated:true,milestones:emitted};
   });
  },
  async note({uid,zoneId,kind,note}) {
   if(!['access','safety','note'].includes(kind)||typeof note!=='string'||!note.trim()||note.length>2000)throw new Error('invalid_work_note');
   return db.runTransaction(async tx=>{
    const zone=(await tx.get(db.doc(`campaignZones/${zoneId}`))).data();
    if(!zone||zone.assignedScalerId!==uid||!zone.activeTrackingSessionId)throw new Error('active_assignment_required');
    const sessionRef=db.doc(`trackingSessions/${zone.activeTrackingSessionId}`),session=(await tx.get(sessionRef)).data();
    if(session?.status!=='active'||session.scalerId!==uid||session.zoneId!==zoneId)throw new Error('active_assignment_required');
    if(Number(session.workNoteCount||0)>=50)throw new Error('work_note_limit');
    const point=session.lastEvidencePoint;
    const location=point?.accepted===true?{latitude:point.latitude,longitude:point.longitude,evidenceTimestampMs:point.timestampMs}:null;
    const noteRef=sessionRef.collection('workNotes').doc();
    tx.create(noteRef,{uid,zoneId,campaignId:zone.campaignId,sessionId:sessionRef.id,kind,note:note.trim(),location,createdAt:FieldValue.serverTimestamp()});
    tx.update(sessionRef,{notesUpdatedAt:FieldValue.serverTimestamp(),workNoteCount:FieldValue.increment(1)});
    return {saved:true,noteId:noteRef.id};
   });
  },
 };
}
module.exports={milestoneNames,currentSession,createProgressService};
