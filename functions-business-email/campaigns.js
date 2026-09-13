'use strict';
// Candidate discovery and draft preparation never send. The separate delivery
// authority requires an invited owner to confirm an immutable campaign version.
const crypto=require('node:crypto'),gmail=require('./gmail');
const {convert}=require('html-to-text');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const strict=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('invalid-argument','Unsupported campaign input.');};
const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))fail('invalid-argument','Enter complete information within the displayed limits.');return v.trim();};
const reasons=['unsubscribed','do_not_contact','bounced','invalid','suppressed'];
function mailbox(value){const match=String(value||'').trim().match(/^(?:[^<>@\r\n]*<([^<>\s,]+@[^<>\s,]+)>|([^<>\s,]+@[^<>\s,]+))$/);try{return gmail.email(match?.[1]||match?.[2]||'');}catch(_){return '';}}
function messages(thread,owner){
 if(!Array.isArray(thread?.messages)||thread.messages.length>50)fail('resource-exhausted','This long conversation needs a separate review.');
 const header=(m,name)=>{const rows=(m.payload?.headers||[]).filter(h=>h.name.toLowerCase()===name);return rows.length===1?String(rows[0].value):'';};
 const body=(p,mime)=>p?.mimeType===mime&&p.body?.data?Buffer.from(p.body.data,'base64url').toString('utf8'):(p?.parts||[]).filter(x=>!x.filename).map(x=>body(x,mime)).join('\n').trim();
 return thread.messages.map(m=>{
  const from=mailbox(header(m,'from')),to=header(m,'to'),originalText=body(m.payload,'text/plain'),html=originalText?'':body(m.payload,'text/html');
  const allText=originalText||(html?convert(html.slice(0,50000),{wordwrap:false,limits:{maxInputLength:50000,maxDepth:20},selectors:[{selector:'a',options:{ignoreHref:true}},{selector:'img',format:'skip'},{selector:'script',format:'skip'},{selector:'style',format:'skip'}]}):'');
  const plain=allText.split(/\n(?:On .+wrote:|>|[- ]*Original Message[- ]*)/i)[0].trim().slice(0,5000);
  const related=from===owner||mailbox(to)===owner;
  const recipient=from===owner?mailbox(to):from;
  const auto=!!header(m,'list-unsubscribe')||!!header(m,'list-id')||/auto-generated|auto-replied/i.test(header(m,'auto-submitted'))||/no.?reply|mailer-daemon|postmaster/i.test(from);
  const optout=related&&from!==owner&&!auto&&/^\s*(?:hi[^\n]*\n|hello[^\n]*\n|thanks[^\n]*\n|dear[^\n]*\n)*\s*(?:please\s+)?(?:unsubscribe me|remove me from (?:your|the) (?:list|mailing)|do not (?:email|contact|send)|don.t (?:email|contact)|stop (?:emailing|contacting|sending))/i.test(plain);
  return {providerMessageId:m.id,providerThreadId:thread.id,from,recipient,subject:header(m,'subject').slice(0,250),excerpt:plain,receivedAt:Number(m.internalDate)||0,related,automated:auto,optout,
   spam:(m.labelIds||[]).some(l=>l==='SPAM'||l==='TRASH'),htmlConverted:!originalText&&!!html,htmlOnly:!allText&&!!html};
 }).filter(m=>m.related&&m.recipient&&m.recipient!==owner);
}
function createCampaigns({db,now=Date.now,current,adapter,credentialAccess,root,sub,project}){
 const gate=a=>{if(a.beta.campaignReadEnabled!==true||a.beta.kind==='internal')fail('permission-denied','Email Campaigns is available only through the invited Business private beta.');};
 const sourceRef=(b,c,id)=>root(b).collection(c).doc(id);
 async function capacity(tx,b,existing){if(existing)return;const inventory=await tx.get(root(b).collection('campaignCandidates').limit(101));if(inventory.size>=100)fail('resource-exhausted','Review the saved candidate inventory before adding more contacts.');}
 async function checked(a){gate(a);const data=await current(a);if((data.c.provider||'google')!=='google'||data.c.permissions?.read!==true)fail('permission-denied','Connect the invited Google mailbox with Read permission.');return data;}
 async function load(a){gate(a);const [candidates,campaigns,suppression,review]=await Promise.all([
  root(a.businessId).collection('campaignCandidates').limit(101).get(),root(a.businessId).collection('campaigns').limit(26).get(),
  root(a.businessId).collection('suppression').where('active','==',true).limit(501).get(),sourceRef(a.businessId,'campaignControl','optouts').get()]);
  if(candidates.size>100||campaigns.size>25||suppression.size>500)fail('resource-exhausted','This inventory needs a bounded review.');
  return {privateBeta:true,sender:a.beta.mailbox,sendingEnabled:false,maxAudience:25,history:review.data()||null,
   candidates:candidates.docs.map(d=>({id:d.id,...d.data()})),campaigns:campaigns.docs.map(d=>({id:d.id,...d.data()})),suppression:suppression.docs.map(d=>({recipient:d.data().recipient,reason:d.data().reason,source:d.data().source||'maintained_restriction'}))};
 }
 async function importWorkbook(a,input){
  gate(a);strict(input,['contacts','sourceName','sourceSha256']);const sourceName=text(input.sourceName,160);
  if(input.sourceSha256&&!/^[a-f0-9]{64}$/.test(input.sourceSha256)||!Array.isArray(input.contacts)||!input.contacts.length||input.contacts.length>25)fail('invalid-argument','Import at most 25 reviewed source rows.');
  const normalized=input.contacts.map(c=>{strict(c,['name','email','inquiryDate','context']);return {name:text(c.name,120),email:gmail.email(c.email),inquiryDate:text(c.inquiryDate,40),context:text(c.context,600)};});
  if(new Set(normalized.map(c=>c.email)).size!==normalized.length)fail('invalid-argument','Review duplicate or ambiguous workbook rows before importing.');
  for(const c of normalized){const ref=sourceRef(a.businessId,'campaignCandidates',hash(c.email));
   await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data(),source={kind:'owner_workbook',label:sourceName,sha256:input.sourceSha256||hash(normalized),hashBasis:input.sourceSha256?'original_file':'imported_rows',...c};
    await capacity(tx,a.businessId,old);const sources=[...(old?.sources||[])];if(!sources.some(s=>hash(s)===hash(source)))sources.push(source);
    if(sources.length>20)fail('resource-exhausted','This contact provenance needs review.');
    tx.set(ref,{businessId:a.businessId,email:c.email,name:old?.name||c.name,sources,status:old?.status||'needs_review',audienceCategory:old?.audienceCategory||'old_inquiry',
     roleReviewRequired:true,reviewedForSend:false,updatedAt:now(),...(old?{}:{createdAt:now()})},{merge:true});
   });
  }return {imported:normalized.length,sent:0,message:'Candidates imported for review. A workbook row is not consent or send approval.'};
 }
 async function discover(a,input){
  strict(input,['kind','candidateId','pageToken']);const {c,secret}=await checked(a),p=adapter(a,'google');
  if(!p.history||!p.thread)fail('failed-precondition','Mailbox history review is not configured.');
  let q,recipient;
  if(input.kind==='contact'){
   if(!/^[a-f0-9]{64}$/.test(input.candidateId||''))fail('invalid-argument','Choose a saved candidate.');
   const candidate=(await sourceRef(a.businessId,'campaignCandidates',input.candidateId).get()).data();if(candidate?.businessId!==a.businessId)fail('permission-denied','Choose a candidate in this Business.');
   recipient=gmail.email(candidate.email);q='{from:'+recipient+' to:'+recipient+' "'+recipient+'"}';
  }else if(input.kind==='optouts')q='{ "unsubscribe me" "remove me from your list" "do not contact" "do not email" "stop emailing" "stop contacting" } -in:spam -in:trash';
  else if(input.kind==='inquiries')q='{ estimate quotation "home project" "deck repair" "kitchen remodel" "bathroom remodel" "carpet replacement" } -category:promotions -in:spam -in:trash';
  else fail('invalid-argument','Choose contacts, inquiries or opt-out history.');
  const access=credentialAccess(a,c,secret),page=await p.history(access.credentials.refreshToken,{q,pageToken:input.pageToken,maxResults:20});
  if(!Array.isArray(page.threads||[])||(page.threads||[]).length>20)fail('failed-precondition','Google history needs checking.');
  const found=[],errors=[];for(const t of page.threads||[]){
   try{const evidence=messages(await p.thread(access.credentials.refreshToken,t.id),c.email);found.push(...evidence.flatMap(m=>{
    if(!recipient||m.recipient===recipient)return [m];
    // A known workbook contact may appear inside a form notification rather
    // than its From header. Preserve it as indirect evidence, never consent,
    // an inferred customer outcome or that contact's own opt-out request.
    const addresses=(m.excerpt.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(v=>v.toLowerCase());
    return m.from!==c.email&&addresses.includes(recipient)?[{...m,recipient,indirectEvidence:true,optout:false}]:[];
   }));}
   catch(_){errors.push(t.id);}
  }
  // Recheck the original connection and credential generation before persisting
  // any provider evidence. No support or substituted mailbox is accepted.
  const latest=await current(a);if(latest.c.generation!==c.generation||latest.c.email!==c.email)fail('aborted','The mailbox changed. Repeat this read from the connected Business.');
  const grouped=new Map();for(const m of found){if(!grouped.has(m.recipient))grouped.set(m.recipient,[]);grouped.get(m.recipient).push(m);}
  if(grouped.size>25)fail('resource-exhausted','This search has too many correspondents. Review saved contacts individually.');
  const results=[];
  for(const [email,evidence] of grouped){
   const ref=sourceRef(a.businessId,'campaignCandidates',hash(email)),hasOptout=evidence.some(m=>m.optout),auto=evidence.every(m=>(m.automated&&!m.indirectEvidence)||m.spam);
   await db.runTransaction(async tx=>{
    const old=(await tx.get(ref)).data(),restrictionRef=sub(a.businessId,'suppression',hash(email)),restriction=(await tx.get(restrictionRef)).data();
    await capacity(tx,a.businessId,old);const sources=[...(old?.sources||[])],source={kind:'gmail_conversation',threadIds:[...new Set(evidence.map(m=>m.providerThreadId))],messageIds:[...new Set(evidence.map(m=>m.providerMessageId))],readAt:now(),mailbox:c.email};
    const signal=evidence.find(m=>m.optout),audit=signal?sourceRef(a.businessId,'contactHistory',hash([email,'historical_optout',signal.providerMessageId])):null,priorAudit=audit?await tx.get(audit):null;
    if(!sources.some(s=>s.kind==='gmail_conversation'&&hash(s.messageIds)===hash(source.messageIds)))sources.push(source);
    if(sources.length>20)fail('resource-exhausted','This contact history needs a separate review.');
    const status=hasOptout||restriction?.active?'suppressed':auto?'excluded_automated':old?.status||'needs_review';
    const stillReviewed=old?.reviewedForSend===true&&old.reviewedSourceHash===require('./campaign_delivery').sourceHash({sources})&&!hasOptout&&!auto&&!restriction?.active;
    tx.set(ref,{businessId:a.businessId,email,name:old?.name||'',sources,status,audienceCategory:old?.audienceCategory||'unclassified',roleReviewRequired:!stillReviewed,reviewedForSend:stillReviewed,
     evidence:[...new Map([...(old?.evidence||[]),...evidence].map(m=>[m.providerMessageId,m])).values()].slice(-20),historyCheckedAt:now(),historyComplete:!page.nextPageToken&&!errors.length,updatedAt:now(),...(old?{}:{createdAt:now()})},{merge:true});
    if(hasOptout){
     if(!priorAudit.exists)tx.create(audit,{businessId:a.businessId,recipient:email,action:'historical_optout_recorded',providerMessageId:signal.providerMessageId,providerThreadId:signal.providerThreadId,priorRestriction:restriction||null,actorUid:a.actorUid,recordedAt:now()});
     tx.set(restrictionRef,{businessId:a.businessId,recipient:email,active:true,reason:'unsubscribed',source:'gmail_explicit_request',providerMessageId:signal.providerMessageId,providerThreadId:signal.providerThreadId,updatedAt:now()},{merge:true});
    }
   });results.push({email,status:hasOptout?'suppressed':auto?'excluded_automated':'needs_review',threads:[...new Set(evidence.map(m=>m.providerThreadId))].length});
  }
  const control=sourceRef(a.businessId,'campaignControl',input.kind==='contact'?'contact_'+input.candidateId:input.kind);
  await control.set({kind:input.kind,checkedAt:now(),nextPageToken:page.nextPageToken||null,complete:!page.nextPageToken&&!errors.length,errors:errors.length,matchedThreads:(page.threads||[]).length,actorUid:a.actorUid,mailbox:c.email});
  return {results,matchedThreads:(page.threads||[]).length,nextPageToken:page.nextPageToken||null,complete:!page.nextPageToken&&!errors.length,errors:errors.length,sent:0,
   message:errors.length?'Some conversations need a separate review. No contacts were approved.':page.nextPageToken?'More history remains. Continue the bounded review.':'Mailbox review recorded. All candidates still require review.'};
 }
 async function restrict(a,input){gate(a);strict(input,['candidateId','reason']);if(!reasons.includes(input.reason)||!/^[a-f0-9]{64}$/.test(input.candidateId||''))fail('invalid-argument','Choose a saved candidate and restriction.');
  const ref=sourceRef(a.businessId,'campaignCandidates',input.candidateId);
  await db.runTransaction(async tx=>{const d=(await tx.get(ref)).data();if(d?.businessId!==a.businessId)fail('permission-denied','Choose a candidate in this Business.');
   const r=sub(a.businessId,'suppression',hash(d.email)),old=(await tx.get(r)).data(),audit=sourceRef(a.businessId,'contactHistory',hash([d.email,'campaign_restriction',input.reason]));
   const prior=await tx.get(audit);if(!prior.exists)tx.create(audit,{businessId:a.businessId,recipient:d.email,action:'campaign_restriction',reason:input.reason,actorUid:a.actorUid,priorRestriction:old||null,recordedAt:now()});
   tx.set(r,{businessId:a.businessId,recipient:d.email,active:true,reason:input.reason,source:'owner_recorded',actorUid:a.actorUid,updatedAt:now()});tx.update(ref,{status:'suppressed',reviewedForSend:false});});return {saved:true,sent:0};
 }
 async function reviewContact(a,input){gate(a);strict(input,['candidateId','sourceHash','projectType','confirm']);
  if(input.confirm!==true)fail('failed-precondition','Review the prior inquiry before marking this contact eligible.');
  const projectType=text(input.projectType,600),ref=sourceRef(a.businessId,'campaignCandidates',input.candidateId);
  return db.runTransaction(async tx=>{const c=(await tx.get(ref)).data(),restriction=c?(await tx.get(sub(a.businessId,'suppression',hash(c.email)))).data():null;
    if(c?.businessId!==a.businessId||!c.evidence?.length||!c.sources?.some(s=>s.kind==='owner_workbook')||input.sourceHash!==require('./campaign_delivery').sourceHash(c))fail('failed-precondition','Review the saved inquiry source first.');
    if(restriction?.active||['suppressed','excluded_automated'].includes(c.status))fail('failed-precondition','This contact is excluded.');
    tx.update(ref,{reviewedForSend:true,roleReviewRequired:false,projectType,reviewedSourceHash:input.sourceHash,reviewedBy:a.actorUid,reviewedAt:now()});
    return {saved:true,message:'Relationship and project context reviewed. No email was sent.'};});
 }
 async function saveDraft(a,input){gate(a);strict(input,['campaignId','title','subject','body','recipientIds','recipientDetails','mailingAddress','proposedSendAt','expectedVersion','objective']);
  const campaignId=text(input.campaignId,80);if(!/^[a-z0-9_-]+$/.test(campaignId)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||!Array.isArray(input.recipientIds)||!input.recipientIds.length||input.recipientIds.length>25||new Set(input.recipientIds).size!==input.recipientIds.length||input.recipientIds.some(id=>!/^[a-f0-9]{64}$/.test(id)))fail('invalid-argument','Choose up to 25 distinct saved candidates.');
  const title=text(input.title,120),subject=text(input.subject,160),body=text(input.body,10000),mailingAddress=input.mailingAddress?text(input.mailingAddress,500):null;
  if(input.proposedSendAt!==null&&(!Number.isSafeInteger(input.proposedSendAt)||input.proposedSendAt<=now()))fail('invalid-argument','Choose a future proposed time or leave it unplanned.');
  if(/[\r\n]/.test(subject))fail('invalid-argument','Use a single-line subject.');
  const details=input.recipientDetails||[];if(!Array.isArray(details)||details.length>25||details.some(d=>!d||!input.recipientIds.includes(d.candidateId))||new Set(details.map(d=>d.candidateId)).size!==details.length)fail('invalid-argument','Personalization must match the saved audience.');
  return db.runTransaction(async tx=>{const ref=sourceRef(a.businessId,'campaigns',campaignId),old=(await tx.get(ref)).data();if((old?.version||0)!==input.expectedVersion)fail('aborted','The campaign changed. Refresh before saving.');
   if(old?.approved)fail('failed-precondition','This approved version is immutable. Review its results instead of editing or resending it.');
   const records=await Promise.all(input.recipientIds.map(id=>tx.get(sourceRef(a.businessId,'campaignCandidates',id))));
   const audience=records.map(d=>{const c=d.data();if(c?.businessId!==a.businessId)fail('permission-denied','Choose candidates in this Business.');if(c.status==='suppressed'||c.status==='excluded_automated')fail('failed-precondition','Remove excluded contacts from the proposed audience.');
    const detail=details.find(x=>x.candidateId===d.id),sourceHash=require('./campaign_delivery').sourceHash(c);
    if(detail){strict(detail,['candidateId','sourceHash','firstName','projectType']);if(detail.sourceHash!==sourceHash)fail('aborted','The inquiry source changed. Review it again.');}
    return {candidateId:d.id,email:c.email,name:c.name||'',firstName:detail?text(detail.firstName,120):(c.name||'').trim().split(/\s+/)[0],
      projectType:detail?text(detail.projectType,600):(c.reviewedSourceHash===sourceHash?c.projectType||'':''),sourceHash,
      provenance:(c.sources||[]).filter(s=>s.kind==='owner_workbook').map(s=>({label:s.label,context:s.context,inquiryDate:s.inquiryDate,sha256:s.sha256})),
      category:c.audienceCategory,sourceCount:(c.sources||[]).length,reviewRequired:true};});
   const restrictions=await Promise.all(audience.map(c=>tx.get(sub(a.businessId,'suppression',hash(c.email)))));
   const links=await Promise.all(audience.map(c=>tx.get(sub(a.businessId,'optoutLinks',hash(c.email)))));
   if(restrictions.some(d=>d.data()?.active))fail('failed-precondition','Remove restricted recipients before saving the proposed audience.');
   if(!['scaled-circle','scaledcircle-staging','demo-business-email'].includes(project))fail('failed-precondition','Campaign unsubscribe is not configured for this environment.');
   for(let i=0;i<audience.length;i++){
    const c=audience[i],token=links[i].data()?.token||crypto.randomBytes(32).toString('base64url');
    if(!links[i].exists){tx.create(links[i].ref,{token,businessId:a.businessId,recipient:c.email,createdAt:now()});
     tx.create(db.doc('businessEmailUnsubscribeLinks/'+hash(token)),{businessId:a.businessId,recipient:c.email,createdAt:now()});}
    c.unsubscribeUrl=`https://us-east1-${project}.cloudfunctions.net/businessEmailUnsubscribeV1?token=${encodeURIComponent(token)}`;
   }
   const saved={businessId:a.businessId,campaignId,title,subject,body,sender:a.beta.mailbox,audience,mailingAddress,proposedSendAt:input.proposedSendAt,
    audienceType:'historical_inquiry',objective:input.objective?text(input.objective,160):old?.objective||'historical_inquiry → estimate_scheduled',
    version:(old?.version||0)+1,status:mailingAddress?'needs_founder_review':'needs_mailing_address',sendingEnabled:false,scheduled:false,approved:false,
    footerIdentitySource:mailingAddress?'owner_supplied':null,results:{sent:0,delivered:null,replies:0,bounced:0,unsubscribed:0,appointments:0,won:0},updatedAt:now(),actorUid:a.actorUid};
   tx.set(ref,saved);for(const c of audience)tx.create(sourceRef(a.businessId,'contactHistory',hash([campaignId,saved.version,c.email])),{businessId:a.businessId,recipient:c.email,candidateId:c.candidateId,campaignId,action:'campaign_draft_prepared',version:saved.version,actorUid:a.actorUid,recordedAt:now(),sent:false});return saved;});
 }
 return {load,importWorkbook,discover,restrict,saveDraft,reviewContact};
}
module.exports={createCampaigns,messages,mailbox,reasons};
