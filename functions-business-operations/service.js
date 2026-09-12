'use strict';
const m=require('./model');
const READ_CAP=1000;
function createService({db,FieldValue,authority,now=Date.now}){
 const root=b=>db.doc('businessOperations/'+m.id(b));
 const ref=(b,col,key)=>root(b).collection(col).doc(m.id(key));
 const can=(a,p)=>a.isOwner||a.permissions.includes(p);
 const requirePermission=(a,p)=>{if(!can(a,p))m.fail('permission-denied','Your team access does not include this responsibility.');};
 const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
 const stamp=()=>FieldValue.serverTimestamp();
 async function bounded(query,tx){const s=await(tx?tx.get(query.limit(READ_CAP+1)):query.limit(READ_CAP+1).get());if(s.size>READ_CAP)m.fail('resource-exhausted','This view is too large. Use a smaller date range or contact support. No partial totals are shown.');return rows(s);}
 async function people(a,tx){
  const [members,crew]=await Promise.all([bounded(db.collection(`businessWorkspaces/${a.businessId}/members`).where('status','==','active'),tx),bounded(root(a.businessId).collection('resources'),tx)]);
  const owner=(await(tx?tx.get(db.doc('users/'+a.ownerUid)):db.doc('users/'+a.ownerUid).get())).data()||{};
  const users=[{id:'user:'+a.ownerUid,name:owner.displayName||owner.name||(a.actorUid===a.ownerUid?a.actorName:null)||owner.companyName||'Business owner',kind:'user',uid:a.ownerUid},...members.filter(x=>x.businessId===a.businessId&&Number.isInteger(x.seatIndex)&&x.seatIndex>0&&x.seatIndex<a.capacity).map(x=>({id:'user:'+x.uid,name:x.name||'Team member',kind:'user',uid:x.uid}))];
  return [...users,...crew.map(x=>({id:'crew:'+x.id,name:x.name,kind:'crew',status:x.status,linkedUid:x.linkedUid||null,version:x.version}))];
 }
 function resolver(roster){return p=>roster.find(x=>x.id===p)?.linkedUid?'user:'+roster.find(x=>x.id===p).linkedUid:p;}
 function checkPeople(values,roster){if(values.some(p=>!roster.some(x=>x.id===p&&x.status!=='inactive')))m.fail('failed-precondition','An assigned person is no longer active. Choose the current team or crew.');const resolved=values.map(resolver(roster));if(new Set(resolved).size!==resolved.length)m.fail('invalid-argument','This person is selected twice through a linked crew record.');}
 function ownAssignment(a,item,roster){return item.assignedPeople.some(x=>resolver(roster)(x)==='user:'+a.actorUid);}
 function itemAccess(a,item,roster){return can(a,item.type==='job'?'jobsView':'scheduleView')||(item.type==='job'&&can(a,'jobsAssigned')&&ownAssignment(a,item,roster));}
 function publicContext(a){return {businessId:a.businessId,actorUid:a.actorUid,isOwner:a.isOwner,activePaid:a.activePaid,permissions:a.permissions,seatLimit:a.capacity,internal:a.internal,agentAvailable:a.agentAvailable===true};}
 async function load(request){
  const a=await authority(request),input=request.data?.input||{};m.strict(input,['fromMs','toMs']);
  const {fromMs,toMs}=input;if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||toMs<=fromMs||toMs-fromMs>45*86400000)m.fail('invalid-argument','Choose a date range of up to 45 days.');
  if(!['customersView','scheduleView','jobsView','jobsAssigned'].some(p=>can(a,p)))m.fail('permission-denied','Ask your Business owner for Customers or Schedule access.');
  const [roster,allCustomers,allItems,prefs]=await Promise.all([people(a),can(a,'customersView')?bounded(root(a.businessId).collection('customers')):[],bounded(root(a.businessId).collection('items').where('startMs','>=',fromMs-86400000).where('startMs','<',toMs)),ref(a.businessId,'preferences',a.actorUid).get()]);
  const visibleItems=allItems.filter(x=>x.endMs>fromMs&&itemAccess(a,x,roster));
  const full=can(a,'customersView');const labels=Object.fromEntries(roster.map(p=>[p.id,p.name]));
  const linked=new Map(allCustomers.map(c=>[c.id,c]));
  if(!full)for(const key of new Set(visibleItems.map(i=>i.customerId).filter(Boolean))){const d=await ref(a.businessId,'customers',key).get();if(d.exists)linked.set(d.id,{name:d.data().name,company:d.data().company});}
  const items=visibleItems.map(x=>full?{...x,assignedLabels:x.assignedPeople.map(p=>labels[p]||'Former team member')}:m.fieldItem(x,linked.get(x.customerId),labels));
  const leads=can(a,'customersView')?await bounded(db.collection('salesLeads').where('ownerUid','==',a.businessId)):[];
  const imported=new Set(allCustomers.flatMap(c=>[c.sourceRef?.leadId,...(c.linkedLeadIds||[])]).filter(Boolean));
  const inbound=leads.filter(l=>l.leadType==='landing_page_inquiry'&&!imported.has(l.id)).map(l=>({id:l.id,name:l.contactName||'Landing-page inquiry',email:l.contactEmail||'',source:'Landing page'}));
  let emailThreads=[];
  if(can(a,'communicationsRead')){const mailbox=(await db.doc('businessMailboxes/'+a.businessId).get()).data();if(mailbox?.status==='connected'&&mailbox.permissions?.read===true)emailThreads=(await bounded(db.collection(`businessMailboxes/${a.businessId}/operations`).where('state','==','sent'))).filter(o=>o.businessId===a.businessId).map(o=>({id:o.id,recipient:o.recipient,subject:o.subject,prospectId:o.prospectId}));}
  return {...publicContext(a),customers:allCustomers,items,people:full||can(a,'assignPeople')||can(a,'scheduleView')?roster:roster.filter(x=>x.uid===a.actorUid||items.some(i=>i.assignedPeople.includes(x.id))),inbound,
   notifications:prefs.data()?.choices||{},counts:{needsResponse:full?allCustomers.filter(c=>c.stage==='new_lead').length+inbound.length:null,needsFollowUp:full?allCustomers.filter(c=>c.stage==='follow_up'||c.stage==='estimate_given').length:null,openTasks:items.filter(i=>i.type==='task'&&i.status==='open').length,unassignedWork:items.filter(i=>['estimate','job'].includes(i.type)&&!['completed','canceled'].includes(i.status)&&!i.assignedPeople.length).length},
   emailThreads,filesSupported:false,externalCalendarSync:false,automaticEmail:false,financialRevenue:null};
 }
 async function timeline(request){
  const a=await authority(request);requirePermission(a,'customersView');const input=request.data.input;m.strict(input,['customerId']);const key=m.id(input.customerId),customer=(await ref(a.businessId,'customers',key).get()).data();
  if(!customer)m.fail('not-found','Customer not found in this Business.');
  const [events,items]=await Promise.all([bounded(root(a.businessId).collection('timeline').where('customerId','==',key)),bounded(root(a.businessId).collection('items').where('customerId','==',key))]);
  const email=[];
  const emailIds=new Set([...(customer.emailOperationIds||[]),customer.sourceRef?.operationId].filter(Boolean));
  if(can(a,'communicationsRead')&&(emailIds.size||customer.sourceRef?.leadId||customer.linkedLeadIds?.length)){
   const mailbox=(await db.doc('businessMailboxes/'+a.businessId).get()).data();
   if(mailbox?.status==='connected'&&mailbox.permissions?.read===true){
    for(const leadId of [customer.sourceRef?.leadId,...(customer.linkedLeadIds||[])].filter(Boolean)){const related=await bounded(db.collection(`businessMailboxes/${a.businessId}/operations`).where('prospectId','==',leadId));for(const op of related)if(op.businessId===a.businessId&&op.state==='sent')emailIds.add(op.id);}
    for(const operationId of emailIds){m.id(operationId);const op=(await db.doc(`businessMailboxes/${a.businessId}/operations/${operationId}`).get()).data();
    if(op?.businessId===a.businessId&&op.state==='sent')email.push({id:operationId,kind:'email_sent',atMs:op.providerAcceptedAt||op.requestedAt,summary:'Business email accepted by provider'});
    const replies=await bounded(db.collection(`businessMailboxes/${a.businessId}/replies`).where('operationId','==',operationId));
    for(const r of replies)if(r.businessId===a.businessId)email.push({id:r.id,kind:'customer_reply',atMs:r.receivedAt||r.recordedAt?.toMillis?.()||null,summary:'Customer replied'});
    }
   }
  }
  return {customer,items:items.filter(i=>can(a,i.type==='job'?'jobsView':'scheduleView')),events:[...events,...email].sort((a,b)=>(b.atMs||0)-(a.atMs||0)),revenue:'Not verified',emailContentIncluded:false};
 }
 async function mutate(request){
  const outer=await authority(request,{write:true}),{operation,input={},requestId}=request.data;m.id(requestId);
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(requestId))m.fail('invalid-argument','A unique request is required.');
  const fingerprint=m.hash([operation,input]),key=m.hash([outer.actorUid,requestId]);
  return db.runTransaction(async tx=>{
   const a=await authority(request,{transaction:tx,write:true}),requestRef=ref(a.businessId,'requests',key),oldRequest=await tx.get(requestRef);
   if(oldRequest.exists){if(oldRequest.data().fingerprint!==fingerprint)m.fail('already-exists','That request already recorded a different change.');return {...oldRequest.data().result,duplicate:true};}
   // Every edit reads/writes this revision, so overlapping concurrent schedule
   // writes and deduplication queries cannot race through two empty snapshots.
   const meta=await tx.get(root(a.businessId)),roster=await people(a,tx),writes=[],events=[],notifications=[];
   const queue=(r,data,merge=false)=>writes.push(()=>tx.set(r,data,merge?{merge:true}:{}));
   const event=(customerId,kind,summary,details={})=>events.push({customerId:customerId||null,kind,summary,details,actorUid:a.actorUid,actorName:a.actorName,atMs:now(),evidenceType:'owner_recorded'});
   async function learningEvent(customer,outcome,itemId){
    if(!can(a,'communicationsRead'))return;
    const ids=new Set(customer.emailOperationIds||[]);
    for(const leadId of [customer.sourceRef?.leadId,...(customer.linkedLeadIds||[])].filter(Boolean)){const related=await bounded(db.collection(`businessMailboxes/${a.businessId}/operations`).where('prospectId','==',leadId),tx);for(const op of related)if(op.state==='sent'&&op.businessId===a.businessId)ids.add(op.id);}
    for(const operationId of ids){const op=(await tx.get(db.doc(`businessMailboxes/${a.businessId}/operations/${m.id(operationId)}`))).data();if(op?.businessId===a.businessId&&op.state==='sent')queue(db.doc(`businessMailboxes/${a.businessId}/outcomes/operations_${key}_${operationId}`),{businessId:a.businessId,operationId,outcome,itemId,actorUid:a.actorUid,recordedAt:now(),evidenceType:'owner_recorded_business_operations',revenueVerified:false});}
   }
   const version=(before,expected)=>{if((before?.version||0)!==expected)m.fail('aborted','This record changed. Refresh before saving.');return expected+1;};
   async function readCustomer(customerId){const d=(await tx.get(ref(a.businessId,'customers',customerId))).data();if(!d)m.fail('not-found','Choose a customer from this Business.');return d;}
   async function prepareCustomer(data,recordId,expectedVersion,{sourceRef=null,reuse=false}={}){
    requirePermission(a,'customersEdit');const value=m.customer(data);checkPeople(value.assignedPeople,roster);
    if(value.assignedPeople.length)requirePermission(a,'assignPeople');
    const all=await bounded(root(a.businessId).collection('customers'),tx),keys=m.contactKeys(value),matches=all.filter(c=>c.id!==recordId&&m.contactKeys(c).some(k=>keys.includes(k)));
    if(matches.length){if(reuse&&matches.length===1)return {id:matches[0].id,value:matches[0],reused:true};m.fail('already-exists','A matching customer exists. Choose the existing record.',{matches:matches.map(c=>({id:c.id,name:c.name,company:c.company,location:c.location}))});}
    const current=recordId?all.find(c=>c.id===recordId):null;if(recordId&&!current)m.fail('not-found','Customer not found.');
    const customerId=recordId||'customer_'+key,ver=version(current,expectedVersion);
    if(current&&!can(a,'assignPeople')&&JSON.stringify(current.assignedPeople)!==JSON.stringify(value.assignedPeople))requirePermission(a,'assignPeople');
    const saved={...current,...value,businessId:a.businessId,version:ver,createdAtMs:current?.createdAtMs||now(),updatedAtMs:now(),updatedBy:a.actorUid,...(sourceRef?{sourceRef}:{}),collectedRevenueCents:null};
    queue(ref(a.businessId,'customers',customerId),saved);event(customerId,current?'customer_updated':'customer_created',current?'Customer details updated':'Lead created',{stage:value.stage});
    if(current&&current.stage!==value.stage)event(customerId,'stage_changed','Stage changed',{previous:current.stage,stage:value.stage});
    return {id:customerId,value:saved,reused:false};
   }
   let result;
   if(operation==='saveCustomer'){
    m.strict(input,['customerId','expectedVersion','customer']);result=await prepareCustomer(input.customer,input.customerId?m.id(input.customerId):null,input.expectedVersion);
    result={customerId:result.id,saved:true};
   }else if(operation==='saveItem'){
    m.strict(input,['itemId','expectedVersion','item','newCustomer','overrideConflict','overrideReason']);
    let data=m.item(input.item),itemId=input.itemId?m.id(input.itemId):'item_'+key,current=(await tx.get(ref(a.businessId,'items',itemId))).data();
    requirePermission(a,data.type==='job'?'jobsEdit':'scheduleEdit');
    if(current&&current.type!==data.type)requirePermission(a,current.type==='job'?'jobsEdit':'scheduleEdit');
    const ver=version(current,input.expectedVersion);if(input.itemId&&!current)m.fail('not-found','Scheduled item not found.');
    if(current?.estimate&&(current.type!==data.type||current.customerId!==data.customerId))m.fail('failed-precondition','This estimate has a recorded outcome. Keep its customer and type; create a separate item for different work.');
    // Omission means the creator for new work, and preservation for edits.
    // An explicit empty list is an intentional Unassigned choice.
    if(!Object.hasOwn(input.item,'assignedPeople'))data.assignedPeople=current?.assignedPeople||['user:'+a.actorUid];
    if(!can(a,'assignPeople')){
     const selfOnly=values=>values.every(p=>p==='user:'+a.actorUid);
     const unchanged=current&&m.hash([...current.assignedPeople].sort())===m.hash([...data.assignedPeople].sort());
     if(!unchanged&&(!selfOnly(data.assignedPeople)||current&&!selfOnly(current.assignedPeople)))requirePermission(a,'assignPeople');
    }
    checkPeople(data.assignedPeople,roster);
    let customerBefore=data.customerId?await readCustomer(data.customerId):null;
    if(data.customerId&&!can(a,'customersView'))requirePermission(a,'customersView');
    if(data.linkedItemId){const link=(await tx.get(ref(a.businessId,'items',data.linkedItemId))).data();if(!link||link.customerId!==data.customerId||!['estimate','job'].includes(link.type))m.fail('invalid-argument','Choose a related estimate or job for this customer.');}
    const existing=await bounded(root(a.businessId).collection('items').where('startMs','>=',data.startMs-86400000).where('startMs','<',data.endMs),tx);
    const overlaps=m.conflicts({...data,id:itemId},existing,resolver(roster));
    if(overlaps.length&&input.overrideConflict!==true)m.fail('failed-precondition','Someone is already scheduled at this time.',{conflicts:overlaps.map(c=>({startMs:c.startMs,endMs:c.endMs,personName:roster.find(p=>p.id===c.person)?.name||'Team member'}))});
    if(input.overrideConflict===true){if(!a.isOwner)m.fail('permission-denied','Only the owner can override a schedule conflict.');m.text(input.overrideReason,500,true);}
    if(input.newCustomer){if(data.customerId)m.fail('invalid-argument','Choose an existing customer or create one.');const c=await prepareCustomer(input.newCustomer,null,0,{reuse:true});data={...data,customerId:c.id};customerBefore=c.value;}
    const value={...data,...(current?.estimate?{estimate:current.estimate}:{}),businessId:a.businessId,version:ver,createdAtMs:current?.createdAtMs||now(),updatedAtMs:now(),updatedBy:a.actorUid};
    queue(ref(a.businessId,'items',itemId),value);event(data.customerId,current?'schedule_updated':'schedule_created',current?'Scheduled item updated':'Scheduled '+data.type,{itemId,title:data.title,startMs:data.startMs,status:data.status});
    if(!current&&customerBefore&&['estimate','meeting'].includes(data.type))await learningEvent(customerBefore,'appointment',itemId);
    if(overlaps.length)event(data.customerId,'conflict_overridden','Owner allowed a schedule overlap',{itemId,reason:input.overrideReason,conflicts:overlaps});
    if(customerBefore&&(!current||current.customerId!==data.customerId)&&['estimate','job','follow_up'].includes(data.type)&&data.status==='scheduled'&&can(a,'customersEdit')){const stage=data.type==='estimate'?'estimate_scheduled':data.type==='job'?'job_scheduled':'follow_up';queue(ref(a.businessId,'customers',data.customerId),{stage,version:customerBefore.version+1,updatedAtMs:now()},true);event(data.customerId,'stage_changed','Customer stage updated',{itemId,stage});}
    for(const p of data.assignedPeople){const person=resolver(roster)(p);if(person.startsWith('user:')&&person.slice(5)!==a.actorUid){const uid=person.slice(5),pref=(await tx.get(ref(a.businessId,'preferences',uid))).data();if(pref?.choices?.scheduleChanges!==false&&(data.type!=='job'||pref?.choices?.assignedJobs!==false))notifications.push({uid,itemId,title:data.title,startMs:data.startMs});}}
    result={itemId,customerId:data.customerId,saved:true,conflictOverride:overlaps.length>0};
   }else if(operation==='setItemStatus'){
    m.strict(input,['itemId','expectedVersion','status']);const itemId=m.id(input.itemId),before=(await tx.get(ref(a.businessId,'items',itemId))).data();if(!before)m.fail('not-found','Scheduled item not found.');
    const ver=version(before,input.expectedVersion);const editor=can(a,before.type==='job'?'jobsEdit':'scheduleEdit');
    if(!editor&&!(before.type==='job'&&can(a,'jobsStatus')&&ownAssignment(a,before,roster)))m.fail('permission-denied','You can update only your assigned work.');
    const status=m.choice(input.status,before.type==='task'?['open','done','canceled']:['scheduled','in_progress','completed','canceled']);
    if(['completed','done','canceled'].includes(before.status)&&!['completed','done','canceled'].includes(status)){
     const existing=await bounded(root(a.businessId).collection('items').where('startMs','>=',before.startMs-86400000).where('startMs','<',before.endMs),tx);
     if(m.conflicts({...before,id:itemId,status},existing,resolver(roster)).length)m.fail('failed-precondition','Reopening this work would overlap an assignment. Edit its time or ask the owner to review the conflict.');
    }
    queue(ref(a.businessId,'items',itemId),{status,version:ver,updatedAtMs:now(),updatedBy:a.actorUid},true);event(before.customerId,'work_status_changed','Internal '+before.type+' '+status.replaceAll('_',' '),{itemId,previous:before.status,status});
    if(before.customerId&&before.type==='job'&&['in_progress','completed'].includes(status)&&can(a,'customersEdit')){const customer=await readCustomer(before.customerId);queue(ref(a.businessId,'customers',before.customerId),{stage:status,version:customer.version+1,updatedAtMs:now()},true);event(before.customerId,'stage_changed','Customer stage updated',{stage:status,itemId});}
    result={saved:true,itemId,status,financialEffect:false};
   }else if(operation==='saveResource'){
    requirePermission(a,'assignPeople');m.strict(input,['resourceId','expectedVersion','name','status']);const resourceId=input.resourceId?m.id(input.resourceId):'crew_'+key;
    const before=(await tx.get(ref(a.businessId,'resources',resourceId))).data(),name=m.text(input.name,120,true),ver=version(before,input.expectedVersion);
    const all=await bounded(root(a.businessId).collection('resources'),tx);if(all.some(x=>x.id!==resourceId&&m.normalize(x.name)===m.normalize(name)&&x.status==='active'))m.fail('already-exists','That crew name already exists. Choose the existing resource.');
    queue(ref(a.businessId,'resources',resourceId),{...before,name,status:m.choice(input.status||'active',['active','inactive']),businessId:a.businessId,version:ver,createdAtMs:before?.createdAtMs||now(),updatedAtMs:now()});
    event(null,'crew_resource_saved','Crew resource saved',{resourceId,name});result={saved:true,resourceId,loginCreated:false,seatConsumed:false};
   }else if(operation==='linkResource'){
    requirePermission(a,'teamManagement');requirePermission(a,'assignPeople');m.strict(input,['resourceId','expectedVersion','memberUid']);const resourceId=m.id(input.resourceId),memberUid=m.id(input.memberUid),before=(await tx.get(ref(a.businessId,'resources',resourceId))).data();
    if(!before||before.status!=='active'||!roster.some(p=>p.id==='user:'+memberUid))m.fail('failed-precondition','Accept the normal team invitation first, then link an active member.');
    if(before.linkedUid&&before.linkedUid!==memberUid)m.fail('failed-precondition','This crew resource is already linked.');
    if(roster.some(r=>r.kind==='crew'&&r.id!=='crew:'+resourceId&&r.linkedUid===memberUid))m.fail('already-exists','This workspace user is already linked to another crew resource.');
    const activeItems=(await bounded(root(a.businessId).collection('items'),tx)).filter(i=>!['completed','done','canceled'].includes(i.status));
    const crewId='crew:'+resourceId,userId='user:'+memberUid;
    const linkedResolver=p=>p===crewId?userId:resolver(roster)(p);
    for(const item of activeItems.filter(i=>i.assignedPeople.includes(crewId))){
     if(new Set(item.assignedPeople.map(linkedResolver)).size!==item.assignedPeople.length||m.conflicts(item,activeItems,linkedResolver).length)m.fail('failed-precondition','Linking this account reveals overlapping or duplicate assignments. Resolve the schedule before linking.');
    }
    queue(ref(a.businessId,'resources',resourceId),{linkedUid:memberUid,version:version(before,input.expectedVersion),updatedAtMs:now()},true);event(null,'crew_linked','Crew linked to an accepted workspace user',{resourceId,memberUid});result={linked:true,historyPreserved:true};
   }else if(operation==='savePreferences'){
    m.strict(input,['choices']);m.strict(input.choices,m.NOTIFICATIONS);if(Object.values(input.choices).some(x=>typeof x!=='boolean'))m.fail('invalid-argument','Choose on or off for each update.');
    queue(ref(a.businessId,'preferences',a.actorUid),{choices:input.choices,uid:a.actorUid,businessId:a.businessId,updatedAtMs:now()});result={saved:true,permissionsChanged:false};
   }else if(operation==='recordEstimate'){
    requirePermission(a,'customersEdit');m.strict(input,['itemId','expectedVersion','quotedAmountCents','outcome','note']);const itemId=m.id(input.itemId),before=(await tx.get(ref(a.businessId,'items',itemId))).data();
    if(before?.type!=='estimate'||!before.customerId)m.fail('failed-precondition','Choose a customer estimate.');requirePermission(a,'scheduleEdit');
    const amount=input.quotedAmountCents;if(amount!==null&&(!Number.isSafeInteger(amount)||amount<0||amount>100000000))m.fail('invalid-argument','Enter a valid quoted amount.');
    const outcome=m.choice(input.outcome,['pending','won','lost']),note=m.text(input.note||'',2000),customer=await readCustomer(before.customerId),stage=outcome==='pending'?'estimate_given':outcome;
    queue(ref(a.businessId,'items',itemId),{estimate:{quotedAmountCents:amount,outcome,note,evidenceType:'owner_recorded',collectedRevenueCents:null},version:version(before,input.expectedVersion),updatedAtMs:now()},true);
    queue(ref(a.businessId,'customers',before.customerId),{stage,version:customer.version+1,updatedAtMs:now()},true);event(before.customerId,'estimate_recorded','Estimate outcome recorded',{itemId,quotedAmountCents:amount,outcome,revenueVerified:false});
    await learningEvent(customer,outcome==='pending'?'estimate':outcome,itemId);
    result={saved:true,revenueVerified:false};
   }else if(operation==='linkEmailThread'){
    requirePermission(a,'customersEdit');requirePermission(a,'communicationsRead');m.strict(input,['customerId','expectedVersion','operationId']);const customerId=m.id(input.customerId),operationId=m.id(input.operationId),customer=await readCustomer(customerId),op=(await tx.get(db.doc(`businessMailboxes/${a.businessId}/operations/${operationId}`))).data(),mailbox=(await tx.get(db.doc('businessMailboxes/'+a.businessId))).data();
    if(mailbox?.status!=='connected'||mailbox.permissions?.read!==true||op?.businessId!==a.businessId||op.state!=='sent'||!customer.email||m.normalize(customer.email)!==m.normalize(op.recipient))m.fail('permission-denied','Choose a confirmed thread sent to this customer from this Business mailbox.');
    const linked=[...new Set([...(customer.emailOperationIds||[]),operationId])];if(linked.length>50)m.fail('resource-exhausted','This customer thread inventory needs review.');
    queue(ref(a.businessId,'customers',customerId),{emailOperationIds:linked,version:version(customer,input.expectedVersion),updatedAtMs:now()},true);event(customerId,'email_thread_linked','Business email conversation linked');result={saved:true,emailSent:false};
   }else if(operation==='importLead'){
    requirePermission(a,'customersEdit');m.strict(input,['leadId']);const leadId=m.id(input.leadId),lead=(await tx.get(db.doc('salesLeads/'+leadId))).data();
    if(lead?.ownerUid!==a.businessId||lead.leadType!=='landing_page_inquiry'||lead.createdBy!=='public_landing_page')m.fail('permission-denied','Choose an inquiry from this Business landing page.');
    const all=await bounded(root(a.businessId).collection('customers'),tx),prior=all.find(c=>c.sourceRef?.leadId===leadId||c.linkedLeadIds?.includes(leadId));
    if(prior)result={customerId:prior.id,reused:true};else {const c=await prepareCustomer({name:lead.contactName||'Landing-page inquiry',email:lead.contactEmail||'',phone:lead.contactPhone||'',location:lead.serviceLocation||'',source:'Landing page',stage:'new_lead',notes:lead.message||''},null,0,{sourceRef:{leadId,kind:'landing_page',campaignId:lead.campaignId||null,landingPageId:lead.landingPageId||null},reuse:true});
     if(c.reused){const sources=[...new Set([...(c.value.linkedLeadIds||[]),leadId])];queue(ref(a.businessId,'customers',c.id),{linkedLeadIds:sources,version:c.value.version+1},true);}
     event(c.id,'landing_lead_linked','Landing-page inquiry linked',{leadId});result={customerId:c.id,reused:c.reused};}
   }else m.fail('invalid-argument','Choose a supported Business action.');
   // All reads precede the writes below, including notification preferences.
   for(const write of writes)write();
   events.forEach((e,i)=>tx.create(ref(a.businessId,'timeline',key+'_'+i),{...e,businessId:a.businessId,version:m.VERSION}));
   for(const n of notifications)tx.create(db.doc('notifications/business_schedule_'+key+'_'+n.uid),{userId:n.uid,type:'business_schedule_update',title:'Schedule updated',message:'An item assigned to you changed. Open your Business schedule for details.',read:false,createdAt:stamp(),route:'/business/schedule',metadata:{businessId:a.businessId,itemId:n.itemId}});
   tx.set(root(a.businessId),{schemaVersion:m.VERSION,businessId:a.businessId,revision:(meta.data()?.revision||0)+1,updatedAtMs:now()},{merge:true});
   tx.create(requestRef,{actorUid:a.actorUid,fingerprint,operation,result,createdAtMs:now()});return {...result,duplicate:false};
  });
 }
 async function propose(request){const a=await authority(request);if(!a.agentAvailable)m.fail('permission-denied','Agent scheduling is available only with your invited, entitled Growth tools. Use Schedule to add work directly.');requirePermission(a,'scheduleEdit');requirePermission(a,'customersView');m.strict(request.data.input,['prompt','utcOffsetMinutes']);const proposal=require('./proposal').parse(request.data.input.prompt,request.data.input.utcOffsetMinutes);if(proposal.needsDetails)return proposal;const candidates=(await bounded(root(a.businessId).collection('customers'))).filter(c=>m.normalize(c.name)===m.normalize(proposal.name));if(candidates.length>1)return {needsDetails:true,message:'More than one customer matches. Choose the exact customer in Schedule. Nothing was added.'};return {...proposal,customerId:candidates[0]?.id||null,executed:false};}
 return {load,timeline,mutate,async execute(request){m.strict(request.data,['businessId','operation','input','requestId']);if(request.data.operation==='load')return load(request);if(request.data.operation==='timeline')return timeline(request);if(request.data.operation==='propose')return propose(request);return mutate(request);}};
}
module.exports={createService,READ_CAP};
