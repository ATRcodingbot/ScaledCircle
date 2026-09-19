'use strict';
const crypto=require('node:crypto');
const entitlement=require('./shared/subscription_entitlements');
const PRODUCT='lead_generation_research',VERSION='CustomerGrowthDogfoodGrantV1';
const ms=v=>v?.toMillis?v.toMillis():typeof v==='number'?v:Date.parse(v);
const fail=m=>{const e=Error(m);e.code='failed-precondition';throw e;};
function active(record,businessId,allowedBusinessId,base,now){
  return Boolean(allowedBusinessId&&businessId===allowedBusinessId&&record?.businessUid===businessId&&
    record.schemaVersion===VERSION&&record.product===PRODUCT&&record.source==='internal_dogfood'&&
    record.status==='active'&&record.grantedBy&&record.reason&&ms(record.expiresAt)>now&&
    entitlement.hasActiveManagedGrowthEntitlement(base,{nowMillis:now})&&
    ['internal_qa','internal_beta'].includes(base.source));
}
function createService({db,auth,FieldValue,Timestamp,allowedBusinessId,now=Date.now}){
  async function admin(actor){
    if(!actor?.uid||actor.role!=='admin'||actor.isAdmin!==true||actor.emailVerified!==true)fail('Trusted admin authority is required.');
    const [user,profile]=await Promise.all([auth.getUser(actor.uid),db.doc('users/'+actor.uid).get()]);
    if(user.disabled||!user.emailVerified||profile.data()?.role!=='admin')fail('Trusted admin authority is required.');
  }
  async function grant(input,actor){
    await admin(actor);
    if(!allowedBusinessId||input?.businessUid!==allowedBusinessId||input.product!==PRODUCT)fail('Choose the explicitly configured dogfood Business and product.');
    if(Object.keys(input).some(k=>!['businessUid','product','reason','expiresAt','requestId','enableScheduledResearch'].includes(k))||typeof input.enableScheduledResearch!=='boolean')fail('Unsupported grant field or missing explicit research schedule choice.');
    const reason=typeof input.reason==='string'?input.reason.trim():'';
    const expires=ms(input.expiresAt),requestId=input.requestId;
    if(!reason||reason.length>500||!/^[-A-Za-z0-9_]{1,100}$/.test(requestId||'')||!Number.isFinite(expires)||expires<=now()||expires>now()+365*86400000)fail('Provide an audited reason, request ID and finite expiry.');
    const target=await auth.getUser(allowedBusinessId);
    if(target.disabled||!target.emailVerified)fail('The dogfood Business must be enabled and verified.');
    const id=crypto.createHash('sha256').update(JSON.stringify([VERSION,allowedBusinessId,requestId])).digest('hex');
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify([reason,expires,PRODUCT,actor.uid,input.enableScheduledResearch])).digest('hex');
    const ref=db.doc('customerGrowthProductGrants/'+allowedBusinessId),audit=db.doc('entitlementAuditEvents/'+id);
    return db.runTransaction(async tx=>{
      const [baseSnap,ownerSnap,old,event]=await Promise.all([tx.get(db.doc('businessSubscriptions/'+allowedBusinessId)),tx.get(db.doc('users/'+allowedBusinessId)),tx.get(ref),tx.get(audit)]);
      const base=baseSnap.data()||{},owner=ownerSnap.data()||{};
      if(owner.role!=='business'||owner.disabled===true||(owner.active!==true&&owner.betaAccess!=='approved'))fail('The dogfood Business is unavailable.');
      if(!entitlement.hasActiveManagedGrowthEntitlement(base,{nowMillis:now()})||!['internal_qa','internal_beta'].includes(base.source)||expires>ms(base.expiresAt))fail('An active comped Managed Growth base covering the grant expiry is required.');
      if(event.exists){if(event.data().fingerprint!==fingerprint)fail('Grant request ID was already used with different parameters.');return {granted:old.data()?.status==='active',idempotentReplay:true,businessUid:allowedBusinessId,product:PRODUCT};}
      const record={schemaVersion:VERSION,businessUid:allowedBusinessId,product:PRODUCT,source:'internal_dogfood',status:'active',reason,
        grantedBy:actor.uid,grantedAt:FieldValue.serverTimestamp(),expiresAt:Timestamp.fromMillis(expires),auditId:id};
      tx.set(ref,record);
      tx.create(audit,{...record,eventType:'internal_product_dogfood_granted',fingerprint,requestId,previousStatus:old.data()?.status||null});
      if(input.enableScheduledResearch)tx.set(db.doc('customerResearchSchedules/'+allowedBusinessId),{
        businessUid:allowedBusinessId,enabled:true,cadence:'daily',nextRunAt:now(),leaseUntil:0,
        authoritySource:'internal_dogfood',configuredBy:actor.uid,configuredAt:FieldValue.serverTimestamp(),grantAuditId:id,
      },{merge:true});
      return {granted:true,idempotentReplay:false,businessUid:allowedBusinessId,product:PRODUCT,expiresAtMillis:expires,auditId:id};
    });
  }
  async function revoke(input,actor){
    await admin(actor);
    if(!allowedBusinessId||input?.businessUid!==allowedBusinessId||input.product!==PRODUCT||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>500)fail('Choose the configured grant and provide a reason.');
    return db.runTransaction(async tx=>{
      const ref=db.doc('customerGrowthProductGrants/'+allowedBusinessId),old=(await tx.get(ref)).data();
      if(!old||old.businessUid!==allowedBusinessId||old.source!=='internal_dogfood')fail('The dogfood grant does not exist.');
      if(old.status==='revoked')return {revoked:true,idempotentReplay:true};
      const event=db.collection('entitlementAuditEvents').doc();
      tx.update(ref,{status:'revoked',revokedBy:actor.uid,revokedAt:FieldValue.serverTimestamp(),revocationReason:input.reason.trim()});
      tx.create(event,{schemaVersion:VERSION,eventType:'internal_product_dogfood_revoked',businessUid:allowedBusinessId,product:PRODUCT,
        source:'internal_dogfood',reason:input.reason.trim(),revokedBy:actor.uid,occurredAt:FieldValue.serverTimestamp(),grantAuditId:old.auditId});
      return {revoked:true,idempotentReplay:false};
    });
  }
  return {grant,revoke};
}
module.exports={VERSION,PRODUCT,active,createService};
