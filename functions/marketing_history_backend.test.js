'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {createAuthority}=require('../functions-business-operations/authority'),{createHistoryService}=require('../functions-business-operations/marketing_history');
const {createWorkspaceService,PRESETS}=require('./business_workspace');
const {mapRecord}=require('../functions-business-operations/campaign_map_record');
const now=Date.UTC(2026,8,26,15),day=86400000;let app,db,auth,authority,service,workspace,seq=0;
const box=(x=-76)=>[{latitude:39,longitude:x},{latitude:39,longitude:x+.01},{latitude:39.01,longitude:x+.01},{latitude:39.01,longitude:x}];
before(()=>{assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);app=initializeApp({projectId:'demo-marketing-history'},'marketing-history');db=getFirestore(app);auth=getAuth(app);authority=createAuthority({db,auth,FieldValue,Timestamp,project:'demo-marketing-history',now:()=>now});service=createHistoryService({db,FieldValue,authority,now:()=>now});workspace=createWorkspaceService({db,auth,FieldValue,Timestamp});});
after(async()=>{if(db)await db.terminate();if(app)await deleteApp(app);});
async function owner(){const uid='history_'+(++seq)+'_'+crypto.randomUUID().slice(0,8);await auth.createUser({uid,email:uid+'@example.test',emailVerified:true});await db.doc('users/'+uid).set({role:'business',active:true,name:uid,email:uid+'@example.test'});await db.doc('businessSubscriptions/'+uid).set({plan:'growth',status:'active',expiresAt:Timestamp.fromMillis(now+30*day)});for(const [type,version]of [['terms','terms-2026-08-v1'],['privacy','privacy-2026-08-v1']])await db.doc(`legalConsents/${uid}_${type}_${version}`).set({uid,agreementType:type,agreementVersion:version,acceptedAt:Timestamp.now()});return uid;}
const request=(b,operation,input,uid=b,requestId=crypto.randomUUID())=>({auth:uid?{uid}:null,data:{businessId:b,operation,input,requestId}});
const call=(b,op,input,uid=b,id)=>service.execute(request(b,op,input,uid,id));
async function campaign(b,extra={}){const id='campaign_'+crypto.randomUUID();await db.doc('campaigns/'+id).set({businessId:b,campaignName:'Controlled marketing campaign',campaignType:'door_hanger_distribution',materialType:'door_hangers',executionMode:'own_team',status:'own_team_scheduled',serviceArea:box(),createdAt:Timestamp.fromMillis(now-30*day),...extra});return id;}
async function zone(b,c,x=-76,extra={}){const id='zone_'+crypto.randomUUID();await db.doc('campaignZones/'+id).set({businessId:b,campaignId:c,serviceArea:box(x),status:'unassigned',assignedScalerId:null,...extra});return id;}
const read=(b,c)=>call(b,'marketingAreaHistory',{campaignId:c});
const complete=(b,c,extra={},uid=b,id)=>call(b,'markMarketingComplete',{campaignId:c,completedAtMs:now-day,confirmed:true,wholeTerritory:true,...extra},uid,id);
const records=async b=>(await db.collection(`businessOperations/${b}/marketingHistory`).get()).docs.map(d=>({id:d.id,...d.data()}));
async function approved(b,c,x=-76,extra={}){const proof='proof_'+crypto.randomUUID(),z=await zone(b,c,x,{status:'completed',reviewStatus:'approved',assignedScalerId:'scaler',submittedCompletionId:proof});await db.doc('campaignCompletions/'+proof).set({businessId:b,campaignId:c,zoneId:z,scalerId:'scaler',status:'approved',reviewStatus:'approved',completedAt:Timestamp.fromMillis(now-10*day),...extra});return {zoneId:z,completionId:proof};}
test('own-team explicit whole-territory completion stores exact immutable geography and no marketplace work',async()=>{
 const b=await owner(),c=await campaign(b),r=await complete(b,c);assert.equal(r.campaignStatus,'own_team_completed');const [record]=await records(b);assert.deepEqual(record.geometryParts,[{points:box()}]);assert.equal(record.completionEvidenceSource,'business_reported');assert.equal(record.recordedBy,b);assert.equal((await read(b,c)).warning,true);
 for(const col of ['campaignPayments','assignmentCompensations','campaignCompletions','walletTransactions','scalerTransfers','earnings'])assert.equal((await db.collection(col).where('campaignId','==',c).get()).size,0);
 assert.equal((await db.collection(`campaigns/${c}/assignedScalers`).get()).size,0);
});
test('own-team partial completion records A+B, excludes C, and cumulative completion closes campaign only after C',async()=>{
 const b=await owner(),c=await campaign(b),a=await zone(b,c),bb=await zone(b,c,-75.99),cc=await zone(b,c,-75.98);
 const partial=await complete(b,c,{wholeTerritory:false,zoneIds:[a,bb]});assert.equal(partial.allComplete,false);assert.equal(partial.campaignStatus,'own_team_scheduled');
 const [first]=await records(b);assert.deepEqual(new Set(first.zoneIds),new Set([a,bb]));assert.equal(first.geometryParts.length,2);
 assert.equal((await call(b,'marketingAreaHistory',{campaignId:c,proposedGeometry:box(-75.98)})).warning,false);
 const end=await complete(b,c,{wholeTerritory:false,zoneIds:[cc]});assert.equal(end.allComplete,true);assert.equal((await records(b)).length,2);
});
test('draft/canceled/funded/scheduled/map download/map print do not independently create history',async()=>{
 const b=await owner();for(const status of ['draft','canceled','funded','own_team_scheduled']){const c=await campaign(b,{status});await mapRecord({db,authority,request:request(b,'campaignMapRecord',{campaignId:c}),now:()=>now});await mapRecord({db,authority,request:request(b,'campaignMapRecord',{campaignId:c}),now:()=>now});assert.equal((await read(b,c)).warning,false);if(status!=='own_team_scheduled')await assert.rejects(complete(b,c),{code:'failed-precondition'});}
 assert.equal((await records(b)).length,0);
});
test('own-team completion requires confirmation, actual dates, saved zone IDs and rejects geometry/mode injections',async()=>{
 const b=await owner(),c=await campaign(b);for(const extra of [{confirmed:false},{completedAtMs:now+1},{completedAtMs:now-31*day},{wholeTerritory:false,zoneIds:[]},{serviceArea:box()},{executionMode:'own_team'}])await assert.rejects(complete(b,c,extra),{code:'invalid-argument'});
 await assert.rejects(complete(b,c,{wholeTerritory:false,zoneIds:['missing']}),{code:'permission-denied'});assert.equal((await records(b)).length,0);
});
test('marketplace execution cannot use business-reported completion even if own-team intent is supplied',async()=>{
 const b=await owner(),c=await campaign(b,{executionMode:'marketplace'});await assert.rejects(complete(b,c),{code:'failed-precondition'});assert.equal((await records(b)).length,0);
});
test('contradictory own-team funding and assignment bindings fail closed',async()=>{
 const b=await owner();for(const kind of ['payment','contract','assignment','zone','campaign']){const c=await campaign(b);
  if(kind==='payment')await db.doc('campaignPayments/payment_'+c).set({businessId:b,campaignId:c,status:'funded'});
  if(kind==='contract')await db.doc('assignmentCompensations/contract_'+c).set({businessId:b,campaignId:c});
  if(kind==='assignment')await db.doc(`campaigns/${c}/assignedScalers/scaler`).set({campaignId:c});
  if(kind==='zone')await zone(b,c,-76,{assignedScalerId:'scaler'});
  if(kind==='campaign')await db.doc('campaigns/'+c).update({campaignPaymentId:'payment'});
  await assert.rejects(complete(b,c),{code:'failed-precondition'});
 }assert.equal((await records(b)).length,0);
});
test('authoritative approved marketplace completion projects only completed zones once',async()=>{
 const b=await owner(),c=await campaign(b,{executionMode:'marketplace',status:'active'});const a=await approved(b,c);await zone(b,c,-75.99,{status:'submitted'});await zone(b,c,-75.98);
 const r=await read(b,c);assert.equal(r.warning,true);assert.equal(r.recent[0].completionEvidenceSource,'authoritative_zone_review');const [stored]=await records(b);assert.deepEqual(stored.zoneIds,[a.zoneId]);assert.deepEqual(stored.geometryParts,[{points:box()}]);
 await db.doc('campaignZones/'+a.zoneId).update({serviceArea:box(-77)});await read(b,c);assert.deepEqual((await records(b))[0].geometryParts,stored.geometryParts);assert.equal((await records(b)).length,1);
});
test('marketplace completed label without approved proof never creates a footprint',async()=>{
 const b=await owner(),c=await campaign(b,{executionMode:'marketplace',status:'completed'});await zone(b,c,-76,{status:'completed'});assert.equal((await read(b,c)).warning,false);assert.equal((await records(b)).length,0);
});
test('mismatched approved proof makes history unavailable rather than claiming fresh territory',async()=>{
 const b=await owner(),c=await campaign(b,{executionMode:'marketplace'});await approved(b,c,-76,{businessId:'different-business'});await assert.rejects(read(b,c),{code:'failed-precondition'});assert.equal((await records(b)).length,0);
});
test('same-business prior campaigns warn, unrelated Business campaigns and forged IDs cannot leak',async()=>{
 const a=await owner(),b=await owner(),old=await campaign(a),next=await campaign(a),other=await campaign(b);await complete(a,old);assert.equal((await read(a,next)).recent[0].campaignId,old);assert.equal((await read(b,other)).warning,false);
 await assert.rejects(call(a,'marketingAreaHistory',{campaignId:next},b),{code:'permission-denied'});await assert.rejects(read(b,next),{code:'permission-denied'});await assert.rejects(complete(a,next,{},b),{code:'permission-denied'});
 const foreign=await zone(b,other);await assert.rejects(complete(a,next,{wholeTerritory:false,zoneIds:[foreign]}),{code:'permission-denied'});
});
test('unauthenticated access is denied; free own-team completion and expired history access remain available',async()=>{
 const b=await owner(),c=await campaign(b);await assert.rejects(call(b,'marketingAreaHistory',{campaignId:c},null),{code:'unauthenticated'});await complete(b,c);await db.doc('businessSubscriptions/'+b).update({status:'canceled'});assert.equal((await read(b,c)).warning,true);
 const next=await campaign(b);assert.equal((await complete(b,next)).recorded,true);
 const free=await owner(),freeCampaign=await campaign(free);await db.doc('businessSubscriptions/'+free).delete();assert.equal((await complete(free,freeCampaign)).recorded,true);
});
test('free own-team completion still requires current legal consent',async()=>{
 const b=await owner(),c=await campaign(b);await db.doc('businessSubscriptions/'+b).delete();await db.doc(`legalConsents/${b}_privacy_privacy-2026-08-v1`).delete();await assert.rejects(complete(b,c),/legal_consent_required/);assert.equal((await records(b)).length,0);
});
test('request replay is idempotent and changed completion details cannot overwrite immutable history',async()=>{
 const b=await owner(),c=await campaign(b),id=crypto.randomUUID();const first=await complete(b,c,{},b,id);assert.equal((await complete(b,c,{},b,id)).duplicate,true);await assert.rejects(complete(b,c,{completedAtMs:now-2*day},b,id),{code:'already-exists'});assert.equal((await records(b))[0].id,first.historyId);assert.equal((await records(b)).length,1);
});
test('concurrent confirmations cannot duplicate a saved-zone completion',async()=>{
 const b=await owner(),c=await campaign(b),z=await zone(b,c),remaining=await zone(b,c,-75.99);
 const r=await Promise.allSettled([complete(b,c,{wholeTerritory:false,zoneIds:[z]}),complete(b,c,{wholeTerritory:false,zoneIds:[z]})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'already-exists');assert.equal((await records(b)).length,1);assert.ok(remaining);
});
test('multiple historical campaigns surface latest completion, union coverage, and preserve >12-month history',async()=>{
 const b=await owner();for(const age of [400,90,2]){const c=await campaign(b,{createdAt:Timestamp.fromMillis(now-500*day)});await complete(b,c,{completedAtMs:now-age*day});}
 const target=await campaign(b),r=await read(b,target);assert.equal(r.recent.length,2);assert.equal(r.historical.length,1);assert.equal(r.mostRecentCompletedAtMs,now-2*day);assert.equal(r.overlapPercent,100);assert.equal(r.canContinue,true);
});
test('removed workspace member loses history access after a valid invitation',async()=>{
 const b=await owner(),u=await owner(),c=await campaign(b),invite=await workspace.invite({uid:b,businessId:b,data:{name:'Member',email:u+'@example.test',permissions:[...PRESETS.fieldUser,'campaigns'],preset:'custom'}});
 const job=(await db.doc('outboundEmailJobs/'+invite.emailJobId).get()).data(),token=job.text.match(/[?&]token=([\w-]+)/)[1];await workspace.accept({uid:u,businessId:b,invitationId:invite.invitationId,token});await call(b,'marketingAreaHistory',{campaignId:c},u);await workspace.changeMember({uid:b,businessId:b,data:{action:'remove',memberId:u}});await assert.rejects(call(b,'marketingAreaHistory',{campaignId:c},u),{code:'permission-denied'});
});
test('partial confirmation leaves schedule open; full confirmation updates only the bound own-team task',async()=>{
 const b=await owner(),c=await campaign(b),a=await zone(b,c),z=await zone(b,c,-75.99),itemId='schedule_'+crypto.randomUUID(),item=db.doc(`businessOperations/${b}/items/${itemId}`);
 await item.set({businessId:b,campaignId:c,sourceKind:'own_team_campaign',type:'task',status:'open',version:1});await db.doc('campaigns/'+c).update({scheduleItemId:itemId});
 await complete(b,c,{wholeTerritory:false,zoneIds:[a]});assert.equal((await item.get()).data().status,'open');await complete(b,c,{wholeTerritory:false,zoneIds:[z]});assert.equal((await item.get()).data().status,'done');
});
test('a schedule task marked done is not completion evidence and foreign schedule binding is rejected',async()=>{
 const b=await owner(),c=await campaign(b),itemId='schedule_'+crypto.randomUUID(),item=db.doc(`businessOperations/${b}/items/${itemId}`);
 await item.set({businessId:b,campaignId:c,sourceKind:'own_team_campaign',type:'task',status:'done',version:1});await db.doc('campaigns/'+c).update({scheduleItemId:itemId});assert.equal((await read(b,c)).warning,false);
 await item.update({campaignId:'foreign'});await assert.rejects(complete(b,c),{code:'failed-precondition'});assert.equal((await records(b)).length,0);
});
test('whole-territory completion cannot certify saved zones outside a changed campaign polygon',async()=>{
 const b=await owner(),c=await campaign(b),z=await zone(b,c,-77);await assert.rejects(complete(b,c),{code:'failed-precondition'});assert.equal((await records(b)).length,0);
 const result=await complete(b,c,{wholeTerritory:false,zoneIds:[z]});assert.equal(result.recorded,true);assert.deepEqual((await records(b))[0].geometryParts,[{points:box(-77)}]);
});
test('partial-work settlements cannot project an entire marketed zone even with approved completion labels',async()=>{
 for(const source of ['partial_settlement','business_accepted_paused_work']){
  const b=await owner(),c=await campaign(b,{executionMode:'marketplace'}),z=await approved(b,c);await db.doc('campaignZones/'+z.zoneId).update({reserveSettlementId:z.zoneId});
  const ref=db.doc('campaignSettlements/'+z.zoneId),saved={zoneId:z.zoneId,campaignId:c,businessId:b,scalerId:'scaler',source,evidence:{coveragePercentage:source==='partial_settlement'?40:85}};await ref.set(saved);
  await assert.rejects(read(b,c),{code:'failed-precondition'});assert.equal((await records(b)).length,0);assert.deepEqual((await ref.get()).data(),saved);
 }
});

const workRequest=(b,op,input,uid=b,key=crypto.randomUUID())=>require('../functions-business-operations/own_team_work').createService({db,FieldValue,authority,now:()=>now}).execute(request(b,op,input,uid,key));
async function crew(b,name='Internal marketer'){const id='person_'+crypto.randomUUID();await db.doc(`businessOperations/${b}/resources/${id}`).set({businessId:b,name,status:'active',version:1});return 'crew:'+id;}
const workInput=(zoneId,ids,notes='')=>[{zoneId,personIds:ids,notes}];
test('one or several people share one immutable area completion with no marketplace or cash effects',async()=>{
 const b=await owner(),c=await campaign(b),z=await zone(b,c),p=await crew(b),q=await crew(b,'Second marketer');
 const key=crypto.randomUUID(),data={wholeTerritory:false,zoneIds:[z],zoneWork:workInput(z,[p,q],'Worked together')};
 await complete(b,c,data,b,key);await complete(b,c,data,b,key);
 const [r]=await records(b);assert.equal(r.zoneWork[0].people.length,2);assert.equal(r.zoneWork[0].workedAtMs,now-day);assert.equal(r.areaSnapshots[0].zoneId,z);assert.deepEqual(r.areaSnapshots[0].geometryParts,[{points:box()}]);
 assert.equal((await records(b)).length,1);for(const col of ['earnings','walletTransactions','campaignPayments','assignmentCompensations','campaignCompletions'])assert.equal((await db.collection(col).where('campaignId','==',c).get()).size,0);
 assert.equal((await db.doc('campaignZones/'+z).get()).data().assignedScalerId,null);
});
test('attribution is optional; correction audits one record without changing coverage, completed boundary or original names',async()=>{
 const b=await owner(),c=await campaign(b),z=await zone(b,c),p=await crew(b),q=await crew(b,'Correct person');
 await complete(b,c,{wholeTerritory:false,zoneIds:[z]});const [original]=await records(b);
 const input={campaignId:c,historyId:original.id,expectedRevision:0,zoneWork:workInput(z,[p],'Initial attribution')};const key=crypto.randomUUID();
 await workRequest(b,'amendOwnTeamAreaWork',input,b,key);assert.equal((await workRequest(b,'amendOwnTeamAreaWork',input,b,key)).duplicate,true);
 await workRequest(b,'amendOwnTeamAreaWork',{...input,expectedRevision:1,zoneWork:workInput(z,[q],'Correction')});
 assert.deepEqual((await records(b))[0],original);const result=await workRequest(b,'ownTeamAreaWork',{campaignId:c});
 assert.equal(result.records.length,1);assert.equal(result.records[0].attributionRevision,2);assert.equal(result.records[0].zoneWork[0].people[0].name,'Correct person');
 assert.equal(result.records[0].amendments[1].before[0].people[0].name,'Internal marketer');
 assert.equal((await read(b,c)).overlapPercent,100);
});
test('renaming/deactivating crew and archiving campaign preserve readable history; historical attribution is no active assignment',async()=>{
 const b=await owner(),c=await campaign(b),z=await zone(b,c),p=await crew(b,'Original name');await complete(b,c,{wholeTerritory:false,zoneIds:[z],zoneWork:workInput(z,[p])});
 await db.doc(`businessOperations/${b}/resources/${p.slice(5)}`).update({name:'Renamed',status:'inactive'});await db.doc('campaigns/'+c).update({archived:true,status:'archived'});
 const result=await workRequest(b,'ownTeamAreaWork',{campaignId:c});assert.equal(result.records[0].zoneWork[0].people[0].name,'Original name');assert.equal(result.canComplete,false);
 const r=result.records[0];await workRequest(b,'amendOwnTeamAreaWork',{campaignId:c,historyId:r.id,expectedRevision:0,zoneWork:workInput(z,[p],'Historical note')});
 assert.equal((await db.doc('campaignZones/'+z).get()).data().assignedScalerId,null);
});
test('cross-workspace people, wrong campaign/area and marketplace attribution are denied',async()=>{
 const b=await owner(),other=await owner(),c=await campaign(b),z=await zone(b,c),p=await crew(other);
 await assert.rejects(complete(b,c,{wholeTerritory:false,zoneIds:[z],zoneWork:workInput(z,[p])}),{code:'permission-denied'});
 await assert.rejects(complete(b,c,{wholeTerritory:false,zoneIds:[z],zoneWork:workInput('wrong-zone',[])}),{code:'invalid-argument'});
 await complete(b,c,{wholeTerritory:false,zoneIds:[z]});const [r]=await records(b);
 await assert.rejects(workRequest(b,'amendOwnTeamAreaWork',{campaignId:c,historyId:r.id,expectedRevision:0,zoneWork:workInput(z,[])},other),{code:'permission-denied'});
 await assert.rejects(workRequest(b,'ownTeamAreaWork',{campaignId:await campaign(b,{executionMode:'marketplace'})}),{code:'failed-precondition'});
 await assert.rejects(workRequest(b,'ownTeamAreaWork',{campaignId:c},null),{code:'unauthenticated'});
});
test('concurrent attribution amendments use one revision and cannot silently overwrite',async()=>{
 const b=await owner(),c=await campaign(b),z=await zone(b,c),p=await crew(b);await complete(b,c,{wholeTerritory:false,zoneIds:[z]});const [r]=await records(b);
 const input={campaignId:c,historyId:r.id,expectedRevision:0,zoneWork:workInput(z,[p])};
 const result=await Promise.allSettled([workRequest(b,'amendOwnTeamAreaWork',input),workRequest(b,'amendOwnTeamAreaWork',{...input,zoneWork:workInput(z,[p],'Different note')})]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.code,'aborted');assert.equal((await records(b)).length,1);
});
test('per-area names remain isolated in grouped completion and planned assignment never implies worked by',async()=>{
 const b=await owner(),c=await campaign(b),p=await crew(b),q=await crew(b,'Other person'),z=await zone(b,c,-76,{assignedPeople:[p]}),other=await zone(b,c,-75.99);
 await db.doc('campaigns/'+c).update({scheduleItemId:'schedule_'+c});
 await db.doc(`businessOperations/${b}/items/schedule_${c}`).set({businessId:b,campaignId:c,sourceKind:'own_team_campaign',assignedPeople:[q],status:'open',version:1});
 const before=await workRequest(b,'ownTeamAreaWork',{campaignId:c});assert.equal(before.campaignAssignedPeople[0].id,q);assert.equal(before.records.length,0);assert.equal(before.areas.find(a=>a.id===z).assignedPeople[0].id,p);
 await complete(b,c,{wholeTerritory:false,zoneIds:[z,other],zoneWork:workInput(other,[q])});const after=await workRequest(b,'ownTeamAreaWork',{campaignId:c});assert.equal(after.records[0].zoneWork.length,1);assert.equal(after.records[0].zoneWork[0].zoneId,other);
});
test('maintained saveResource creates internal person without login, invitation, paid seat or money',async()=>{
 const b=await owner(),before=(await auth.listUsers(1000)).users.length;
 const result=await require('../functions-business-operations/service').createService({db,FieldValue,authority,now:()=>now}).execute(request(b,'saveResource',{name:'No-account marketer',status:'active',expectedVersion:0}));
 assert.equal(result.loginCreated,false);assert.equal(result.seatConsumed,false);assert.equal((await auth.listUsers(1000)).users.length,before);
 assert.equal((await db.collection(`businessWorkspaces/${b}/members`).get()).size,0);assert.equal((await db.collection(`businessWorkspaces/${b}/invitations`).get()).size,0);
});

test('new completion rejects stale boundary version before recording any work',async()=>{
 const b=await owner(),c=await campaign(b),z=await zone(b,c),p=await crew(b);
 const ctx=await workRequest(b,'ownTeamAreaWork',{campaignId:c});const digest=ctx.areas[0].geometryDigest;
 await db.doc('campaignZones/'+z).update({serviceArea:box(-77)});
 await assert.rejects(complete(b,c,{wholeTerritory:false,zoneIds:[z],zoneWork:workInput(z,[p]),expectedAreaDigests:{[z]:digest}}),{code:'aborted'});assert.equal((await records(b)).length,0);
});

test('attribution retains linked person identity and does not block existing archive authority',async()=>{
 const b=await owner(),c=await campaign(b),z=await zone(b,c),p=await crew(b);
 await db.doc(`businessOperations/${b}/resources/${p.slice(5)}`).update({linkedUid:b});
 await complete(b,c,{wholeTerritory:false,zoneIds:[z],zoneWork:workInput(z,[p])});const [r]=await records(b);
 await assert.rejects(workRequest(b,'amendOwnTeamAreaWork',{campaignId:c,historyId:r.id,expectedRevision:0,zoneWork:workInput(z,[p,'user:'+b])}),{code:'invalid-argument'});
 const before=(await db.doc('campaigns/'+c).get()).data();
 const lifecycle=require('../functions-business-operations/service').createService({db,FieldValue,authority,now:()=>now});
 const eligibility=await lifecycle.execute(request(b,'campaignListActions',{campaignId:c}));assert.ok(eligibility.actions.includes('archive'));
 assert.deepEqual((await db.doc('campaigns/'+c).get()).data(),before);
});
