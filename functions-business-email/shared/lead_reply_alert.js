'use strict';
const crypto=require('node:crypto');
const id=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(s);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const TEMPLATE='business_email_owner_reply_v1';
function quietUntil(settings,timeZone,now){
 if(settings?.quietStartMinute==null&&settings?.quietEndMinute==null)return now;
 const start=settings?.quietStartMinute,end=settings?.quietEndMinute;
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>=1440||end<0||end>=1440||start===end)throw Error('quiet_hours_invalid');
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const quiet=at=>{const p=Object.fromEntries(fmt.formatToParts(at).map(x=>[x.type,x.value])),minute=Number(p.hour)*60+Number(p.minute);return start<end?minute>=start&&minute<end:minute>=start||minute<end;};
 let at=now;for(let i=0;i<1560&&quiet(at);i++)at+=60000;
 if(quiet(at))throw Error('quiet_hours_unresolved');return at;
}
function policyAllows(saved,businessId,at){return saved?.businessId===businessId&&['active','paused'].includes(saved.status)&&!saved.revokedAt&&saved.policy?.notifications?.email===true&&saved.policy.expiresAt>at;}
function validJob(job){return job?.template===TEMPLATE&&id(job.businessUid)&&id(job.operationId)&&id(job.alertId)&&job.to===job.ownerEmail&&job.fromAddress==='support@scaledcircle.com'&&!job.cc&&!job.bcc&&!job.headers&&!job.html;}
function createAlerts({db,getOwner,now=Date.now}){
 const root=b=>db.doc('businessMailboxes/'+b),policy=b=>db.doc(`agentPermissions/${b}_lead_generator/authorizations/business_email`);
 async function enqueue(businessId,operationId){
  if(!id(businessId)||!id(operationId))throw Error('invalid_alert_binding');
  const saved=(await policy(businessId).get()).data();if(!policyAllows(saved,businessId,now()))return {queued:false};
  const replies=await root(businessId).collection('replies').where('operationId','==',operationId).limit(101).get();
  if(replies.size>100)return {queued:false,reason:'conversation_limit'};
  const rows=replies.docs.filter(d=>d.data().businessId===businessId&&d.data().classification==='substantive'&&d.data().certification!==true&&
   Number.isSafeInteger(saved.approvedAt)&&d.data().receivedAt>=saved.approvedAt&&d.data().receivedAt<=now());
  if(!rows.length)return {queued:false};
  const identity=await getOwner(businessId);if(identity.disabled||identity.emailVerified!==true||!identity.email)return {queued:false,reason:'owner_identity'};
  return db.runTransaction(async tx=>{
   const latest=(await tx.get(policy(businessId))).data(),op=(await tx.get(root(businessId).collection('operations').doc(operationId))).data();
   if(!policyAllows(latest,businessId,now())||op?.businessId!==businessId||op.certification===true||!['sent','received'].includes(op.state))return {queued:false};
   const receipts=rows.map(d=>root(businessId).collection('ownerAlertReceipts').doc(d.id));
   const seen=await Promise.all(receipts.map(r=>tx.get(r))),fresh=rows.filter((_,i)=>!seen[i].exists);if(!fresh.length)return {queued:false};
   const alertId=hash([businessId,operationId,Math.floor(now()/300000)]),ref=root(businessId).collection('ownerAlerts').doc(alertId),old=await tx.get(ref);
   // A burst of replies has one notification email, with no private message
   // body in the transactional queue. The exact conversation is authenticated.
   if(!old.exists)tx.create(ref,{businessId,operationId,alertId,ownerEmail:identity.email.toLowerCase(),state:'pending',createdAt:now(),notBefore:Math.max(now()+300000,quietUntil(latest.policy.notifications,latest.policy.timeZone,now()))});
   rows.forEach((d,i)=>{if(!seen[i].exists)tx.create(receipts[i],{alertId,operationId,recordedAt:now()});});
   return {queued:!old.exists,alertId};
  });
 }
 async function drain(businessId){
  const rows=await root(businessId).collection('ownerAlerts').where('state','==','pending').limit(30).get();let queued=0;
  for(const d of rows.docs){if(d.data().notBefore>now())continue;
   const identity=await getOwner(businessId);
   await db.runTransaction(async tx=>{
    const [alert,saved,mail]=await Promise.all([tx.get(d.ref),tx.get(policy(businessId)),tx.get(root(businessId))]);const v=alert.data(),p=saved.data();
    if(v?.state!=='pending'||v.notBefore>now())return;
    if(!policyAllows(p,businessId,now())||mail.data()?.status!=='connected'||mail.data()?.permissions?.read!==true||identity.disabled||identity.emailVerified!==true||identity.email?.toLowerCase()!==v.ownerEmail){tx.update(d.ref,{state:'suppressed'});return;}
    const due=quietUntil(p.policy.notifications,p.policy.timeZone,now());if(due>now()){tx.update(d.ref,{notBefore:due});return;}
    const jobId='email_reply_'+v.alertId,job=db.doc('outboundEmailJobs/'+jobId),old=await tx.get(job);
    if(old.data()?.status==='held_quiet'&&(old.data().attempts||0)===0)tx.update(job,{status:'retry_requested'});
    if(!old.exists)tx.create(job,{template:TEMPLATE,businessUid:businessId,operationId:v.operationId,alertId:v.alertId,to:v.ownerEmail,ownerEmail:v.ownerEmail,
     fromAddress:'support@scaledcircle.com',subject:'A Business email reply needs your review',
     text:'A reply is ready in your Business conversation. Review it securely in ScaledCircle:\nhttps://scaledcircle.com/#/business/email-connection?operation='+encodeURIComponent(v.operationId)+'\nOpening this link does not send or approve a message.',
     status:'queued',attempts:0,connectionGeneration:mail.data().generation,createdAtMs:now()});
    tx.update(d.ref,{state:'queued',jobId,queuedAt:now()});queued++;
   });
  }return {queued};
 }
 async function permitted(job,{ignoreQuiet=false}={}){
  if(!validJob(job))return false;
  const [saved,mail,alert,identity]=await Promise.all([policy(job.businessUid).get(),root(job.businessUid).get(),root(job.businessUid).collection('ownerAlerts').doc(job.alertId).get(),getOwner(job.businessUid)]);
  return policyAllows(saved.data(),job.businessUid,now())&&mail.data()?.status==='connected'&&mail.data()?.permissions?.read===true&&mail.data()?.generation===job.connectionGeneration&&
   alert.data()?.jobId==='email_reply_'+job.alertId&&alert.data()?.operationId===job.operationId&&identity.emailVerified===true&&!identity.disabled&&identity.email?.toLowerCase()===job.to&&
   (ignoreQuiet||quietUntil(saved.data().policy.notifications,saved.data().policy.timeZone,now())<=now());
 }
 async function defer(job,reference){
  const p=(await policy(job.businessUid).get()).data();
  const due=quietUntil(p.policy.notifications,p.policy.timeZone,now());
  await db.runTransaction(async tx=>{const r=await tx.get(reference);if(!['queued','retry_requested'].includes(r.data()?.status)||(r.data()?.attempts||0)!==0)return;
   tx.update(reference,{status:'held_quiet'});tx.update(root(job.businessUid).collection('ownerAlerts').doc(job.alertId),{state:'pending',notBefore:due});});
 }
 return {enqueue,drain,permitted,defer};
}
module.exports={TEMPLATE,quietUntil,validJob,createAlerts};
