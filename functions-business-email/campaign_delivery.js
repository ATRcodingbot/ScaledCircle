'use strict';
// Invited-owner approval freezes one campaign version. Workers only drain that
// approval; they never discover recipients, approve content or retry a send.
const crypto=require('node:crypto'),contract=require('./mailbox_contract');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const bounded=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0');
const sourceHash=c=>hash((c.sources||[]).filter(s=>s.kind==='owner_workbook').map(s=>({sha256:s.sha256,context:s.context,inquiryDate:s.inquiryDate,email:s.email})));
const contentHash=c=>hash([c.businessId,c.campaignId,c.version,c.sender,c.subject,c.body,c.mailingAddress,c.audience]);
const operationId=(b,c,id)=>hash(['campaign',b,c,id]);
function render(c,row){
  if(!bounded(c.subject,160)||/[\r\n]/.test(c.subject)||!bounded(c.body,10000)||!bounded(c.mailingAddress,500))fail('failed-precondition','Complete the subject, message and Business mailing address.');
  const fill=v=>v.replaceAll('{{FirstName}}',row.firstName||'').replaceAll('{{ProjectType}}',row.projectType||'');
  if(c.body.includes('{{ProjectType}}')&&!bounded(row.projectType,600)||c.body.includes('{{FirstName}}')&&!bounded(row.firstName,120))fail('failed-precondition','Review each recipient’s name and prior-project context.');
  const body=fill(c.body);if(/\{\{[^}]+\}\}/.test(body))fail('invalid-argument','Use only FirstName and ProjectType personalization.');
  if(!/^https:\/\/us-east1-(scaled-circle|scaledcircle-staging|demo-business-email)\.cloudfunctions\.net\/businessEmailUnsubscribeV1\?token=[A-Za-z0-9_-]{43}$/.test(row.unsubscribeUrl||''))fail('failed-precondition','A verified individual unsubscribe link is required.');
  return body+'\n\n'+c.mailingAddress+'\nUnsubscribe from these marketing emails: '+row.unsubscribeUrl;
}
function createDelivery({db,root,sub,current,adapter,credentialAccess,authority,discover,recordSent,reconcile,now=Date.now,project}){
  const gate=a=>{if(a.beta.kind==='internal'||a.beta.campaignReadEnabled!==true||a.beta.campaignSendEnabled!==true)fail('permission-denied','Campaign sending is available only to invited Businesses.');};
  async function certified(a,tx){
    gate(a);const {c,secret}=await current(a,tx),read=r=>tx?tx.get(r):r.get();
    if((c.provider||'google')!=='google'||!contract.capabilities(c).canSend||!c.permissions?.read)fail('failed-precondition','Connect the certified Business Google mailbox with Read and Send permission.');
    if(project==='scaled-circle'){
      const ops=await read(root(a.businessId).collection('operations').where('certification','==',true).limit(3));
      const replies=await read(root(a.businessId).collection('replies').where('certification','==',true).limit(10));
      if(!ops.docs.some(d=>{const o=d.data();return o.state==='sent'&&o.from===c.email&&o.providerSubject===c.subject&&o.providerMessageId&&replies.docs.some(r=>r.data().operationId===d.id&&r.data().from===o.recipient&&r.data().businessId===a.businessId);}))fail('failed-precondition','Complete this Business mailbox’s production conversation verification first.');
    }return {c,secret};
  }
  async function view(a,c){
    const candidates=await Promise.all(c.audience.map(r=>sub(a.businessId,'campaignCandidates',r.candidateId).get()));
    const restrictions=await Promise.all(c.audience.map(r=>sub(a.businessId,'suppression',hash(r.email)).get()));
    const ops=await Promise.all(c.audience.map(r=>sub(a.businessId,'operations',operationId(a.businessId,c.campaignId,r.candidateId)).get()));
    const relationships=await Promise.all(c.audience.map(r=>db.collection('businessOperations/'+a.businessId+'/customers').where('email','==',r.email).limit(3).get()));
    const contactStates=await Promise.all(c.audience.map(r=>db.doc('businessOperations/'+a.businessId+'/contactAuthority/'+hash(r.email)).get()));
    const rows=c.audience.map((r,i)=>{
      const p=candidates[i].data(),restriction=restrictions[i].data(),op=ops[i].data();
      const person=relationships[i].size===1?relationships[i].docs[0].data():null,contact=contactStates[i].data();
      const excluded=restriction?.active||person?.doNotContact===true||contact?.suppressed===true||['suppressed','excluded_automated'].includes(p?.status);
      const relationshipHold=relationships[i].size>1?'CRM identity needs review':contact?.pendingOperationId&&contact.pendingOperationId!==ops[i].id?'Another outreach is pending':contact?.cooldownUntil>now()&&contact.lastOperationId!==ops[i].id?'Contact cooldown is active':null;
      const contextValid=p?.businessId===a.businessId&&p.email===r.email&&r.sourceHash===sourceHash(p)&&p.evidence?.length>0;
      let body=null;try{body=render(c,r);}catch(_){}
      return {...r,body,eligible:!excluded&&!relationshipHold&&contextValid&&body!==null,exclusion:excluded?'Do not contact':relationshipHold||(!contextValid||body===null?'Prior-project context needs review':null),
        lifecycleStage:person?.stage||'unknown',relationshipType:person?.relationshipType||c.audienceType||'unknown',
        lastInboundAt:person?.lastInboundAt||null,lastOutboundAt:person?.lastOutboundAt||null,nextBestAction:person?.nextBestAction||null,cooldownUntil:contact?.cooldownUntil||null,
        operationId:ops[i].id,state:op?.state||'not_sent',replyCount:op?.replyCount||0,
        restriction:restriction?.active?restriction.reason:null,restrictionAt:restriction?.updatedAt||0,requestedAt:op?.requestedAt||0};
    });
    const sent=rows.filter(r=>r.state==='sent').length,suppressed=rows.filter(r=>r.state==='suppressed').length;
    const attention=rows.some(r=>['needs_reconciliation','held'].includes(r.state)||r.state==='sending'&&now()-r.requestedAt>120000);
    let status=c.status;
    if(c.approved)status=attention?'needs_attention':sent+suppressed===rows.length?(sent===rows.length?'sent':sent?'partially_sent':'suppressed'):
      c.sendAt>now()?'scheduled':sent?'partially_sent':'sending';
    return {...c,status,reviewDigest:contentHash(c),audience:rows,eligibleCount:rows.filter(r=>r.eligible).length,
      canApprove:a.beta.campaignSendEnabled===true&&!c.approved&&rows.every(r=>r.body!==null),results:{audience:rows.length,sent,replies:rows.reduce((n,r)=>n+r.replyCount,0),
        delivered:null,opens:null,bounced:rows.filter(r=>r.state==='sent'&&r.restriction==='bounced'&&r.restrictionAt>=r.requestedAt).length,
        unsubscribed:rows.filter(r=>r.state==='sent'&&r.restriction==='unsubscribed'&&r.restrictionAt>=r.requestedAt).length,suppressed,
        ...(await outcomes(a,ops.filter(d=>d.data()?.state==='sent').map(d=>d.id)))}};
  }
  async function outcomes(a,ids){
    const docs=await root(a.businessId).collection('outcomes').limit(1001).get();
    if(docs.size>1000)return {estimates:null,appointments:null,won:null};
    const events=docs.docs.map(d=>d.data()).filter(e=>e.businessId===a.businessId&&ids.includes(e.operationId));
    return {estimates:new Set(events.filter(e=>e.outcome==='estimate').map(e=>e.operationId)).size,
      appointments:new Set(events.filter(e=>['appointment','meeting'].includes(e.outcome)).map(e=>e.operationId)).size,
      won:new Set(events.filter(e=>e.outcome==='won').map(e=>e.operationId)).size};
  }
  async function review(a,input){
    const c=(await sub(a.businessId,'campaigns',input.campaignId).get()).data();if(!c||c.businessId!==a.businessId)fail('not-found','Choose a saved campaign.');
    // Refresh only the saved audience. Discovery cannot expand it.
    if(input.refresh===true&&!c.approved){
      await certified(a);
      const opt=await discover(a,{kind:'optouts'});if(!opt.complete)fail('failed-precondition','Complete the opt-out history review before sending.');
      for(const row of c.audience){const checked=await discover(a,{kind:'contact',candidateId:row.candidateId});if(!checked.complete)fail('failed-precondition','A recipient’s history needs further review.');}
    }
    return view(a,c);
  }
  async function approve(a,input){
    gate(a);if(input.confirm!==true||!Number.isSafeInteger(input.version)||typeof input.reviewDigest!=='string'||
      input.sendAt!==null&&(!Number.isSafeInteger(input.sendAt)||input.sendAt<=now()||input.sendAt>now()+30*86400000))fail('invalid-argument','Confirm the reviewed version and a valid send time.');
    const ref=sub(a.businessId,'campaigns',input.campaignId);
    await db.runTransaction(async tx=>{
      const c=(await tx.get(ref)).data();if(!c||c.businessId!==a.businessId)fail('not-found','Choose a saved campaign.');
      if(c.version!==input.version||contentHash(c)!==input.reviewDigest)fail('aborted','The campaign changed. Review its latest messages.');
      if(c.approved)return;
      const {c:mailbox}=await certified(a,tx);
      const control=(await tx.get(sub(a.businessId,'campaignControl','optouts'))).data();
      if(!control?.complete||now()-control.checkedAt>10*60000)fail('failed-precondition','Check campaign eligibility again before approving.');
      const records=await Promise.all(c.audience.map(r=>tx.get(sub(a.businessId,'campaignCandidates',r.candidateId))));
      const restrictions=await Promise.all(c.audience.map(r=>tx.get(sub(a.businessId,'suppression',hash(r.email)))));
      const contacts=await Promise.all(c.audience.map(r=>tx.get(sub(a.businessId,'campaignControl','contact_'+r.candidateId))));
      const existing=await Promise.all(c.audience.map(r=>tx.get(sub(a.businessId,'operations',operationId(a.businessId,c.campaignId,r.candidateId)))));
      if(existing.some(d=>d.exists))fail('failed-precondition','This campaign already has send history. Reconcile it instead of reapproving.');
      const messages=c.audience.map((r,i)=>{
        const p=records[i].data(),check=contacts[i].data();
        if(p?.businessId!==a.businessId||p.email!==r.email||r.sourceHash!==sourceHash(p)||!p.evidence?.length||!check?.complete||now()-check.checkedAt>10*60000)fail('failed-precondition','Recheck each recipient’s prior-project source before approval.');
        const excluded=restrictions[i].data()?.active||['suppressed','excluded_automated'].includes(p.status);
        return {businessId:a.businessId,campaignId:c.campaignId,campaignVersion:c.version,candidateId:r.candidateId,
          prospectId:'campaign_'+r.candidateId,recipient:r.email,displayName:r.name,sourceHash:r.sourceHash,source:r.provenance,
          subject:c.subject,body:render(c,r),from:mailbox.email,provider:'google',providerSubject:mailbox.subject||null,
          connectionGeneration:mailbox.generation,certification:false,features:{channel:'email',messageAngle:'followup',cta:'reply',sourceClass:'historical_inquiry'},
          state:excluded?'suppressed':'queued',suppressionReason:excluded?'Recipient is excluded from marketing':null,
          approvedBy:a.actorUid,approvedAt:now(),queuedAt:now(),sendAt:input.sendAt||now(),requestedAt:0,attempts:0,replyCount:0,delivered:false,
          providerMessageId:null,providerThreadId:null,messageId:existing[i].id+'@mail.scaledcircle.com'};
      });
      if(messages.every(m=>m.state==='suppressed'))fail('failed-precondition','No eligible recipients remain. No email was queued.');
      tx.create(sub(a.businessId,'campaignVersions',hash([c.campaignId,c.version])),{...c,approvedBy:a.actorUid,approvedAt:now(),reviewDigest:input.reviewDigest});
      messages.forEach((m,i)=>tx.create(existing[i].ref,m));
      tx.update(ref,{approved:true,status:input.sendAt?'scheduled':'preparing',scheduled:input.sendAt!==null,sendAt:input.sendAt||now(),approvedAt:now(),approvedBy:a.actorUid,executionDigest:input.reviewDigest});
    });
    if(input.sendAt===null)await pump(a,input.campaignId,2);
    return {...await review(a,{campaignId:input.campaignId}),message:input.sendAt?'Campaign scheduled. Eligibility is checked again before each send.':'Campaign approved. Sending follows mailbox limits; check its live progress.'};
  }
  async function pump(a,campaignId,max=2){
    gate(a);const c=(await sub(a.businessId,'campaigns',campaignId).get()).data();
    if(!c?.approved||c.sendAt>now())return {attempted:0};
    if(c.executionDigest!==contentHash(c))fail('failed-precondition','The approved campaign bytes changed. No sending is allowed.');
    const snapshot=await view(a,c);if(snapshot.status==='needs_attention')return {attempted:0,held:true};
    let attempted=0;
    for(const row of snapshot.audience.filter(r=>r.state==='queued').slice(0,max)){
      const ref=sub(a.businessId,'operations',row.operationId);
      try{
        const fresh=await authority({auth:{uid:c.approvedBy},data:{businessId:a.businessId}},'sendCampaign');
        await certified(fresh);
        const checked=await discover(fresh,{kind:'contact',candidateId:row.candidateId});
        if(!checked.complete)fail('failed-precondition','Contact history needs review.');
        const claim=await db.runTransaction(async tx=>{
          const op=(await tx.get(ref)).data();if(op?.state!=='queued')return null;
          const {c:mailbox,secret}=await certified(fresh,tx);
          const candidate=(await tx.get(sub(a.businessId,'campaignCandidates',op.candidateId))).data();
          const restriction=(await tx.get(sub(a.businessId,'suppression',hash(op.recipient)))).data();
          const hour=sub(a.businessId,'deliveryWindows','hour_'+Math.floor(now()/3600000)),day=sub(a.businessId,'deliveryWindows','day_'+Math.floor(now()/86400000));
          const hourly=(await tx.get(hour)).data()?.attempts||0,daily=(await tx.get(day)).data()?.attempts||0;
          if(restriction?.active||['suppressed','excluded_automated'].includes(candidate?.status)){tx.update(ref,{state:'suppressed',suppressionReason:restriction?.reason||'Do not contact',lastCheckedAt:now()});return null;}
          if(candidate?.email!==op.recipient||sourceHash(candidate)!==op.sourceHash||mailbox.generation!==op.connectionGeneration)fail('failed-precondition','The reviewed contact or mailbox changed.');
          if(hourly>=5||daily>=20)return {limited:true};
          const contact=await require('./contact_relationship').reserve({db,tx,businessId:a.businessId,opId:ref.id,recipient:op.recipient,name:op.displayName,
            relationshipType:'historical_inquiry',source:op.source,campaignId,objective:c.objective,now:now()});
          contact.apply();
          tx.set(hour,{attempts:hourly+1});tx.set(day,{attempts:daily+1});tx.update(ref,{state:'sending',attempts:1,requestedAt:now()});
          tx.update(ref,{crmCustomerId:contact.customerId});
          return {op:{...op,crmCustomerId:contact.customerId,requestedAt:now()},mailbox,secret};
        });
        if(claim?.limited)break;if(!claim)continue;
        // Last recipient-wide restriction check directly before the only provider attempt.
        const restriction=(await sub(a.businessId,'suppression',hash(claim.op.recipient)).get()).data();
        if(restriction?.active){await require('./contact_relationship').suppressUnsent({db,ref,businessId:a.businessId,reason:restriction.reason,now:now()});continue;}
        attempted++;
        let receipt;
        try{receipt=await adapter(fresh,'google').send({...claim.op,to:claim.op.recipient,...credentialAccess(fresh,claim.mailbox,claim.secret)});
          if(!receipt?.id||!receipt.threadId)throw Error('Provider receipt missing');}
        catch(_){await ref.update({state:'needs_reconciliation',lastCheckedAt:now()});break;}
        await recordSent(fresh,ref,receipt);
      }catch(error){
        // A crash after provider execution can never return to queued.
        const old=(await ref.get()).data();
        if(old?.state==='queued')await ref.update({state:'held',holdReason:'Check recipient eligibility or mailbox access.',lastCheckedAt:now()});
        else if(old?.state==='sending')await ref.update({state:'needs_reconciliation',lastCheckedAt:now()});
        break;
      }
    }return {attempted};
  }
  async function sync(a){
    if(a.beta.campaignSendEnabled!==true)return {attempted:0};
    const docs=await root(a.businessId).collection('campaigns').where('approved','==',true).limit(26).get();
    if(docs.size>25)fail('resource-exhausted','Campaign queue needs review.');
    let attempted=0;for(const d of docs.docs){if(attempted>=2)break;attempted+=(await pump(a,d.id,2-attempted)).attempted;}return {attempted};
  }
  async function check(a,input){
    const c=(await sub(a.businessId,'campaigns',input.campaignId).get()).data();if(!c||c.businessId!==a.businessId)fail('not-found','Choose a saved campaign.');
    for(const r of c.audience){const id=operationId(a.businessId,c.campaignId,r.candidateId),op=(await sub(a.businessId,'operations',id).get()).data();
      if(op&&(['sent','needs_reconciliation'].includes(op.state)||op.state==='sending'&&now()-op.requestedAt>120000))await reconcile(a,{operationId:id});}
    return {...await review(a,input),message:'Campaign conversations checked. No message was resent.'};
  }
  async function resume(a,input){
    gate(a);if(input.confirm!==true)fail('failed-precondition','Review the held recipients before continuing.');
    await certified(a);
    const ref=sub(a.businessId,'campaigns',input.campaignId);
    await db.runTransaction(async tx=>{
      const c=(await tx.get(ref)).data();if(!c?.approved||c.businessId!==a.businessId||c.executionDigest!==contentHash(c))fail('failed-precondition','The approved campaign needs review.');
      const ops=await Promise.all(c.audience.map(r=>tx.get(sub(a.businessId,'operations',operationId(a.businessId,c.campaignId,r.candidateId)))));
      if(ops.some(d=>['sending','needs_reconciliation'].includes(d.data()?.state)))fail('failed-precondition','Confirm the uncertain provider result first. No send was retried.');
      for(const d of ops)if(d.data()?.state==='held'&&d.data().attempts===0)tx.update(d.ref,{state:'queued',holdReason:null,resumedBy:a.actorUid,resumedAt:now()});
    });
    return {...await review(a,input),message:'Unsent recipients will be checked again before the approved campaign continues.'};
  }
  return {view,review,approve,pump,sync,check,resume};
}
module.exports={createDelivery,sourceHash,contentHash,operationId,render};
