'use strict';
const policy=require('./production_campaign_policy');
const contracts=require('./production_canvassing_contract');
const coverage=require('./canvassing_completion');
const {acceptedEvidence}=require('./route_progress');
async function read({db,zoneId,uid,isAdmin=false}) {
 return db.runTransaction(async tx=>{
  const zone=(await tx.get(db.doc('campaignZones/'+zoneId))).data();
  if(!zone)return null;
  const campaign=(await tx.get(db.doc('campaigns/'+zone.campaignId))).data();
  if(!campaign||campaign.businessId!==zone.businessId||!policy.applies(campaign))return null;
  if(!isAdmin&&uid!==zone.businessId&&!(uid===zone.assignedScalerId&&
    ['assigned','accepted','in_progress','paused_work_window','submitted','completed','approved'].includes(zone.status)))return null;
  const contract=(await tx.get(db.doc('assignmentCompensations/'+zoneId))).data();
  if(!contract)return null;
  const sessions=await tx.get(db.collection('trackingSessions').where('zoneId','==',zoneId));
  const selected=sessions.docs.filter(d=>d.data().campaignId===zone.campaignId&&d.data().scalerId===zone.assignedScalerId&&d.data().status!=='cancelled')
    .sort((a,b)=>(b.data().startedAt?.toMillis?.()||0)-(a.data().startedAt?.toMillis?.()||0))[0];
  const session={...(selected?.data()||{}),sessionId:selected?.id};
  const chunks=selected?(await tx.get(selected.ref.collection('chunks'))).docs.map(d=>d.data()):[];
  const marks=selected?(await tx.get(selected.ref.collection('checkpoints'))).docs.map(d=>d.data()):[];
  const notes=selected?(await tx.get(selected.ref.collection('workNotes').orderBy('createdAt','desc').limit(20))).docs.map(d=>d.data()):[];
  const route=session.routeId?(await tx.get(db.doc('campaignRoutes/'+session.routeId))).data():{};
  const completions=await tx.get(db.collection('campaignCompletions').where('zoneId','==',zoneId));
  const pointer=(await tx.get(db.doc('activeTrackingSessions/'+zone.assignedScalerId))).data();
  const assessment=coverage.assess({...zone,id:zoneId},session,chunks,route||{});
  let evaluated;
  try { evaluated=contracts.evaluate({contract,zone:{...zone,id:zoneId},routeAuthority:zone.coverageAuthority,
    session,chunks,route:route||{},accessIssue:zone.reviewMode==='access_exception'}); }
  catch(_) { evaluated=coverage.decision({coverage:assessment.estimate,baseAmountCents:contract.baseAmountCents,
    bonusAmountCents:contract.bonusAmountCents,authorityValid:false,technicalIssue:'immutable_contract_requires_review'}); }
  if(zone.settlementBlocked===true||zone.disputeOpen===true||pointer?.sessionId===session.sessionId&&!!session.sessionId) {
    evaluated=coverage.decision({coverage:assessment.estimate,baseAmountCents:contract.baseAmountCents,
      bonusAmountCents:contract.bonusAmountCents,authorityValid:false,finalized:false});
    evaluated.reason='Assignment finalization or an open review hold must be resolved before payment approval.';
  }
  const points=selected?(acceptedEvidence(session,chunks)||[]):[];
  return {estimate:assessment.estimate,policy:evaluated,path:points.map(p=>({latitude:p.latitude,longitude:p.longitude})),
    corridor:zone.serviceArea,route:zone.executionRoute,proofCount:points.length,
    checkpoints:marks.map(p=>({latitude:p.latitude??null,longitude:p.longitude??null,createdAt:p.createdAt??null})),
    workNotes:notes.map(n=>({kind:n.kind,note:n.note,createdAt:n.createdAt?.toDate?.().toISOString()||null})),
    accessExceptions:completions.docs.filter(d=>d.data().scalerId===zone.assignedScalerId).map(d=>d.data().accessException).filter(Boolean),
    startedAt:session.startedAt?.toDate?.().toISOString()||null,endedAt:session.endedAt?.toDate?.().toISOString()||null,
    trackingActive:session.status==='active',sessionStatus:session.status||'not_started',
    historicalCalculatedAmountCents:zone.completionPolicyVersion&&zone.completionPolicyVersion!==coverage.VERSION?zone.calculatedTransferAmountCents??null:null};
 });
}
module.exports={read};
