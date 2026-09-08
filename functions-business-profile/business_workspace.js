"use strict";

const crypto = require('node:crypto');
const {hasActivePaidBusinessEntitlement} = require('./subscription_entitlements');
const {createLegalConsentService} = require('./legal_consent');
const VERSION = 'BusinessWorkspaceV1';
const PLANS = Object.freeze({starter:{name:'Starter',price:99,seats:1},growth:{name:'Growth',price:299,seats:3},scale:{name:'Scale',price:499,seats:5},managed_growth:{name:'Managed Growth',price:999,seats:10}});
const PERMISSIONS = Object.freeze(['campaigns','authorizeCampaigns','payments','intelligence','analytics','teamManagement','billing']);
const PRESETS = Object.freeze({admin:PERMISSIONS,campaignManager:['campaigns','authorizeCampaigns','analytics'],analyst:['intelligence','analytics'],finance:['payments','billing']});
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const text = (v,max=160) => typeof v === 'string' ? v.trim().slice(0,max) : '';
function fail(code,message) { const e=new Error(message || code);e.code=code;throw e; }
function id(v) { const s=text(v,128);if(!/^[A-Za-z0-9_-]{1,128}$/.test(s))fail('invalid-argument','Choose a valid workspace.');return s; }
function email(v) { const s=text(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail('invalid-argument','Enter a valid email.');return s; }
function permissions(v) {if(!Array.isArray(v)||v.length>7||v.some(p=>!PERMISSIONS.includes(p)))fail('invalid-argument','Choose supported responsibilities.');return [...new Set(v)].sort();}
function seats(entitlement,now=Date.now()) {return hasActivePaidBusinessEntitlement(entitlement,{nowMillis:now}) ? PLANS[entitlement.planId||entitlement.plan]?.seats||1 : 1;}
function createWorkspaceService({db,auth,FieldValue,Timestamp,now=Date.now,origin='https://scaledcircle.com'}) {
  const legal=createLegalConsentService({db,FieldValue});
  const ref=businessId=>db.doc(`businessWorkspaces/${id(businessId)}`);
  const accessRef=(uid,businessId)=>db.doc(`businessWorkspaceAccess/${id(uid)}/workspaces/${id(businessId)}`);
  const read=(r,tx)=>tx?tx.get(r):r.get();
  async function workspaceName(businessId,owner,tx=null) {
    const existing=text(owner.companyName||owner.businessName||owner.name);
    if(existing)return existing;
    const growth=(await read(db.doc(`businessGrowthProfiles/${businessId}`),tx)).data()||{};
    return text(growth.businessName)||'Business workspace';
  }
  async function actor(uid) {
    if(!uid)fail('unauthenticated','Sign in to continue.');
    const user=await auth.getUser(uid);
    if(user.disabled||!user.emailVerified)fail('permission-denied','Use an enabled account with a verified email.');
    return {uid,email:email(user.email),name:text(user.displayName)||email(user.email)};
  }
  async function authority({uid,businessId,permission,transaction=null,allowExpired=false}) {
    businessId=id(businessId||uid);
    const [ownerSnapshot,workspaceSnapshot,entitlementSnapshot,memberSnapshot]=await Promise.all([
      read(db.doc(`users/${businessId}`),transaction),read(ref(businessId),transaction),read(db.doc(`businessSubscriptions/${businessId}`),transaction),read(ref(businessId).collection('members').doc(uid),transaction)]);
    const owner=ownerSnapshot.data()||{},workspace=workspaceSnapshot.data()||{},entitlement=entitlementSnapshot.data()||{},member=memberSnapshot.data()||{};
    if(owner.disabled===true||owner.role!=='business'||(owner.active!==true&&owner.betaAccess!=='approved'))fail('permission-denied','This Business workspace is unavailable.');
    if(workspace.ownerId&&workspace.ownerId!==businessId)fail('failed-precondition','Workspace ownership needs review.');
    const isOwner=uid===businessId;
    if(!isOwner&&(member.status!=='active'||member.businessId!==businessId||member.uid!==uid))fail('permission-denied','You do not have access to this Business.');
    const capacity=Math.min(seats(entitlement,now()),Number.isSafeInteger(workspace.pendingSeatLimit)?workspace.pendingSeatLimit:10);
    if(!isOwner&&(!Number.isSafeInteger(member.seatIndex)||member.seatIndex<1||member.seatIndex>=capacity))fail('permission-denied','Your team seat is inactive. Ask the owner to review the plan.');
    if(!isOwner&&permission&&!member.permissions?.includes(permission))fail('permission-denied','Your team access does not include this responsibility.');
    if(!allowExpired&&['campaigns','authorizeCampaigns','intelligence'].includes(permission)&&!hasActivePaidBusinessEntitlement(entitlement,{nowMillis:now()}))fail('failed-precondition','Reactivate membership before starting new paid work. Existing obligations remain available.');
    return {businessId,actorUid:uid,isOwner,owner,workspace,member,entitlement,capacity,permissions:isOwner?[...PERMISSIONS]:permissions(member.permissions||[])};
  }
  function audit(tx,businessId,uid,action,target,details={}) {
    const record=ref(businessId).collection('activity').doc();
    tx.create(record,{version:VERSION,businessId,actorUid:uid,action,target,...details,createdAt:FieldValue.serverTimestamp()});return record.id;
  }
  async function inventory(businessId,tx) {
    const [members,invitations]=await Promise.all([read(ref(businessId).collection('members').where('status','==','active').limit(11),tx),read(ref(businessId).collection('invitations').where('status','==','pending').limit(100),tx)]);
    if(members.size>10||invitations.size>=100)fail('resource-exhausted','Team records need review before another change.');
    return {members:members.docs.map(d=>({id:d.id,...d.data()})),invitations:invitations.docs.map(d=>({id:d.id,...d.data()}))};
  }
  const active = m=>m.status==='active';
  const pending = i=>i.status==='pending'&&i.expiresAt?.toMillis()>now();
  return {
    actor,authority,inventory,seats,workspaceName,
    async prepareInvitedAccount({uid,businessId,invitationId,token,name}) {
      if(!uid)fail('unauthenticated','Sign in to continue.');
      businessId=id(businessId);invitationId=id(invitationId);name=text(name,120);
      const account=await auth.getUser(uid);
      if(account.disabled||!name||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('permission-denied','Invalid invitation.');
      return db.runTransaction(async tx=>{
        const inv=(await tx.get(ref(businessId).collection('invitations').doc(invitationId))).data()||{};
        const owner=(await tx.get(db.doc(`users/${businessId}`))).data()||{};
        const userRef=db.doc(`users/${uid}`),existing=await tx.get(userRef);
        if(!pending(inv)||inv.businessId!==businessId||inv.email!==email(account.email)||inv.tokenHash!==hash(token)||owner.role!=='business'||(owner.active!==true&&owner.betaAccess!=='approved'))fail('permission-denied','Invalid or expired invitation.');
        if(existing.exists)return {prepared:true,existing:true};
        // A personal login profile only. No Business workspace, approval,
        // subscription or membership is created until verified acceptance.
        tx.create(userRef,{email:email(account.email),displayName:name,role:'business',accountType:'business',activeView:'business',active:false,betaAccess:'pending',signupPurpose:'team_invitation',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
        return {prepared:true,existing:false};
      });
    },
    async list({uid,businessId}) {
      const who=await actor(uid);const a=await authority({uid,businessId,allowExpired:true});
      const canManage=a.permissions.includes('teamManagement');
      const inv=await inventory(a.businessId);
      return {businessId:a.businessId,businessName:await workspaceName(a.businessId,a.owner),actorUid:uid,isOwner:a.isOwner,permissions:a.permissions,
        plan:PLANS[a.entitlement.planId||a.entitlement.plan]?.name||'No active membership',seatLimit:a.capacity,
        seatsUsed:1+inv.members.filter(active).length,seatsReserved:inv.invitations.filter(pending).length,
        owner:{uid:a.businessId,name:text(a.owner.name||a.owner.displayName)||(a.isOwner?who.name:'Business owner'),email:a.isOwner?who.email:text(a.owner.email),status:'active',preset:'owner'},
        members:inv.members.filter(m=>canManage||m.uid===uid).map(m=>({uid:m.uid,name:m.name,email:m.email,preset:m.preset,permissions:m.permissions,status:m.status==='active'&&m.seatIndex>=a.capacity?'plan_inactive':m.status,seatIndex:m.seatIndex})),
        invitations:(canManage?inv.invitations:[]).map(i=>({id:i.id,name:i.name,email:i.email,preset:i.preset,permissions:i.permissions,status:i.status==='pending'&&!pending(i)?'expired':i.status,expiresAtMs:i.expiresAt?.toMillis()||null}))};
    },
    async invite({uid,businessId,data}) {
      const who=await actor(uid),destination=email(data.email),name=text(data.name,120),grants=permissions(data.permissions),preset=Object.keys(PRESETS).includes(data.preset)?data.preset:'custom';
      if(!name)fail('invalid-argument','Enter their name.');
      const token=crypto.randomBytes(32).toString('base64url'),inviteId=hash(destination),requestId=crypto.randomUUID();
      const result=await db.runTransaction(async tx=>{
        const a=await authority({uid,businessId,permission:'teamManagement',transaction:tx,allowExpired:true});
        if(!a.isOwner&&grants.some(p=>!a.permissions.includes(p)))fail('permission-denied','Only the owner can grant responsibilities you do not hold.');
        const inv=await inventory(a.businessId,tx);
        if(destination===email(a.owner.email)||inv.members.some(m=>active(m)&&m.email===destination))fail('already-exists','This person is already on the team.');
        if(inv.invitations.some(i=>pending(i)&&i.email===destination))fail('already-exists','An invitation is already pending.');
        if(1+inv.members.filter(active).length+inv.invitations.filter(pending).length>=a.capacity)fail('resource-exhausted','All seats are used or reserved. Remove a member or upgrade your plan.');
        const businessName=await workspaceName(a.businessId,a.owner,tx);
        const invitation={version:VERSION,businessId:a.businessId,name,email:destination,permissions:grants,preset,status:'pending',tokenHash:hash(token),invitedBy:uid,expiresAt:Timestamp.fromMillis(now()+INVITE_TTL_MS),createdAt:FieldValue.serverTimestamp()};
        tx.set(ref(a.businessId),{ownerId:a.businessId,version:VERSION,revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        tx.set(ref(a.businessId).collection('invitations').doc(inviteId),invitation);
        const url=`${origin}/#/team-invitation?business=${encodeURIComponent(a.businessId)}&invitation=${inviteId}&token=${encodeURIComponent(token)}`;
        tx.create(db.doc(`outboundEmailJobs/team_invitation_${requestId}`),{template:'business_team_invitation_v1',status:'queued',fromAddress:'support@scaledcircle.com',to:destination,subject:`You are invited to ${businessName} on ScaledCircle`,
          text:`Hi ${name},\n\n${who.name} invited you to join ${businessName} on ScaledCircle.\n\nSign in or create an account with this email address, then accept your invitation:\n${url}\n\nThis single-use invitation expires in 7 days. No password is included or required by email. If you did not expect this invitation, you can ignore it.`,createdAt:FieldValue.serverTimestamp()});
        audit(tx,a.businessId,uid,'team_invited',inviteId,{permissions:grants});return {invitationId:inviteId,emailQueued:true,emailJobId:`team_invitation_${requestId}`};
      });return result;
    },
    async accept({uid,businessId,invitationId,token}) {
      const who=await actor(uid);businessId=id(businessId);invitationId=id(invitationId);
      if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('invalid-argument','The invitation is invalid.');
      return db.runTransaction(async tx=>{
        const owner=(await tx.get(db.doc(`users/${businessId}`))).data()||{};
        if(owner.disabled===true||owner.role!=='business'||(owner.active!==true&&owner.betaAccess!=='approved'))fail('permission-denied','Workspace unavailable.');
        const workspace=await tx.get(ref(businessId));
        const ent=(await tx.get(db.doc(`businessSubscriptions/${businessId}`))).data()||{};
        const invitationRef=ref(businessId).collection('invitations').doc(invitationId),snapshot=await tx.get(invitationRef),inv=snapshot.data()||{};
        if(inv.email!==who.email||inv.businessId!==businessId||inv.tokenHash!==hash(token))fail('permission-denied','This invitation belongs to a different email or is invalid.');
        const memberRef=ref(businessId).collection('members').doc(uid),existing=(await tx.get(memberRef)).data();
        if(inv.status==='accepted'&&inv.acceptedBy===uid&&existing?.status==='active')return {businessId,accepted:true,duplicate:true};
        if(!pending(inv))fail('failed-precondition','This invitation expired or was revoked. Ask for a new invitation.');
        if(uid===businessId||existing?.status==='active')fail('already-exists','You are already a member.');
        await legal.requireCurrent({uid,agreementTypes:['terms','privacy'],transaction:tx});
        const all=await inventory(businessId,tx),capacity=Math.min(seats(ent,now()),Number.isSafeInteger(workspace.data()?.pendingSeatLimit)?workspace.data().pendingSeatLimit:10);
        const used=new Set([0,...all.members.filter(active).map(m=>m.seatIndex)]);
        const available=Array.from({length:capacity},(_,i)=>i).find(i=>i>0&&!used.has(i));
        if(available==null||1+all.members.filter(active).length+all.invitations.filter(pending).length>capacity)fail('resource-exhausted','The plan no longer has enough seats. Ask the owner to review the team.');
        if(workspace.data()?.ownerId&&workspace.data().ownerId!==businessId)fail('failed-precondition','Ownership mismatch.');
        tx.set(memberRef,{version:VERSION,businessId,uid,name:inv.name,email:who.email,permissions:permissions(inv.permissions),preset:inv.preset,seatIndex:available,status:'active',acceptedAt:FieldValue.serverTimestamp()});
        tx.update(invitationRef,{status:'accepted',acceptedBy:uid,acceptedAt:FieldValue.serverTimestamp()});
        tx.set(ref(businessId),{ownerId:businessId,revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        tx.set(accessRef(uid,businessId),{businessId,businessName:text(owner.companyName||owner.businessName||owner.name)||'Business workspace',status:'active',updatedAt:FieldValue.serverTimestamp()});
        tx.set(db.doc(`users/${uid}`),{activeBusinessId:businessId},{merge:true});
        audit(tx,businessId,uid,'team_invitation_accepted',uid);return {businessId,accepted:true,duplicate:false};
      });
    },
    async changeMember({uid,businessId,data}) {
      await actor(uid);const target=id(data.memberId||data.invitationId);
      if(!['remove','edit','revoke'].includes(data.action))fail('invalid-argument','Choose a team action.');
      return db.runTransaction(async tx=>{
        const a=await authority({uid,businessId,permission:'teamManagement',transaction:tx,allowExpired:true});
        if(target===a.businessId)fail('permission-denied','Business ownership cannot be removed or edited here.');
        const targetRef=ref(a.businessId).collection(data.action==='revoke'?'invitations':'members').doc(target),snapshot=await tx.get(targetRef),current=snapshot.data();
        if(!current)fail('not-found','Team entry not found.');
        if(!a.isOwner&&(target===uid||current.permissions?.some(p=>!a.permissions.includes(p))))fail('permission-denied','Only the owner can change this access.');
        if(data.action==='revoke'&&current.status!=='pending')return {changed:false};
        if(data.action==='remove'&&current.status==='removed')return {changed:false};
        const values=data.action==='edit'?{permissions:permissions(data.permissions),preset:Object.keys(PRESETS).includes(data.preset)?data.preset:'custom'}:{status:data.action==='remove'?'removed':'revoked'};
        if(!a.isOwner&&values.permissions?.some(p=>!a.permissions.includes(p)))fail('permission-denied','Only the owner can grant those responsibilities.');
        tx.update(targetRef,{...values,updatedAt:FieldValue.serverTimestamp()});
        tx.set(ref(a.businessId),{revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        if(data.action==='remove')tx.set(accessRef(target,a.businessId),{status:'removed',updatedAt:FieldValue.serverTimestamp()},{merge:true});
        const auditId=audit(tx,a.businessId,uid,`team_${data.action}`,target,values);return {changed:true,auditId};
      });
    },
  };
}
module.exports={VERSION,PLANS,PERMISSIONS,PRESETS,INVITE_TTL_MS,seats,permissions,createWorkspaceService};
