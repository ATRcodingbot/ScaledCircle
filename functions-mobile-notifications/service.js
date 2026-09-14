'use strict';
const p=require('./policy');
const {createWorkspaceService}=require('./shared/business_workspace');
const fail=(code,message)=>{const e=new Error(message||'Notification request could not be completed.');e.code=code;throw e;};
function createService({db,auth,messaging,FieldValue,Timestamp,project,environment,now=Date.now}){
 const stamp=()=>FieldValue.serverTimestamp(),workspace=createWorkspaceService({db,auth,FieldValue,Timestamp,now});
 const ref=(c,i)=>{if(!p.id(i))fail('invalid-argument');return db.collection(c).doc(i);};
 async function actor(uid){if(!uid)fail('unauthenticated','Sign in to manage notifications.');const [identity,u]=await Promise.all([auth.getUser(uid),ref('users',uid).get()]);const user=u.data();if(identity.disabled||!identity.emailVerified||!user||user.disabled===true||user.deletedAt||['deleted','closing'].includes(user.accountStatus))fail('permission-denied');return user;}
 // Recheck current membership at delivery AND tap. Never infer membership from a token.
 async function authorized(uid,n){try{const user=await actor(uid);if(n.userId!==uid)return false;
  let business=p.id(n.businessId||n.businessUid||n.metadata?.businessId);const type=p.policy(n);if(!type)return false;
  const zoneId=p.id(n.deepLink?.zoneId||n.zoneId);
  if(zoneId){
   const zone=(await ref('campaignZones',zoneId).get()).data();if(!zone||!p.id(zone.campaignId)||!p.id(zone.businessId))return false;
   const campaign=(await ref('campaigns',zone.campaignId).get()).data();if(!campaign||campaign.businessId!==zone.businessId)return false;
   if(n.campaignId&&n.campaignId!==zone.campaignId)return false;
   if(business&&business!==zone.businessId)return false;
   business=zone.businessId;
   if(user.role==='scaler')return uid===zone.assignedScalerId&&['assigned','accepted','in_progress','paused_work_window','incomplete_review','submitted','completed','approved'].includes(zone.status);
  }
  if(business&&business!==uid){const a=await workspace.authority({uid,businessId:business,allowExpired:true});
   const grants=a.permissions;
   if(type.category==='money')return a.isOwner||(n.type.startsWith('billing_')||n.type.startsWith('subscription_'))&&grants.includes('billing');
   if(['growth','social','email'].includes(type.category))return a.isOwner||grants.includes('intelligence');
   if(type.category==='customers')return a.isOwner||grants.includes(n.type.includes('reply')?'communicationsRead':'customersView');
   if(n.type==='business_schedule_update'||n.type==='business_estimate_reminder'){
    const itemId=p.id(n.metadata?.itemId||n.deepLink?.itemId);if(!itemId)return false;
    const item=(await db.doc(`businessOperations/${business}/items/${itemId}`).get()).data();if(!item||item.removedAtMs)return false;
    if(a.isOwner||grants.includes(item.type==='job'?'jobsView':'scheduleView'))return true;
    if(item.type!=='job'||!grants.includes('jobsAssigned'))return false;
    if(item.assignedPeople?.includes('user:'+uid))return true;
    for(const key of item.assignedPeople||[])if(key.startsWith('crew:')){const crew=(await db.doc(`businessOperations/${business}/resources/${key.slice(5)}`).get()).data();if(crew?.linkedUid===uid&&crew.status!=='inactive')return true;}return false;
   }
   return a.isOwner||(!!zoneId&&grants.includes('analytics'));
  }
  // A limited member notification without its workspace cannot safely be classified.
  if(user.role==='business'&&uid!==business){const memberships=await db.collection(`businessWorkspaceAccess/${uid}/workspaces`).where('status','==','active').limit(1).get();if(!memberships.empty&&!business)return false;}
  return true;
 }catch(_){return false;}}
 async function settings(uid){await actor(uid);return p.preferences((await ref('mobileNotificationPreferences',uid).get()).data());}
 async function configure(uid,input){await actor(uid);if(Object.keys(input).some(k=>!['enabled','categories','growthDigest'].includes(k))||typeof input.enabled!=='boolean'||typeof input.growthDigest!=='boolean'||!input.categories||Object.keys(input.categories).some(k=>!p.categories.includes(k)||typeof input.categories[k]!=='boolean'))fail('invalid-argument');const value=p.preferences(input);await ref('mobileNotificationPreferences',uid).set({...value,updatedAt:stamp()});return value;}
 function installation(input){if(typeof input.installationSecret!=='string'||!/^[a-f0-9]{64}$/.test(input.installationSecret))fail('invalid-argument');return p.hash(input.installationSecret);}
 async function register(uid,input){await actor(uid);if(!p.validEnvironment(project,input.environment)||input.environment!==environment||!['ios','android'].includes(input.platform)||typeof input.token!=='string'||input.token.length<30||input.token.length>4096||/\s/.test(input.token))fail('invalid-argument');
  const deviceId=installation(input),device=ref('mobilePushDevices',deviceId),tokenKey=p.hash(input.token),tokenRef=ref('mobilePushTokenBindings',tokenKey);
  await db.runTransaction(async tx=>{const [old,token,devices]=await Promise.all([tx.get(device),tx.get(tokenRef),tx.get(db.collection('mobilePushDevices').where('uid','==',uid).limit(11))]);const oldData=old.data();if(devices.size>=10&&!devices.docs.some(d=>d.id===deviceId))fail('resource-exhausted','Remove an old device before adding another.');if(token.exists&&token.data().deviceId!==deviceId)fail('failed-precondition','Refresh notification permission on this device.');
   if(oldData?.tokenKey&&oldData.tokenKey!==tokenKey)tx.delete(ref('mobilePushTokenBindings',oldData.tokenKey));
   tx.set(tokenRef,{deviceId,uid,environment});tx.set(device,{uid,token:input.token,tokenKey,platform:input.platform,environment,updatedAtMs:now(),expiresAtMs:now()+30*86400000,enabled:true});
  });return {registered:true,platform:input.platform};}
 // Possession of the random installation secret can only REVOKE this installation.
 // This also works after an expired auth session; it cannot read or register anything.
 async function unregister(input){const d=ref('mobilePushDevices',installation(input));await db.runTransaction(async tx=>{const old=await tx.get(d);if(old.data()?.tokenKey)tx.delete(ref('mobilePushTokenBindings',old.data().tokenKey));tx.delete(d);});return {removed:true};}
 async function open(uid,notificationId){
  const d=await ref('notifications',notificationId).get(),n=d.data();if(!n||!await authorized(uid,n))return {available:false};
  const data=p.safeRecord(n),business=p.id(n.businessId||n.businessUid||n.metadata?.businessId||uid);
  if(['business_schedule_update','business_estimate_reminder'].includes(n.type)){
   const itemId=p.id(n.metadata?.itemId||n.deepLink?.itemId);if(!business||!itemId)return {available:false};
   const item=(await db.doc(`businessOperations/${business}/items/${itemId}`).get()).data();if(!item||item.removedAtMs)return {available:false};
   data.deepLink={destination:'business_schedule',businessId:business,itemId,startMs:item.startMs};
  }
  if(n.type==='business_email_reply'){
   const opId=p.id(n.deepLink?.operationId);if(!opId)return {available:false};
   const op=(await db.doc(`businessMailboxes/${business}/operations/${opId}`).get()).data();if(op?.state!=='sent'||op.businessId!==business)return {available:false};
  }
  if(n.type==='landing_page_inquiry'&&p.id(n.entityId))data.deepLink={destination:'business_inquiry',leadId:n.entityId,businessId:business};
  return {available:true,notificationId,...data};
 }
 async function check(uid,input){await actor(uid);const deviceId=installation(input),device=(await ref('mobilePushDevices',deviceId).get()).data();if(device?.uid!==uid||device.environment!==environment||!device.enabled)fail('failed-precondition','Enable notifications on this device first.');const notificationId='push_check_'+p.hash([uid,deviceId,Math.floor(now()/300000)].join(':')),n=ref('notifications',notificationId);await db.runTransaction(async tx=>{if((await tx.get(n)).exists)return;tx.create(n,{userId:uid,type:'mobile_push_check',title:'Notification check',message:'This is your requested device notification check. No work or payment was created.',read:false,createdAt:stamp(),deepLink:{destination:'notification_check'},source:{kind:'self_requested_device_check',actorUid:uid},targetDeviceId:deviceId});});return {notificationId};}
 async function enqueue(notificationId){const r=ref('notifications',notificationId);await db.runTransaction(async tx=>{const n=(await tx.get(r)).data();if(!n||n.push?.status)return;const policy=p.policy(n),created=n.createdAt?.toMillis?.()||0;
  if(!policy||!created||now()-created>86400000){tx.update(r,{push:{status:'in_app_only',updatedAt:stamp()}});return;}
  tx.update(r,{push:{status:policy.immediate?'queued':'digest_queued',category:policy.category,nextAttemptMs:policy.immediate?now():Math.max(n.aggregateWindowEndMs||0,(Math.floor(now()/policy.aggregateMs)+1)*policy.aggregateMs)+30000,attempts:0,updatedAt:stamp()}});
 });}
 async function sendGroup(docs){const all=docs.map(d=>({id:d.id,...d.data()})),first=all[0];if(!first)return;
  const pref=await settings(first.userId).catch(()=>null),policy=p.policy(first);const eligible=[];
  for(const n of all){const allowed=pref&&(pref.enabled||n.type==='mobile_push_check')&&(policy.required||pref.categories[policy.category]!==false)&&(policy.category!=='growth'||pref.growthDigest)&&await authorized(n.userId,n);
   if(allowed&&!n.read)eligible.push(n);else await ref('notifications',n.id).update({'push.status':'suppressed','push.nextAttemptMs':FieldValue.delete(),'push.updatedAt':stamp()});}
  if(!eligible.length)return;
  const leader=eligible[0];const devices=(await db.collection('mobilePushDevices').where('uid','==',leader.userId).limit(10).get()).docs.filter(d=>{const v=d.data();return v.enabled&&v.environment===environment&&v.expiresAtMs>now()&&(!leader.targetDeviceId||leader.targetDeviceId===d.id);});
  for(const device of devices){
   const dv=device.data(),receipts=eligible.map(n=>ref('mobilePushReceipts',p.hash(n.id+':'+device.id)));
   const claimed=await db.runTransaction(async tx=>{
    const [seen,current]=await Promise.all([Promise.all(receipts.map(r=>tx.get(r))),tx.get(device.ref)]);
    if(current.data()?.uid!==leader.userId||current.data()?.tokenKey!==dv.tokenKey)return [];
    const selected=eligible.filter((n,i)=>{const r=seen[i].data();return !r||(r.status==='retryable'&&r.attempts<3);});
    for(const n of selected){const i=eligible.indexOf(n),old=seen[i].data();tx.set(receipts[i],{notificationId:n.id,deviceId:device.id,uid:leader.userId,status:'sending',attempts:(old?.attempts||0)+1,updatedAt:stamp()});}
    return selected;
   });
   if(!claimed.length)continue;
   const update=async fields=>{const batch=db.batch();for(const n of claimed)batch.update(ref('mobilePushReceipts',p.hash(n.id+':'+device.id)),{...fields,updatedAt:stamp()});await batch.commit();};
   // Revocation immediately before external transport; payload itself stays generic.
   const current=(await device.ref.get()).data();
   if(current?.uid!==leader.userId||current.tokenKey!==dv.tokenKey||!(await Promise.all(claimed.map(n=>authorized(n.userId,n)))).every(Boolean)){await update({status:'suppressed'});continue;}
   try{const providerId=await messaging.send(p.message(claimed[0],claimed[0].id,dv,environment,claimed.length));await update({status:'accepted',providerMessageId:providerId});}
   catch(e){const kind=p.failure(e.code);await update({status:kind,failureCategory:kind});if(kind==='invalid_device')await db.runTransaction(async tx=>{const current=await tx.get(device.ref);if(current.data()?.tokenKey===dv.tokenKey){tx.delete(device.ref);tx.delete(ref('mobilePushTokenBindings',dv.tokenKey));}});}
  }
  for(const n of eligible){
   const outcomes=await Promise.all(devices.map(d=>ref('mobilePushReceipts',p.hash(n.id+':'+d.id)).get()));const states=outcomes.map(d=>d.data()).filter(Boolean);
   const retry=states.some(r=>r.status==='retryable'&&r.attempts<3),accepted=states.filter(r=>r.status==='accepted').length;
   const uncertain=states.some(r=>['sending','uncertain'].includes(r.status)),configuration=states.some(r=>r.status==='provider_configuration');
   await ref('notifications',n.id).update({'push.status':retry?'retry_pending':uncertain?'confirmation_unknown':configuration?'provider_needs_attention':accepted?'provider_accepted':devices.length?'not_delivered':'no_registered_device','push.attempts':Math.max(0,...states.map(r=>r.attempts)),'push.acceptedDevices':accepted,'push.digestCount':eligible.length,'push.nextAttemptMs':retry?now()+300000:FieldValue.delete(),'push.updatedAt':stamp()});
  }
 }
 async function drain(){const due=await db.collection('notifications').where('push.nextAttemptMs','<=',now()).limit(100).get();const groups=new Map();for(const doc of due.docs){const n=doc.data(),policy=p.policy(n);if(!policy){await doc.ref.update({'push.status':'in_app_only','push.nextAttemptMs':FieldValue.delete()});continue;}const key=policy.immediate?doc.id:[n.userId,n.businessId||n.metadata?.businessId||'',policy.category,n.type,n.deepLink?.operationId||'',n.aggregateWindowEndMs||Math.floor((n.createdAt?.toMillis?.()||0)/policy.aggregateMs)].join(':');groups.set(key,[...(groups.get(key)||[]),doc]);}for(const group of groups.values())await sendGroup(group);return {processed:due.size};}
 return {actor,authorized,settings,configure,register,unregister,open,check,enqueue,drain,sendGroup};
}
module.exports={createService};
