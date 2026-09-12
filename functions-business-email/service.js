'use strict';
const crypto=require('node:crypto');
const gmail=require('./gmail'),learning=require('./growth_learning');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e;};
const id=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(value))fail('invalid-argument','Choose a saved record.');return value;};
const strict=(input,keys)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))fail('invalid-argument','Unsupported action.');};
const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))fail('invalid-argument','Enter a complete message within the displayed limits.');return v.trim();};
function createService({db,authority,provider,key,now=Date.now}) {
  const root=b=>db.doc('businessMailboxes/'+id(b));
  const sub=(b,c,i)=>root(b).collection(c).doc(id(i));
  const stamp=()=>now();
  const binding=(a)=>'BusinessMailboxV1/'+a.businessId;
  const checkConnection=c=>{if(c?.status!=='connected')fail('failed-precondition','Connect Business Email first.');};
  async function current(a,tx=null) {
    const read=r=>tx?tx.get(r):r.get();
    const [connection,credential]=await Promise.all([read(root(a.businessId)),read(sub(a.businessId,'private','credential'))]);
    const c=connection.data();checkConnection(c);
    if(!credential.exists||gmail.email(c.email)!==gmail.email(a.beta.mailbox))fail('failed-precondition','Reconnect the authorized Business mailbox.');
    return {c,secret:credential.data()};
  }
  async function load(a) {
    const [connection,operations,drafts,events,prospects]=await Promise.all([root(a.businessId).get(),root(a.businessId).collection('operations').orderBy('requestedAt','desc').limit(100).get(),
      root(a.businessId).collection('drafts').limit(100).get(),root(a.businessId).collection('outcomes').orderBy('recordedAt','desc').limit(250).get(),
      db.collection('agentProspects').where('businessUid','==',a.businessId).limit(250).get()]);
    const c=connection.data()||{},pending=c.pendingAttempt?await sub(a.businessId,'attempts',c.pendingAttempt).get():null;
    const active=['pending','verifying'].includes(pending?.data()?.status)&&pending.data().expiresAt>now();
    const ops=operations.docs.map(d=>({id:d.id,...d.data()}));
    const focus=(await db.doc('agentCommunicationPreferences/'+a.businessId).get()).data()?.opportunities;
    const restrictions=await root(a.businessId).collection('suppression').where('active','==',true).limit(501).get();
    if(restrictions.size>500)fail('failed-precondition','The contact restriction inventory needs a bounded review.');
    const suppressedRecipients=new Set(restrictions.docs.map(d=>d.data().recipient));
    const rows=prospects.docs.map(d=>({id:d.id,...d.data()})).map(p=>({...p,doNotContact:p.doNotContact===true||suppressedRecipients.has(p.email?.toLowerCase()),excludedByGrowthPreferences:!a.preferenceEnabled(p,focus)}));
    const leadDocs=await db.collection('salesLeads').where('ownerUid','==',a.businessId).limit(25).get();
    const replies=c.status==='connected'&&c.permissions?.read===true?(await root(a.businessId).collection('replies').limit(50).get()).docs.map(d=>d.data()):[];
    return {available:true,privateBeta:true,configured:!!a.beta.configured,sendEnabled:a.beta.sendEnabled!==false,
      certificationSendEnabled:a.beta.certificationSendEnabled===true,expectedMailbox:a.beta.mailbox,
      connection:{status:c.status==='connected'?'connected':active?'connecting':'not_connected',email:c.email||null,
        read:c.status==='connected'&&c.permissions?.read===true,send:c.status==='connected'&&c.permissions?.send===true,
        automaticSending:false,landingSender:c.landingSender||'account_notifications',pending:active,
        error:!active&&c.pendingAttempt?'Email was not connected. Try again.':c.lastConnectionError||null},
      evidenceWindow:'Up to 100 recent outreach operations and their recorded outcomes.',operations:ops.sort((a,b)=>b.requestedAt-a.requestedAt),drafts:drafts.docs.map(d=>({id:d.id,...d.data()})),replies,outcomes:events.docs.map(d=>d.data()),restrictions:restrictions.docs.map(d=>({recipient:d.data().recipient,reason:d.data().reason})),
      landingLeads:leadDocs.docs.filter(d=>d.data().leadType==='landing_page_inquiry'&&!d.data().suppressionStatus).map(d=>({id:d.id,email:d.data().contactEmail,displayName:d.data().contactName,
        reason:'An inbound request from your landing page.',draft:'Thank you for your inquiry. We received your request and will review how we can help.',sourceUrl:null})),
      learning:learning.project({businessId:a.businessId,operations:ops,outcomes:events.docs.map(d=>d.data()),prospects:rows,now:now(),funnel:a.beta.funnel||'services'}),
      certificationRecipient:a.beta.certificationRecipient||null,certificationOnly:a.beta.certificationOnly!==false};
  }
  async function connect(a,input) {
    strict(input,['read','send']);if(typeof input.read!=='boolean'||typeof input.send!=='boolean'||!input.read&&!input.send)fail('invalid-argument','Choose Read leads, Send approved outreach, or both.');
    const nonce=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(32).toString('base64url'),attemptId=hash(nonce);
    const attempt={id:attemptId,businessId:a.businessId,actorUid:a.actorUid,permissions:input,status:'pending',createdAt:stamp(),expiresAt:now()+600000,
      challenge:gmail.seal({nonce,verifier},key,binding(a)),expectedMailbox:gmail.email(a.beta.mailbox)};
    const url=provider.authorize({state:nonce,verifier,...input,expectedMailbox:attempt.expectedMailbox});
    return db.runTransaction(async tx=>{
      const c=(await tx.get(root(a.businessId))).data()||{};
      const old=c.pendingAttempt?(await tx.get(sub(a.businessId,'attempts',c.pendingAttempt))).data():null;
      if(old?.status==='pending'&&old.expiresAt>now()&&hash(old.permissions)===hash(input)) {
        const v=gmail.unseal(old.challenge,key,binding(a));
        return {url:provider.authorize({state:v.nonce,verifier:v.verifier,...input,expectedMailbox:old.expectedMailbox}),reused:true};
      }
      if(old?.status==='pending')tx.update(sub(a.businessId,'attempts',old.id),{status:'canceled',closedAt:stamp()});
      tx.create(sub(a.businessId,'attempts',attemptId),attempt);
      // Nonce locator contains no credential or mailbox. Clients cannot read it.
      tx.create(db.doc('businessEmailCallbackStates/'+attemptId),{businessId:a.businessId,actorUid:a.actorUid});
      tx.set(root(a.businessId),{businessId:a.businessId,pendingAttempt:attemptId,automaticSending:false,updatedAt:stamp()},{merge:true});
      return {url,reused:false};
    });
  }
  async function callback(query) {
    if(typeof query.state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(query.state))fail('permission-denied','The connection attempt could not be verified.');
    const attemptId=hash(query.state),locator=(await db.doc('businessEmailCallbackStates/'+attemptId).get()).data();
    if(!locator)fail('permission-denied','The connection attempt could not be verified.');
    const a=await authority({auth:{uid:locator.actorUid},data:{businessId:locator.businessId}},'callback');
    const ref=sub(a.businessId,'attempts',attemptId);
    const attempt=await db.runTransaction(async tx=>{
      const p=(await tx.get(ref)).data(),c=(await tx.get(root(a.businessId))).data();
      if(!p||p.status!=='pending'||p.expiresAt<=now()||c?.pendingAttempt!==attemptId||p.actorUid!==a.actorUid)fail('failed-precondition','This connection attempt has ended. Try again.');
      tx.update(ref,{status:'verifying'});return p;
    });
    try {
      if(query.error||typeof query.code!=='string'||query.code.length>4096)fail('permission-denied','Google did not complete the connection.');
      const {verifier}=gmail.unseal(attempt.challenge,key,binding(a)),result=await provider.exchange(query.code,verifier);
      if(gmail.email(result.email)!==attempt.expectedMailbox)fail('permission-denied','Choose the approved Business mailbox.');
      const permissions={read:attempt.permissions.read&&result.permissions.read===true,send:attempt.permissions.send&&result.permissions.send===true};
      if(!permissions.read&&!permissions.send)fail('permission-denied','No requested permission was granted.');
      await authority({auth:{uid:a.actorUid},data:{businessId:a.businessId}},'callback');
      await db.runTransaction(async tx=>{
        const c=(await tx.get(root(a.businessId))).data(),p=(await tx.get(ref)).data();
        if(c?.pendingAttempt!==attemptId||p?.status!=='verifying'||p.expiresAt<=now())fail('failed-precondition','This connection attempt has ended.');
        tx.set(sub(a.businessId,'private','credential'),{businessId:a.businessId,sealed:gmail.seal({refreshToken:result.refreshToken},key,binding(a)),generation:attemptId});
        tx.set(root(a.businessId),{businessId:a.businessId,status:'connected',email:result.email,provider:'google',subject:result.subject,
          permissions,generation:attemptId,automaticSending:false,pendingAttempt:null,landingSender:c.landingSender||'account_notifications',updatedAt:stamp()});
        tx.update(ref,{status:'connected',challenge:null,closedAt:stamp()});
      });return {connected:true};
    } catch(error) {
      await db.runTransaction(async tx=>{const c=(await tx.get(root(a.businessId))).data();tx.update(ref,{status:'failed',challenge:null,closedAt:stamp()});
        if(c?.pendingAttempt===attemptId)tx.update(root(a.businessId),{pendingAttempt:null,lastConnectionError:'Email was not connected. Try again.'});});
      throw error;
    }
  }
  async function prospect(a,prospectId,tx) {
    const read=r=>tx?tx.get(r):r.get();
    if(/^landing_[a-f0-9]{40}$/.test(prospectId)) {
      const lead=(await read(db.doc('salesLeads/'+prospectId))).data(),c=(await read(root(a.businessId))).data();
      if(lead?.ownerUid!==a.businessId||lead.leadType!=='landing_page_inquiry'||lead.createdBy!=='public_landing_page'||c?.landingSender!=='connected_business_email')
        fail('permission-denied','Choose Business email responses for your own landing-page inquiries first.');
      const recipient=gmail.email(lead.contactEmail),restriction=(await read(sub(a.businessId,'suppression',hash(recipient)))).data();
      if(lead.suppressionStatus||restriction?.active)fail('failed-precondition','Do not contact this recipient.');
      if(a.beta.certificationOnly!==false&&recipient!==gmail.email(a.beta.certificationRecipient))fail('permission-denied','Private certification is limited to the Founder-controlled recipient.');
      return {recipient,sourceUrl:null,reason:'Inbound landing-page inquiry',learningFeatures:{sourceClass:'landing_page',channel:'email'}};
    }
    const p=(await read(db.doc('agentProspects/'+id(prospectId)))).data();
    if(!p||p.businessUid!==a.businessId)fail('permission-denied','This prospect is not in your workspace.');
    const recipient=gmail.email(p.email),suppression=(await read(sub(a.businessId,'suppression',hash(recipient)))).data();
    const prefs=(await read(db.doc('agentCommunicationPreferences/'+a.businessId))).data()?.opportunities;
    if(p.doNotContact||['do_not_contact','bounced','unsubscribed'].includes(p.lifecycleState)||suppression?.active)fail('failed-precondition','Do not contact this recipient.');
    if(!a.preferenceEnabled(p,prefs))fail('failed-precondition','This prospect is excluded by Growth Preferences.');
    if(p.qualified!==true||p.provenanceImmutable!==true||p.sourceAvailable!==true||!p.sourceUrl||!Number.isFinite(p.lastCheckedAt)||now()-p.lastCheckedAt>7*86400000)
      fail('failed-precondition','Recheck the public contact source before sending.');
    if(a.beta.certificationOnly!==false&&recipient!==gmail.email(a.beta.certificationRecipient))fail('permission-denied','Private certification is limited to the Founder-controlled recipient.');
    return {...p,recipient};
  }
  async function saveDraft(a,input) {
    strict(input,['prospectId','subject','body','expectedVersion','certification','followupTo','messageAngle','cta']);
    if(input.messageAngle&&!['introduction','project_inquiry','inbound_response','followup','other'].includes(input.messageAngle))fail('invalid-argument','Choose a supported message purpose.');
    if(input.cta&&!['reply','meeting','estimate','website','other'].includes(input.cta))fail('invalid-argument','Choose a supported next step.');
    const subject=text(input.subject,200),body=text(input.body,8000);
    if(/[\r\n]/.test(subject)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('invalid-argument','Refresh the saved draft before editing.');
    const certification=input.certification===true,prospectId=certification?'founder_certification':id(input.prospectId);
    if(certification&&!a.beta.certificationRecipient)fail('permission-denied','A controlled recipient is required.');
    return db.runTransaction(async tx=>{
      const {c}=await current(a,tx);if(!c.permissions?.send)fail('permission-denied','Enable Send approved outreach first.');
      const p=certification?{recipient:gmail.email(a.beta.certificationRecipient),sourceUrl:null,reason:'Founder-controlled software certification',learningFeatures:{},displayName:'Founder certification'}:await prospect(a,prospectId,tx);
      const ref=sub(a.businessId,'drafts',prospectId),old=(await tx.get(ref)).data();
      if((old?.version||0)!==input.expectedVersion)fail('aborted','The draft changed. Review the latest version.');
      const previous=old?.operationId?(await tx.get(sub(a.businessId,'operations',old.operationId))).data():null;
      if(previous && !(previous.state==='sent'&&!certification&&input.followupTo===old.operationId&&
        (previous.replyCount>0||now()-previous.requestedAt>=5*86400000)))
        fail('failed-precondition','This message already has a send record. Review its outcome before preparing a separate follow-up.');
      if(input.followupTo&&!previous&&old?.followupTo!==input.followupTo)fail('failed-precondition','Choose the current confirmed conversation.');
      const version=input.expectedVersion+1,operationId=hash([a.businessId,prospectId,version,c.generation,subject,body,p.recipient]);
      const draft={businessId:a.businessId,prospectId,version,operationId,from:c.email,recipient:p.recipient,subject,body,connectionGeneration:c.generation,
        source:p.sourceUrl||null,reason:p.reason||p.qualificationReason||'Review the source and Business fit.',certification,
        features:{...learning.featuresFor(p),channel:'email',messageAngle:input.messageAngle||'unspecified',cta:input.cta||'unspecified'},
        followupTo:input.followupTo||old?.followupTo||null,parentMessageId:previous?.messageId||old?.parentMessageId||null,
        parentThreadId:previous?.providerThreadId||old?.parentThreadId||null,state:'draft',editedBy:a.actorUid,editedAt:stamp()};
      tx.set(ref,draft);tx.create(sub(a.businessId,'versions',operationId),draft);return draft;
    });
  }
  async function send(a,input) {
    const requireSend=(actor,draft)=>{
      if(actor.beta.sendEnabled===false&&!(actor.beta.certificationSendEnabled===true&&draft?.certification===true&&draft.prospectId==='founder_certification'&&draft.recipient===gmail.email(actor.beta.certificationRecipient)))
        fail('failed-precondition','Sending is held. Only the enabled, reviewed controlled test can be sent. No email was sent.');
    };
    strict(input,['prospectId','version','operationId','confirm']);if(input.confirm!==true)fail('failed-precondition','Review the exact message and choose Send Email.');
    const ref=sub(a.businessId,'operations',input.operationId),draftRef=sub(a.businessId,'drafts',input.prospectId);
    const claim=await db.runTransaction(async tx=>{
      const existing=(await tx.get(ref)).data();if(existing)return {existing};
      const {c,secret}=await current(a,tx),draft=(await tx.get(draftRef)).data();
      requireSend(a,draft);
      if(!c.permissions?.send||!draft||draft.operationId!==input.operationId||draft.version!==input.version||draft.connectionGeneration!==c.generation||draft.from!==c.email)
        fail('failed-precondition','The mailbox or draft changed. Review the latest message.');
      const suppressed=(await tx.get(sub(a.businessId,'suppression',hash(draft.recipient)))).data();
      if(suppressed?.active)fail('failed-precondition','Do not contact this recipient.');
      if(!draft.certification) {
        const latest=await prospect(a,draft.prospectId,tx);
        if(latest.recipient!==draft.recipient)fail('failed-precondition','The contact source changed. Review a new draft.');
      }
      else if(draft.recipient!==gmail.email(a.beta.certificationRecipient))fail('permission-denied','The controlled recipient changed.');
      const op={...draft,state:'sending',messageId:input.operationId+'@mail.scaledcircle.com',requestedAt:stamp(),approvedBy:a.actorUid,
        attempts:1,replyCount:0,delivered:false,providerMessageId:null,providerThreadId:null};
      tx.create(ref,op);tx.update(draftRef,{state:'sending'});return {op,secret};
    });
    if(claim.existing)return {operationId:ref.id,state:claim.existing.state==='sending'?'needs_reconciliation':claim.existing.state,reused:true};
    let result;
    try {
      // Recheck owner/eligibility immediately before the single provider attempt.
      const fresh=await authority({auth:{uid:a.actorUid},data:{businessId:a.businessId}},'send');
      requireSend(fresh,claim.op);
      const creds=gmail.unseal(claim.secret.sealed,key,binding(a));
      result=await provider.send({...claim.op,to:claim.op.recipient,refreshToken:creds.refreshToken});
      if(!result?.id||!result?.threadId)throw Error('provider_receipt_missing');
    } catch(_) {
      await ref.update({state:'needs_reconciliation',lastCheckedAt:stamp()});
      return {operationId:ref.id,state:'needs_reconciliation',retryAllowed:false};
    }
    await recordSent(a,ref,result);return {operationId:ref.id,state:'sent',delivered:false};
  }
  async function recordSent(a,ref,result) {
    await db.runTransaction(async tx=>{
      const op=(await tx.get(ref)).data();if(op.state==='sent')return;
      tx.update(ref,{state:'sent',providerMessageId:result.id,providerThreadId:result.threadId,providerAcceptedAt:stamp(),delivered:false});
      tx.update(sub(a.businessId,'drafts',op.prospectId),{state:'sent'});
      tx.set(sub(a.businessId,'crm',op.prospectId),{businessId:a.businessId,prospectId:op.prospectId,state:'contacted',operationId:ref.id,updatedAt:stamp()},{merge:true});
    });
  }
  async function reconcile(a,input) {
    strict(input,['operationId']);const ref=sub(a.businessId,'operations',input.operationId),op=(await ref.get()).data();
    if(!op||op.businessId!==a.businessId)fail('not-found','No send record exists.');
    const {c,secret}=await current(a);if(!c.permissions?.read)fail('permission-denied','Enable Read leads to check this conversation. No message was resent.');
    if(c.email!==op.from)fail('permission-denied','Reconnect the original sending mailbox.');
    const {refreshToken}=gmail.unseal(secret.sealed,key,binding(a));
    if(op.state!=='sent') {
      const receipt=await provider.reconcileSent(refreshToken,op);
      if(!receipt)return {state:'needs_reconciliation',retryAllowed:false};
      await recordSent(a,ref,receipt);return {state:'sent',delivered:false};
    }
    const replies=gmail.replyMessages(await provider.thread(refreshToken,op.providerThreadId),op);
    const replyCount=await db.runTransaction(async tx=>{
      const saved=await Promise.all(replies.map(r=>tx.get(sub(a.businessId,'replies',r.providerMessageId))));
      const latest=(await tx.get(ref)).data();
      const currentConnection=(await current(a,tx)).c;
      if(currentConnection.generation!==c.generation||!currentConnection.permissions?.read||currentConnection.email!==op.from)
        fail('permission-denied','Reconnect the original sending mailbox to check this conversation.');
      if(latest?.state!=='sent'||latest.providerMessageId!==op.providerMessageId||latest.providerThreadId!==op.providerThreadId||
        saved.some(s=>s.exists&&(s.data().operationId!==ref.id||s.data().businessId!==a.businessId)))
        fail('failed-precondition','This conversation needs review before its reply can be recorded.');
      for(let i=0;i<replies.length;i++)if(!saved[i].exists)tx.create(sub(a.businessId,'replies',replies[i].providerMessageId),{
        ...replies[i],businessId:a.businessId,operationId:ref.id,prospectId:op.prospectId,certification:op.certification===true});
      const count=(latest.replyCount||0)+saved.filter(s=>!s.exists).length;
      tx.update(ref,{replyCount:count,lastCheckedAt:stamp(),replyCheckStatus:count?'reply_received':'no_reply_yet'});
      if(count)tx.set(sub(a.businessId,'crm',op.prospectId),{businessId:a.businessId,prospectId:op.prospectId,
        operationId:ref.id,providerThreadId:op.providerThreadId,certification:op.certification===true,state:'replied',updatedAt:stamp()},{merge:true});
      return count;
    });return {state:'sent',replies:replyCount,delivered:false};
  }
  async function suppress(a,input) {
    strict(input,['prospectId','reason']);if(!['do_not_contact','unsubscribed','bounced'].includes(input.reason))fail('invalid-argument','Choose a contact restriction.');
    const landing=/^landing_[a-f0-9]{40}$/.test(input.prospectId),pRef=db.doc((landing?'salesLeads/':'agentProspects/')+id(input.prospectId));
    return db.runTransaction(async tx=>{
      const p=(await tx.get(pRef)).data();if((landing?p?.ownerUid:p?.businessUid)!==a.businessId)fail('permission-denied','This prospect is not in your workspace.');
      const recipient=gmail.email(landing?p.contactEmail:p.email),ref=sub(a.businessId,'suppression',hash(recipient));
      const operations=await tx.get(root(a.businessId).collection('operations').where('recipient','==',recipient).limit(100));
      tx.set(ref,{businessId:a.businessId,recipient,active:true,reason:input.reason,actorUid:a.actorUid,updatedAt:stamp()});
      tx.update(pRef,landing?{suppressionStatus:input.reason}:{doNotContact:true,approvalState:'do_not_contact',lifecycleState:input.reason,outreachAuthorized:false});
      for(const d of operations.docs)if(d.data().state==='sent')tx.set(sub(a.businessId,'outcomes',hash([d.id,input.reason])),{
        businessId:a.businessId,operationId:d.id,outcome:input.reason==='unsubscribed'?'do_not_contact':input.reason,
        actorUid:a.actorUid,recordedAt:stamp(),evidenceType:'owner_recorded_restriction'});
      return {saved:true,sendAllowed:false};
    });
  }
  async function execute(request) {
    const data=request.data||{};strict(data,['businessId','operation','input']);const op=data.operation||'load',input=data.input||{};
    const a=await authority(request,op);
    if(op==='load')return load(a);
    if(op==='connect')return connect(a,input);
    if(op==='saveDraft')return saveDraft(a,input);
    if(op==='send')return send(a,input);
    if(op==='reconcile')return reconcile(a,input);
    if(op==='suppress')return suppress(a,input);
    if(op==='restoreContact') {
      strict(input,['prospectId','confirm','reason']);if(input.confirm!==true)fail('failed-precondition','Explicitly confirm restoring this contact.');
      const reason=text(input.reason,500),pRef=db.doc('agentProspects/'+id(input.prospectId));
      return db.runTransaction(async tx=>{
        const p=(await tx.get(pRef)).data();if(p?.businessUid!==a.businessId)fail('permission-denied','This prospect is not in your workspace.');
        const recipient=gmail.email(p.email),ref=sub(a.businessId,'suppression',hash(recipient)),restriction=(await tx.get(ref)).data();
        if(restriction?.reason==='unsubscribed'||restriction?.reason==='bounced')fail('failed-precondition','A new verified opt-in or corrected contact record is required.');
        const audit=sub(a.businessId,'contactHistory',hash([recipient,restriction?.updatedAt||0,now(),'restore']));
        tx.create(audit,{businessId:a.businessId,recipient,priorRestriction:restriction||null,reason,actorUid:a.actorUid,recordedAt:stamp(),action:'contact_restored'});
        tx.set(ref,{businessId:a.businessId,recipient,active:false,restoredBy:a.actorUid,restoredAt:stamp()},{merge:true});
        tx.update(pRef,{doNotContact:false,approvalState:'awaiting_approval',lifecycleState:'drafted',outreachAuthorized:false});
        return {restored:true,messageSent:false};
      });
    }
    if(op==='preferences') {
      strict(input,['landingSender']);if(!['connected_business_email','account_notifications'].includes(input.landingSender))fail('invalid-argument','Choose a sender preference.');
      const {c}=await current(a);if(input.landingSender==='connected_business_email'&&!c.permissions?.send)fail('permission-denied','Enable Send approved outreach first.');
      await root(a.businessId).update({landingSender:input.landingSender,automaticSending:false});return {saved:true,automaticSending:false};
    }
    if(op==='disconnect') {
      await db.runTransaction(async tx=>{const c=(await tx.get(root(a.businessId))).data();if(c?.pendingAttempt)tx.update(sub(a.businessId,'attempts',c.pendingAttempt),{status:'canceled',closedAt:stamp()});
        tx.delete(sub(a.businessId,'private','credential'));tx.set(root(a.businessId),{status:'not_connected',permissions:{read:false,send:false},pendingAttempt:null,automaticSending:false,landingSender:'account_notifications',updatedAt:stamp()},{merge:true});});
      return {disconnected:true};
    }
    if(op==='outcome') {
      strict(input,['operationId','outcome','note']);if(!learning.OUTCOMES.includes(input.outcome))fail('invalid-argument','Choose a supported result.');
      // Money and product-activation claims require their own integration.
      if(['paid','activated','approved','first_job','completed','signup'].includes(input.outcome))fail('failed-precondition','This result needs a linked authoritative product or financial record.');
      const operationId=id(input.operationId),record=(await sub(a.businessId,'operations',operationId).get()).data();
      if(record?.businessId!==a.businessId||record.state!=='sent')fail('failed-precondition','A confirmed send is required before recording an outcome.');
      if(['do_not_contact','unsubscribed','bounced'].includes(input.outcome))fail('failed-precondition','Use Do not contact to apply a recipient-wide restriction.');
      const outcome={businessId:a.businessId,operationId,outcome:input.outcome,note:input.note?text(input.note,500):'',actorUid:a.actorUid,recordedAt:stamp(),evidenceType:'owner_reported'};
      const eventRef=sub(a.businessId,'outcomes',hash([operationId,input.outcome,outcome.note]));
      await db.runTransaction(async tx=>{if(!(await tx.get(eventRef)).exists)tx.create(eventRef,outcome);});return {saved:true};
    }
    fail('invalid-argument','Unsupported Business Email action.');
  }
  async function syncReplies(request) {
    const a=await authority(request,'reconcile'),c=(await root(a.businessId).get()).data();
    if(c?.status!=='connected'||c.permissions?.read!==true)return {checked:0};
    const ops=(await root(a.businessId).collection('operations').orderBy('requestedAt','desc').limit(100).get()).docs.map(d=>({id:d.id,...d.data()}))
      .filter(o=>o.state==='sent'&&now()-o.requestedAt<30*86400000&&now()-(o.lastCheckedAt||0)>=300000)
      .sort((a,b)=>(a.lastCheckedAt||0)-(b.lastCheckedAt||0)).slice(0,3);
    let checked=0;
    for(const op of ops) {
      // Reserve the bounded read window; retries reconcile existing receipts.
      const claimed=await db.runTransaction(async tx=>{const ref=sub(a.businessId,'operations',op.id),old=(await tx.get(ref)).data();
        if(now()-(old.lastCheckedAt||0)<300000)return false;tx.update(ref,{lastCheckedAt:stamp()});return true;});
      if(!claimed)continue;
      try{await reconcile(a,{operationId:op.id});checked++;}catch(error){
        await sub(a.businessId,'operations',op.id).update({replyCheckStatus:error.code==='permission-denied'?'needs_permission':'needs_review'});
      }
    }
    return {checked};
  }
  return {execute,callback,syncReplies};
}
module.exports={createService,hash};
