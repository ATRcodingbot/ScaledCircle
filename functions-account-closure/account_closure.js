'use strict';

// Customer authority, initially deployed only in staging. Financial, consent,
// review and attribution history are retained; a deleted UID is never recycled.
const VERSION = 'AccountClosureV1';
const fail = (code,message) => {throw Object.assign(Error(message),{code});};
const MESSAGES = {
  owner:'Transfer ownership or close your Business before deleting its final owner.',
  balance:'Resolve your Wallet balance and pending payouts before deleting your account.',
  work:'Finish or cancel outstanding work before deleting your account.',
  referral:'Resolve outstanding referral rewards or adjustments before deleting your account.',
  integration:'Your linked payout or personal integration account needs closure review first.',
  inventory:'Your account history needs review before deletion can continue.',
  account:'This account cannot be deleted through the customer flow.',
};
function createService({db,auth,FieldValue,project,appEnv,now=Date.now}) {
  const stamp=()=>FieldValue.serverTimestamp();
  function runtime() {
    if(!((project==='scaledcircle-staging'&&appEnv==='staging')||(project==='scaled-circle'&&appEnv==='production')))fail('failed-precondition','Account deletion is not enabled in this environment.');
  }
  async function inventory(uid,tx) {
    const paths=['users','accountClosures','wallets','scalerCashoutBalances','stripeConnectedAccounts',
      'businessWorkspaces','businessSubscriptions','scalerAffiliateProfiles','activeTrackingSessions'];
    const snapshots=await Promise.all(paths.map(p=>tx.get(db.doc(`${p}/${uid}`))));
    const data=Object.fromEntries(paths.map((p,i)=>[p,snapshots[i].data()]));
    const queries=[['earningEntries',db.collection(`wallets/${uid}/transactions`).where('type','==','scaler_earnings')],['zones',db.collection('campaignZones').where('assignedScalerId','==',uid)],
      ['transfers',db.collection('scalerTransfers').where('scalerId','==',uid)],
      ['operations',db.collection('financialOperations').where('ownerId','==',uid)],
      ['referral',db.collection('referralLiabilities').where('beneficiaryUid','==',uid)],
      ['referred',db.collection('referralLiabilities').where('referredId','==',uid)],
      ['access',db.collection(`businessWorkspaceAccess/${uid}/workspaces`)]];
    const lists=await Promise.all(queries.map(async([name,q])=>[name,await tx.get(q.limit(101))]));
    const groups=Object.fromEntries(lists), blockers=[];
    if(lists.some(([,s])=>s.size>100))blockers.push('inventory');
    const u=data.users||{};
    if(!['business','scaler'].includes(u.role))blockers.push('account');
    const transferred=data.businessWorkspaces && typeof data.businessWorkspaces.ownerId==='string' && data.businessWorkspaces.ownerId.length>0 && data.businessWorkspaces.ownerId!==uid;
    if(!transferred && (data.businessWorkspaces || data.businessSubscriptions || (u.role==='business'&&u.signupPurpose!=='team_invitation')))blockers.push('owner');
    const w=data.wallets||{},b=data.scalerCashoutBalances||{};
    if(['availableBalance','pendingBalance','cashoutAvailableCents','cashoutPendingCents'].some(k=>Number(w[k]||0)!==0)||
        ['availableCents','pendingCents'].some(k=>Number(b[k]||0)!==0)||b.activeOperationId)blockers.push('balance');
    if(groups.earningEntries.docs.some(d=>d.data().status && !['available','completed','paid','approved','reversed','canceled','cancelled'].includes(d.data().status)))blockers.push('balance');
    if(groups.transfers.docs.some(d=>!['reversed','transferred_to_connected_account','paid','completed'].includes(d.data().status))||
        groups.operations.docs.some(d=>!['reversed','processed','completed','failed_terminal','canceled'].includes(d.data().status||d.data().state)))blockers.push('balance');
    if(data.activeTrackingSessions?.sessionId || data.activeTrackingSessions?.trackingSessionId ||
        groups.zones.docs.some(d=>!['completed','cancelled','canceled','closed'].includes(d.data().status)||d.data().activeTrackingSessionId))blockers.push('work');
    if(groups.referral.docs.some(d=>{const e=d.data();return e.reservedCents!==0 || e.currentCents-e.paidCents!==0;})||
        groups.referred.docs.some(d=>{const e=d.data();return e.currentCents!==0||e.reservedCents!==0;}))blockers.push('referral');
    // Provider financial identity is audit evidence, not a credential to erase.
    if(data.stripeConnectedAccounts)blockers.push('integration');
    const membershipIds=new Set(groups.access.docs.map(d=>d.id));
    if(u.activeBusinessId && u.activeBusinessId!==uid)membershipIds.add(u.activeBusinessId);
    const members=await Promise.all([...membershipIds].map(async businessId=>({businessId,
      doc:await tx.get(db.doc(`businessWorkspaces/${businessId}/members/${uid}`)),
      workspace:await tx.get(db.doc(`businessWorkspaces/${businessId}`))})));
    if(members.some(m=>m.workspace.data()?.ownerId===uid))blockers.push('owner');
    return {data,groups,members,blockers:[...new Set(blockers)]};
  }
  async function preflight(uid) {
    runtime(); const who=await auth.getUser(uid);
    if(who.disabled)fail('permission-denied','This account is disabled.');
    return db.runTransaction(async tx=>{
      const i=await inventory(uid,tx);
      return {uid,email:who.email||null,canDelete:i.blockers.length===0,blockers:i.blockers.map(k=>MESSAGES[k]),
        availableBalanceCents:Math.round(Number(i.data.wallets?.availableBalance||0)*100),
        memberships:i.members.filter(m=>m.doc.data()?.status==='active').length,
        retainsFinancialHistory:true,environment:appEnv};
    });
  }
  async function finish(uid) {
    runtime();const ref=db.doc('accountClosures/'+uid), marker=(await ref.get()).data();
    if(marker?.status==='completed')return {deleted:true};
    if(marker?.status!=='closing')fail('failed-precondition','No confirmed deletion request.');
    // Durable intent precedes Auth mutation. The task trigger can resume after
    // a lost response/crash; the customer does not need to log into a deleted UID.
    try{await auth.updateUser(uid,{disabled:true});await auth.revokeRefreshTokens(uid);}
    catch(e){if(e.code!=='auth/user-not-found')throw e;}
    for(const name of ['discoveryPreferences','marketProfiles','activeTrackingSessions','pushTokens','deviceTokens','notificationPreferences'])
      await db.recursiveDelete(db.doc(`${name}/${uid}`));
    for(const name of ['notifications']) {
      let rows;
      do {rows=await db.collection(name).where('userId','==',uid).limit(200).get();
        if(rows.size){const batch=db.batch();rows.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}
      }while(rows.size===200);
    }
    // Uploaded completion evidence is retained with its immutable work history.
    // Business integration credentials belong to the workspace, not its member.
    try{await auth.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
    await db.runTransaction(async tx=>{
      const current=(await tx.get(ref)).data();if(current?.status==='completed')return;
      tx.set(db.doc('users/'+uid),{uid,accountStatus:'deleted',role:'deleted',active:false,disabled:true,
        displayName:'Deleted account',deletedAt:stamp()});
      tx.update(ref,{status:'completed',authDeleted:true,sessionsRevoked:true,completedAt:stamp()});
    });
    return {deleted:true};
  }
  async function close(uid,{confirmation,authTime}={}) {
    runtime();
    if(confirmation!=='DELETE')fail('invalid-argument','Type DELETE to confirm.');
    if(!Number.isFinite(authTime)||now()/1000-authTime>300||authTime>now()/1000+30)
      fail('unauthenticated','Sign in again to confirm account deletion.');
    const who=await auth.getUser(uid);
    if(who.disabled)fail('permission-denied','This account is disabled.');
    await db.runTransaction(async tx=>{
      const i=await inventory(uid,tx),ref=db.doc('accountClosures/'+uid);
      if(i.data.accountClosures?.status==='closing')return;
      if(i.blockers.length)fail('failed-precondition',i.blockers.map(k=>MESSAGES[k]).join(' '));
      tx.create(ref,{version:VERSION,uid,status:'closing',requestedBy:uid,authTime,confirmedAt:stamp(),
        retainedRecords:['compensation','wallet_ledger','referral_ledger','review_history','legal_consents','audit'],
        previousRole:i.data.users.role,environment:appEnv});
      tx.set(db.doc('users/'+uid),{uid,role:'deleted',accountStatus:'closing',active:false,disabled:true,displayName:'Deleted account'});
      for(const m of i.members)if(m.doc.exists){
        tx.update(m.doc.ref,{status:'removed',removedReason:'account_deleted',removedAt:stamp()});
        tx.set(db.doc(`businessWorkspaceAccess/${uid}/workspaces/${m.businessId}`),{businessId:m.businessId,status:'removed',updatedAt:stamp()},{merge:true});
        tx.set(m.workspace.ref,{revision:FieldValue.increment(1),updatedAt:stamp()},{merge:true});
        tx.create(m.workspace.ref.collection('activity').doc('account_deleted_'+uid),{actorUid:uid,action:'member_account_deleted',target:uid,createdAt:stamp()});
      }
      if(i.data.scalerAffiliateProfiles)tx.update(db.doc('scalerAffiliateProfiles/'+uid),{status:'closed',closedReason:'account_deleted',closedAt:stamp()});
    });
    return finish(uid);
  }
  return {preflight,close,finish};
}
module.exports={createService,VERSION};
