'use strict';
const m=require('./model'),g=require('./marketing_history_geometry');
const {assertOwnTeamClean}=require('./own_team_authority');
const VERSION='BusinessMarketingHistoryV1',READ_CAP=1000,ZONE_CAP=100;
const approved=value=>['approved','auto_approved'].includes(value);
function milliseconds(value){const n=typeof value?.toMillis==='function'?value.toMillis():value;return Number.isSafeInteger(n)?n:null;}
function metadata(campaign){return {campaignId:campaign.id,campaignName:String(campaign.campaignName||campaign.name||campaign.title||'Campaign').slice(0,240),campaignType:String(campaign.campaignType||campaign.type||'').slice(0,100),materialType:String(campaign.materialType||campaign.marketingMaterialType||'').slice(0,100)};}
function marketplaceRecord(businessId,campaign,zone,completion,atMs,settlement=null){
 if(campaign.businessId!==businessId||zone.businessId!==businessId||zone.campaignId!==campaign.id||
  (Object.hasOwn(campaign,'executionMode')&&campaign.executionMode!=='marketplace'))return null;
 if(!['completed','paid'].includes(zone.status)||!approved(zone.reviewStatus)||zone.redoRequired===true||zone.disputeOpen===true||zone.settlementBlocked===true)return null;
 // Paused/partial monetary settlement can close a zone without marketing the
 // whole polygon. It provides coverage percentages, not a completed polygon.
 if((zone.reviewMode&&zone.reviewMode!=='ordinary')||(completion?.reviewMode&&completion.reviewMode!=='ordinary'))return null;
 if(zone.reserveSettlementId&&(!settlement||settlement.id!==zone.reserveSettlementId||settlement.zoneId!==zone.id||
  settlement.campaignId!==campaign.id||settlement.businessId!==businessId||settlement.scalerId!==zone.assignedScalerId||
  !['ordinary_review','completed_task_review'].includes(settlement.source)))return null;
 if(!completion||completion.id!==zone.submittedCompletionId||completion.zoneId!==zone.id||completion.campaignId!==campaign.id||
  completion.businessId!==businessId||!['approved','completed'].includes(completion.status)||!approved(completion.reviewStatus))return null;
 if(zone.groupAssignmentId){if(completion.groupAssignmentId!==zone.groupAssignmentId)return null;}
 else if(!zone.assignedScalerId||completion.scalerId!==zone.assignedScalerId)return null;
 const completedAtMs=milliseconds(completion.completedAt);
 if(completedAtMs===null||completedAtMs>atMs||completedAtMs<Date.UTC(2000,0,1))return null;
 const geometryParts=g.parts([{points:zone.serviceArea}]);g.shape(geometryParts);
 return {schemaVersion:VERSION,businessId,workspaceId:businessId,...metadata(campaign),executionMode:'marketplace',
  completedAtMs,geometryParts,geometryDigest:m.hash(geometryParts),zoneIds:[zone.id],completionId:completion.id,
  completionEvidenceSource:'authoritative_zone_review',completionAuthority:{zoneReviewStatus:zone.reviewStatus,completionReviewStatus:completion.reviewStatus,
   ...(settlement?{reserveSettlementId:settlement.id,settlementSource:settlement.source}:{})},
  recordedAtMs:atMs,recordedBy:'server_projection',immutable:true};
}
function summarize({businessId,proposedParts,records,nowMs}){
 const subject=g.shape(proposedParts),windowStartMs=g.twelveMonthsBefore(nowMs),recent=[],historical=[],intersections=[];
 for(const row of records){
  // A corrupt cross-tenant row never becomes warning metadata or geometry.
  if(row.businessId!==businessId||row.workspaceId!==businessId)m.fail('failed-precondition','Marketing history ownership needs review.');
  if(row.schemaVersion!==VERSION||row.immutable!==true||!['business_reported','authoritative_zone_review'].includes(row.completionEvidenceSource)||
   !Number.isSafeInteger(row.completedAtMs)||row.completedAtMs>nowMs)m.fail('failed-precondition','Marketing history evidence needs review.');
  const hit=g.overlap(subject,g.shape(row.geometryParts));if(!hit.meaningful)continue;
  const result={id:row.id,...metadata({...row,id:row.campaignId}),executionMode:row.executionMode,completionEvidenceSource:row.completionEvidenceSource,
   completedAtMs:row.completedAtMs,zoneIds:row.zoneIds||[],geometryParts:row.geometryParts,zoneWork:row.zoneWork||[],areaSnapshots:row.areaSnapshots||[],attributionRevision:row.attributionRevision||0};
  if(row.completedAtMs>=windowStartMs){recent.push(result);intersections.push(hit.intersection);}else historical.push(result);
 }
 const sort=(a,b)=>b.completedAtMs-a.completedAtMs||a.id.localeCompare(b.id);recent.sort(sort);historical.sort(sort);
 return {state:recent.length?'marketed_recently':historical.length?'marketed_historically':'never_marketed',warning:recent.length>0,
  mostRecentCompletedAtMs:recent[0]?.completedAtMs??historical[0]?.completedAtMs??null,
  overlapPercent:g.unionPercent(subject,intersections),recent,historical,canContinue:true,threshold:g.THRESHOLD,
  windowStartMs,checkedAtMs:nowMs,geometryDigest:m.hash(g.parts(proposedParts)),inventoryComplete:true};
}
function createHistoryService({db,FieldValue,authority,now=Date.now}){
 const consent=require('./shared/legal_consent').createLegalConsentService({db,FieldValue});
 const history=b=>db.collection(`businessOperations/${m.id(b)}/marketingHistory`);
 const rows=s=>s.docs.map(d=>({...d.data(),id:d.id}));
 function permission(a){if(a.internal||(!a.isOwner&&!a.permissions.includes('campaigns')))m.fail('permission-denied','Campaign access for this Business is required.');}
 async function bounded(tx,query,cap=READ_CAP){const s=await tx.get(query.limit(cap+1));if(s.size>cap)m.fail('resource-exhausted','Marketing history is too large to compare safely. No partial result was returned.');return rows(s);}
 async function campaignAndZones(tx,a,id){
  const c=await tx.get(db.doc('campaigns/'+m.id(id)));if(!c.exists)m.fail('not-found','Campaign not found.');
  if(c.data().businessId!==a.businessId)m.fail('permission-denied','Choose a campaign from your Business.');
  const zones=await bounded(tx,db.collection('campaignZones').where('campaignId','==',id),ZONE_CAP);
  if(zones.some(z=>z.businessId!==a.businessId))m.fail('permission-denied','Saved zone ownership needs review.');
  return {campaign:{...c.data(),id:c.id},zones:zones.sort((x,y)=>x.id.localeCompare(y.id))};
 }
 async function marketingAreaHistory(request){
  const input=request.data?.input||{};m.strict(input,['campaignId','proposedGeometry']);const initial=await authority(request);permission(initial);
  return db.runTransaction(async tx=>{
   const a=await authority(request,{transaction:tx});permission(a);
   const {campaign,zones}=await campaignAndZones(tx,a,m.id(input.campaignId)),atMs=now();
   const proposedParts=input.proposedGeometry?[{points:input.proposedGeometry}]:campaign.serviceArea?.length?[{points:campaign.serviceArea}]:zones.map(z=>({points:z.serviceArea}));g.shape(proposedParts);
   const existing=await bounded(tx,history(a.businessId)),allZones=await bounded(tx,db.collection('campaignZones').where('businessId','==',a.businessId));
   const available=new Map(existing.map(r=>[r.id,r])),campaigns=new Map([[campaign.id,campaign]]),pending=[];
   for(const zone of allZones){
    if(!['completed','paid'].includes(zone.status)||!approved(zone.reviewStatus))continue;
    if(!zone.campaignId||!zone.submittedCompletionId)m.fail('failed-precondition','Completed zone evidence needs review before marketing history can be classified.');
    const historyId='marketplace_'+m.hash([zone.id,zone.submittedCompletionId]);if(available.has(historyId))continue;
    let c=campaigns.get(zone.campaignId);if(!c){const snap=await tx.get(db.doc('campaigns/'+m.id(zone.campaignId)));c=snap.exists?{...snap.data(),id:snap.id}:null;campaigns.set(zone.campaignId,c);}
    if(!c||c.businessId!==a.businessId)m.fail('failed-precondition','Completed campaign ownership needs review.');
    const cs=await tx.get(db.doc('campaignCompletions/'+m.id(zone.submittedCompletionId)));
    const ss=zone.reserveSettlementId?await tx.get(db.doc('campaignSettlements/'+m.id(zone.reserveSettlementId))):null;
    const record=marketplaceRecord(a.businessId,c,zone,cs.exists?{...cs.data(),id:cs.id}:null,atMs,ss?.exists?{...ss.data(),id:ss.id}:null);
    if(!record)m.fail('failed-precondition','Approved completion evidence needs review before marketing history can be classified.');
    const value={id:historyId,...record};available.set(historyId,value);pending.push(value);
   }
   for(const [id,row] of available)if(row.executionMode==='own_team'){
    const head=(await tx.get(db.doc(`businessOperations/${a.businessId}/marketingHistoryAttribution/${id}`))).data();
    available.set(id,require('./own_team_work').effective(row,head));
   }
   const result=summarize({businessId:a.businessId,proposedParts,records:[...available.values()],nowMs:atMs});
   for(const {id,...record}of pending)tx.create(history(a.businessId).doc(id),{...record,recordedAt:FieldValue.serverTimestamp()});
   return result;
  });
 }
 async function markMarketingComplete(request){
  const input=request.data?.input||{};m.strict(input,['campaignId','completedAtMs','confirmed','wholeTerritory','zoneIds','zoneWork','expectedAreaDigests']);
  const initial=await authority(request,{write:false});permission(initial);const requestId=m.id(request.data?.requestId);
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(requestId)||input.confirmed!==true||typeof input.wholeTerritory!=='boolean')m.fail('invalid-argument','Confirm the completed marketing date and saved geography.');
  const ids=input.zoneIds||[];if(!Array.isArray(ids)||ids.length>ZONE_CAP||new Set(ids).size!==ids.length) m.fail('invalid-argument','Choose saved zones once each.');ids.forEach(m.id);
  if(input.wholeTerritory?ids.length>0:ids.length===0)m.fail('invalid-argument','Choose the whole saved territory or the saved zones actually completed.');
  const fingerprint=m.hash(input),historyId='own_team_'+m.hash([initial.actorUid,requestId]);
  return db.runTransaction(async tx=>{
   const a=await authority(request,{transaction:tx,write:false});permission(a);
   await consent.requireCurrent({uid:a.actorUid,agreementTypes:['terms','privacy'],transaction:tx});
   const {campaign,zones}=await campaignAndZones(tx,a,m.id(input.campaignId));
   const inventories={payments:await bounded(tx,db.collection('campaignPayments').where('campaignId','==',campaign.id),1),contracts:await bounded(tx,db.collection('assignmentCompensations').where('campaignId','==',campaign.id),1),assignments:await bounded(tx,db.collection(`campaigns/${campaign.id}/assignedScalers`),1)};
   assertOwnTeamClean(campaign,zones,inventories);
   const prior=await bounded(tx,history(a.businessId).where('campaignId','==',campaign.id)),replayDoc=await tx.get(history(a.businessId).doc(historyId)),replay=replayDoc.data();
   if(prior.some(r=>r.businessId!==a.businessId||r.workspaceId!==a.businessId||r.executionMode!=='own_team'||r.completionEvidenceSource!=='business_reported'||r.immutable!==true))m.fail('failed-precondition','This campaign completion history needs review.');
   if(replay){if(replay.requestFingerprint!==fingerprint)m.fail('already-exists','That request already recorded different completion details.');return {recorded:true,historyId,completedAtMs:replay.completedAtMs,completionEvidenceSource:'business_reported',duplicate:true,campaignStatus:campaign.status};}
   if(!['own_team_scheduled','own_team_in_progress'].includes(campaign.status))m.fail('failed-precondition','Schedule this own-team campaign before marking the actual marketing complete.');
   const atMs=now(),createdAtMs=milliseconds(campaign.createdAtMs)??milliseconds(campaign.createdAt);
   if(!Number.isSafeInteger(input.completedAtMs)||input.completedAtMs<Date.UTC(2000,0,1)||input.completedAtMs>atMs||(createdAtMs!==null&&input.completedAtMs<createdAtMs))m.fail('invalid-argument','Choose the actual completion date after campaign creation and no later than today.');
   if(ids.some(id=>!zones.some(z=>z.id===id)))m.fail('permission-denied','Choose saved zones from this campaign and Business.');
   if(input.wholeTerritory&&campaign.serviceArea?.length&&zones.length&&!g.containedParts(zones.map(z=>({points:z.serviceArea})),[{points:campaign.serviceArea}]))m.fail('failed-precondition','Some saved zones are outside the current campaign territory. Confirm the actual saved zones or review the campaign area before completing the whole territory.');
   const selected=zones.filter(z=>ids.includes(z.id)),geometryParts=g.parts(input.wholeTerritory?(campaign.serviceArea?.length?[{points:campaign.serviceArea}]:zones.map(z=>({points:z.serviceArea}))):selected.map(z=>({points:z.serviceArea})));g.shape(geometryParts);
   if(input.expectedAreaDigests!==undefined){
    const expected=input.expectedAreaDigests;
    if(!expected||typeof expected!=='object'||Array.isArray(expected))m.fail('invalid-argument','Check the saved area version.');
    for(const [id,digest] of Object.entries(expected)){
     const z=zones.find(z=>z.id===id);
     if(id!=='territory'&&!z||id==='territory'&&zones.length||!input.wholeTerritory&&!ids.includes(id))m.fail('invalid-argument','Choose a selected saved area.');
     const current=g.parts([{points:id==='territory'?campaign.serviceArea:z.serviceArea}]);
     if(digest!==m.hash(current))m.fail('aborted','The saved boundary changed. Review it before recording work.');
    }
   }
   const previousZones=new Set(prior.filter(r=>r.completionEvidenceSource==='business_reported').flatMap(r=>r.zoneIds||[]));
   if(!input.wholeTerritory&&ids.some(id=>previousZones.has(id)))m.fail('already-exists','One of these saved zones already has a completion record.');
   const completedZoneIds=input.wholeTerritory?zones.map(z=>z.id):[...previousZones,...ids],allComplete=input.wholeTerritory||(zones.length>0&&zones.every(z=>completedZoneIds.includes(z.id)));
   let scheduleItem=null,scheduleRef=null;
   if(allComplete&&campaign.scheduleItemId){
    scheduleRef=db.doc(`businessOperations/${a.businessId}/items/${m.id(campaign.scheduleItemId)}`);
    const saved=await tx.get(scheduleRef);scheduleItem=saved.data();
    if(!saved.exists||scheduleItem.businessId!==a.businessId||scheduleItem.sourceKind!=='own_team_campaign'||scheduleItem.campaignId!==campaign.id)m.fail('failed-precondition','The linked campaign schedule needs review.');
   }
   const recordedZoneIds=input.wholeTerritory?zones.map(z=>z.id):ids;
   const roster=await require('./people_roster').createRoster({db})(a,tx);
   const zoneWork=require('./own_team_work').snapshotWork(input.zoneWork,roster,recordedZoneIds.length?recordedZoneIds:['territory'],input.completedAtMs);
   const areaSnapshots=zones.filter(z=>recordedZoneIds.includes(z.id)).map(z=>({zoneId:z.id,name:z.zoneName||'Saved area',geometryParts:g.parts([{points:z.serviceArea}]),geometryDigest:m.hash(g.parts([{points:z.serviceArea}]))}));
   const record={schemaVersion:VERSION,businessId:a.businessId,workspaceId:a.businessId,...metadata(campaign),executionMode:'own_team',
    completedAtMs:input.completedAtMs,geometryParts,geometryDigest:m.hash(geometryParts),zoneIds:input.wholeTerritory?zones.map(z=>z.id):[...ids].sort(),wholeTerritory:input.wholeTerritory,
    zoneWork,areaSnapshots,completionEvidenceSource:'business_reported',confirmed:true,recordedBy:a.actorUid,recordedAtMs:atMs,immutable:true,requestFingerprint:fingerprint};
   tx.create(history(a.businessId).doc(historyId),{...record,recordedAt:FieldValue.serverTimestamp()});
   const campaignStatus=allComplete?'own_team_completed':campaign.status;
   tx.update(db.doc('campaigns/'+campaign.id),{status:campaignStatus,marketingCompletion:{state:allComplete?'completed':'partially_completed',completionEvidenceSource:'business_reported',lastCompletedAtMs:Math.max(input.completedAtMs,...prior.map(r=>r.completedAtMs)),completedZoneIds:[...new Set(completedZoneIds)].sort(),updatedBy:a.actorUid,updatedAtMs:atMs},updatedAt:FieldValue.serverTimestamp()});
   if(scheduleRef)tx.update(scheduleRef,{status:'done',version:(scheduleItem.version||0)+1,updatedAtMs:atMs,updatedBy:a.actorUid});
   return {recorded:true,historyId,completedAtMs:record.completedAtMs,completionEvidenceSource:'business_reported',campaignStatus,allComplete};
  });
 }
 async function execute(request){if(request.data?.operation==='marketingAreaHistory')return marketingAreaHistory(request);if(request.data?.operation==='markMarketingComplete')return markMarketingComplete(request);m.fail('invalid-argument','Choose a supported marketing history operation.');}
 return {execute,marketingAreaHistory,markMarketingComplete};
}
module.exports={VERSION,marketplaceRecord,summarize,createHistoryService};
