"use strict";
const m=require('./model');
const {createRoster}=require('./people_roster');
const permission=a=>{if(a.internal||(!a.isOwner&&!a.permissions.includes('campaigns')))m.fail('permission-denied','Campaign access for this Business is required.');};
function snapshotWork(input, roster, areas, completedAtMs) {
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>100)m.fail('invalid-argument','Choose the completed areas.');
 const seen=new Set();
 return input.map(row=>{
  m.strict(row,['zoneId','personIds','notes']);const zoneId=m.id(row.zoneId);
  if(seen.has(zoneId)||!areas.includes(zoneId))m.fail('invalid-argument','Choose each recorded area once.');seen.add(zoneId);
  const ids=m.people(row.personIds||[]),resolved=new Set();
  const people=ids.map(id=>{const person=roster.find(p=>p.id===id&&p.status!=='inactive');
   if(!person)m.fail('permission-denied','Choose an active person from this Business.');
   const identity=person.linkedUid?'user:'+person.linkedUid:(person.personIdentity||id);
   if(resolved.has(identity))m.fail('invalid-argument','Choose each person once.');resolved.add(identity);
   return {id:person.id,name:m.text(person.name,120,true),personIdentity:identity};
  });
  return {zoneId,people,workedAtMs:completedAtMs,notes:m.text(row.notes||'',2000)};
 });
}
function effective(record,head) {
 if(head&&(head.businessId!==record.businessId||head.historyId!==record.id||head.geometryDigest!==record.geometryDigest))m.fail('failed-precondition','Work attribution needs review.');
 return {...record,zoneWork:head?.zoneWork||record.zoneWork||[],attributionRevision:head?.revision||0};
}
function createService({db,FieldValue,authority,now=Date.now}) {
 const root=b=>db.doc('businessOperations/'+m.id(b)),roster=createRoster({db});
 const consent=require('./shared/legal_consent').createLegalConsentService({db,FieldValue});
 const col=(b,n)=>root(b).collection(n);
 async function bounded(tx,query){const s=await tx.get(query.limit(101));if(s.size>100)m.fail('resource-exhausted','Too many area records for this view.');return s.docs.map(d=>({...d.data(),id:d.id}));}
 async function loadCampaign(tx,a,id){const s=await tx.get(db.doc('campaigns/'+m.id(id)));if(!s.exists)m.fail('not-found','Campaign not found.');const c={...s.data(),id:s.id};if(c.businessId!==a.businessId)m.fail('permission-denied','Choose your Business campaign.');if(c.executionMode!=='own_team')m.fail('failed-precondition','This record is only for My Own Team work.');return c;}
 async function context(request){
  const input=request.data.input||{};m.strict(input,['campaignId']);
  return db.runTransaction(async tx=>{const a=await authority(request,{transaction:tx});permission(a);const c=await loadCampaign(tx,a,input.campaignId);
   const zones=await bounded(tx,db.collection('campaignZones').where('campaignId','==',c.id));
   if(zones.some(z=>z.businessId!==a.businessId))m.fail('permission-denied','Area ownership needs review.');
   const records=await bounded(tx,col(a.businessId,'marketingHistory').where('campaignId','==',c.id));
   const amendments=await bounded(tx,col(a.businessId,'marketingHistoryAmendments').where('campaignId','==',c.id));
   const people=await roster(a,tx),work=[];
   for(const r of records){if(r.businessId!==a.businessId||r.workspaceId!==a.businessId||r.executionMode!=='own_team'||r.completionEvidenceSource!=='business_reported')m.fail('failed-precondition','Completion ownership needs review.');
    const head=(await tx.get(col(a.businessId,'marketingHistoryAttribution').doc(r.id))).data();const e=effective(r,head);
    work.push({id:r.id,zoneIds:r.zoneIds,wholeTerritory:r.wholeTerritory,completedAtMs:r.completedAtMs,geometryDigest:r.geometryDigest,
     areaSnapshots:r.areaSnapshots||[],zoneWork:e.zoneWork,attributionRevision:e.attributionRevision,recordedBy:r.recordedBy,recordedAtMs:r.recordedAtMs,
     amendments:amendments.filter(v=>v.historyId===r.id).sort((x,y)=>x.revision-y.revision).map(v=>({revision:v.revision,recordedBy:v.recordedBy,recordedAtMs:v.recordedAtMs,before:v.before,after:v.after}))});
   }
   let campaignAssignedPeople=[];
   if(c.scheduleItemId){
    const item=(await tx.get(col(a.businessId,'items').doc(m.id(c.scheduleItemId)))).data();
    if(!item||item.businessId!==a.businessId||item.campaignId!==c.id||item.sourceKind!=='own_team_campaign')m.fail('failed-precondition','The linked schedule needs review.');
    campaignAssignedPeople=(item.assignedPeople||[]).map(id=>({id,name:people.find(p=>p.id===id)?.name||'Former team member'}));
   }
   return {businessId:a.businessId,campaignId:c.id,campaignAssignedPeople,canComplete:['own_team_scheduled','own_team_in_progress'].includes(c.status),
    canAddPerson:a.isOwner||a.permissions.includes('assignPeople'),people:people.filter(p=>p.status!=='inactive'),records:work,
    areas:zones.length?zones.map(z=>({id:z.id,name:z.zoneName||'Area',geometryDigest:m.hash(require('./marketing_history_geometry').parts([{points:z.serviceArea}])),assignedPeople:(z.assignedPeople||[]).map(id=>({id,name:people.find(p=>p.id===id)?.name||'Former team member'}))})): [{id:'territory',name:'Campaign area',geometryDigest:m.hash(require('./marketing_history_geometry').parts([{points:c.serviceArea}])),assignedPeople:[]}]};
  });
 }
 async function amend(request){
  const input=request.data.input||{};m.strict(input,['campaignId','historyId','expectedRevision','zoneWork']);
  const requestId=m.id(request.data.requestId);if(!/^[a-zA-Z0-9_-]{16,128}$/.test(requestId))m.fail('invalid-argument','Use a stable amendment request.');
  const fingerprint=m.hash(input);
  return db.runTransaction(async tx=>{const a=await authority(request,{transaction:tx,write:false});permission(a);
   await consent.requireCurrent({uid:a.actorUid,agreementTypes:['terms','privacy'],transaction:tx});
   const c=await loadCampaign(tx,a,input.campaignId),ref=col(a.businessId,'marketingHistory').doc(m.id(input.historyId));
   const r=(await tx.get(ref)).data();if(!r||r.businessId!==a.businessId||r.workspaceId!==a.businessId||r.campaignId!==c.id||r.executionMode!=='own_team'||r.completionEvidenceSource!=='business_reported'||r.immutable!==true)m.fail('permission-denied','Choose your own-team completion record.');
   const headRef=col(a.businessId,'marketingHistoryAttribution').doc(ref.id),head=(await tx.get(headRef)).data();
   const auditRef=col(a.businessId,'marketingHistoryAmendments').doc(m.hash([a.actorUid,requestId])),prior=(await tx.get(auditRef)).data();
   if(prior){if(prior.requestFingerprint!==fingerprint)m.fail('already-exists','This request has different amendment details.');return {saved:true,duplicate:true,revision:prior.revision};}
   const before=effective({...r,id:ref.id},head);if(input.expectedRevision!==before.attributionRevision)m.fail('aborted','Attribution changed. Reload before correcting it.');
   const people=await roster(a,tx);
   // Retain historical snapshots for inactive/renamed people already on this
   // record; newly added people must still resolve in the current workspace.
   const retained=before.zoneWork.flatMap(w=>w.people||[]);
   const eligible=[...people.filter(p=>!retained.some(r=>r.id===p.id)),...retained.map(p=>({...people.find(current=>current.id===p.id),...p,status:'active'}))];
   const changed=snapshotWork(input.zoneWork,eligible,r.zoneIds?.length?r.zoneIds:['territory'],r.completedAtMs);
   const zoneWork=[...before.zoneWork.filter(w=>!changed.some(n=>n.zoneId===w.zoneId)),...changed].sort((x,y)=>x.zoneId.localeCompare(y.zoneId));
   const revision=before.attributionRevision+1,at=now();
   tx.create(auditRef,{businessId:a.businessId,campaignId:c.id,historyId:ref.id,geometryDigest:r.geometryDigest,revision,
    before:before.zoneWork,after:zoneWork,recordedBy:a.actorUid,recordedAtMs:at,requestFingerprint:fingerprint,recordedAt:FieldValue.serverTimestamp()});
   tx.set(headRef,{businessId:a.businessId,campaignId:c.id,historyId:ref.id,geometryDigest:r.geometryDigest,revision,zoneWork,updatedBy:a.actorUid,updatedAtMs:at});
   return {saved:true,revision,financialEffect:false};
  });
 }
 return {execute:request=>request.data.operation==='ownTeamAreaWork'?context(request):amend(request)};
}
module.exports={snapshotWork,effective,createService};
