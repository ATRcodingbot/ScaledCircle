"use strict";

// Access approval is independent of all subscription, billing and seat grants.
const {isDeepStrictEqual} = require('node:util');
const {assertTrustedAdmin, stableId} = require('./admin_operations');
const {createLegalConsentService} = require('./legal_consent');
const {isProfileReady} = require('./managed_growth_profile');
const geography = require('./business_geography');
const VERSION = 'BusinessAccessApprovalV1';
function fail(code, message) {const error = new Error(message); error.code = code; throw error;}
function validUid(uid) {return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);}
function state(user, account) {
  if (account.disabled || user.disabled === true || ['disabled', 'suspended', 'revoked', 'rejected'].includes(user.betaAccess)) return 'Unavailable';
  if (user.active === true && user.betaAccess === 'approved') return 'Approved';
  if (user.active === false && user.betaAccess === 'pending') return 'Pending';
  return 'Needs review';
}
function createService({db, auth, FieldValue, environment}) {
  const legal = createLegalConsentService({db, FieldValue});
  const geo = geography.createService({db, FieldValue});
  async function adminAccount(actor) {
    try {assertTrustedAdmin(actor);} catch (_) {fail('permission-denied', 'Verified administrator authority is required.');}
    if (!validUid(actor.uid)) fail('permission-denied', 'Verified administrator authority is required.');
    const account = await auth.getUser(actor.uid);
    if (account.disabled || !account.emailVerified) fail('permission-denied', 'Verified administrator authority is required.');
    if (!['production', 'staging', 'test'].includes(environment)) fail('failed-precondition', 'Business approval is unavailable.');
  }
  async function target(input, mutation) {
    const allowed = mutation ? ['uid'] : ['uid', 'email'];
    if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(k => !allowed.includes(k)) ||
        (Object.hasOwn(input, 'uid') ? 1 : 0) + (Object.hasOwn(input, 'email') ? 1 : 0) !== 1 ||
        (input.uid !== undefined && !validUid(input.uid)) ||
        (input.email !== undefined && (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))))
      fail('invalid-argument', 'Choose one exact Business account.');
    try {return input.uid ? await auth.getUser(input.uid) : await auth.getUserByEmail(input.email.trim().toLowerCase());}
    catch (error) {if (error.code === 'auth/user-not-found') fail('not-found', 'Business account not found.'); throw error;}
  }
  async function inspect(tx, account, actor) {
    const uid = account.uid;
    const refs = ['users/' + actor.uid, 'users/' + uid, 'businessGrowthProfiles/' + uid,
      'businessOnboarding/' + uid, 'businessWorkspaces/' + uid].map(p => db.doc(p));
    const [admin, userDoc, profileDoc, setupDoc, workspaceDoc] = await Promise.all(refs.map(r => tx.get(r)));
    if (admin.data()?.role !== 'admin' || admin.data()?.disabled === true)
      fail('permission-denied', 'Verified administrator authority is required.');
    if (!userDoc.exists || userDoc.data().role !== 'business') fail('failed-precondition', 'Choose an existing Business owner account.');
    const user = userDoc.data(), profile = profileDoc.data() || {}, setup = setupDoc.data() || {}, workspace = workspaceDoc.data() || {};
    const status = state(user, account);
    let reason = null;
    if (status === 'Unavailable') reason = 'This Business is suspended, disabled or no longer eligible for approval.';
    else if (!account.emailVerified) reason = 'The Business owner must verify their email.';
    else if (user.signupPurpose === 'team_invitation' || (workspace.ownerId && workspace.ownerId !== uid) ||
        (user.activeBusinessId && user.activeBusinessId !== uid)) reason = 'Choose the Business owner, not a team member.';
    else if (status === 'Needs review') reason = 'The current access state needs review before approval.';
    else if (status === 'Pending') {
      if (!isProfileReady(profile) || !setup.completedAt || setup.ownerUid !== uid || setup.businessId !== uid ||
          profile.businessUid !== uid || !setup.contactName?.trim()) reason = 'The Business owner must complete their profile.';
      else if (setup.geography?.schemaVersion !== geography.VERSION || !setup.geography.confirmedAt)
        reason = 'The Business owner must confirm their base and service areas.';
      else {
        try {
          const saved = setup.geography;
          const selected = await geo.select({uid, transaction:tx, input:{baseSelectionId:saved.base?.selectionId,
            serviceAreaSelectionIds:saved.serviceAreas?.map(p => p.selectionId)}});
          if (!isDeepStrictEqual(selected.base, saved.base) || !isDeepStrictEqual(selected.serviceAreas, saved.serviceAreas))
            reason = 'Saved Business geography needs review.';
        } catch (error) {
          if (!['invalid-argument', 'failed-precondition'].includes(error.code)) throw error;
          reason = 'The Business owner must confirm valid base and service areas.';
        }
      }
      const consent = await legal.status({uid, agreementTypes:['terms', 'privacy'], transaction:tx});
      if (consent.missing.length) reason = 'The Business owner must accept current Terms and Privacy.';
    }
    return {ref:refs[1], user, view:{uid, email:account.email, businessName:profile.businessName || user.companyName || 'Business',
      state:status, eligible:status === 'Pending' && !reason, reason, approved:status === 'Approved' && !reason}};
  }
  return {
    async load({input, actor}) {
      await adminAccount(actor); const account = await target(input, false);
      return db.runTransaction(async tx => (await inspect(tx, account, actor)).view);
    },
    async approve({input, actor}) {
      await adminAccount(actor); const account = await target(input, true);
      return db.runTransaction(async tx => {
        const {ref, user, view} = await inspect(tx, account, actor);
        const auditId = stableId([VERSION, account.uid]);
        const auditRef = db.doc('adminAuditEvents/' + auditId);
        const notificationId = 'business_access_approved_' + auditId;
        const notificationRef = db.doc('notifications/' + notificationId);
        const [audit, notification] = await Promise.all([tx.get(auditRef), tx.get(notificationRef)]);
        if (view.approved) return {...view, changed:false, auditId:audit.exists ? auditId : null};
        if (!view.eligible) fail('failed-precondition', view.reason || 'Business approval is unavailable.');
        // An earlier approval must never restore later revoked/suspended access.
        if (audit.exists || notification.exists) fail('failed-precondition', 'Previous approval history requires administrator review.');
        const at = FieldValue.serverTimestamp();
        tx.update(ref, {active:true, betaAccess:'approved', updatedAt:at});
        tx.create(auditRef, {schemaVersion:VERSION, eventType:'business_access_approved', targetUid:account.uid,
          businessId:account.uid, performedBy:actor.uid, environment, occurredAt:at,
          previousState:{active:user.active, betaAccess:user.betaAccess}, resultingState:{active:true, betaAccess:'approved'}});
        tx.create(notificationRef, {schemaVersion:2, id:notificationId, userId:account.uid, type:'business_access_approved',
          title:'Business account approved', message:'Your ScaledCircle Business account has been approved. You can now enter your Business workspace. Paid plans are managed separately in Billing.',
          read:false, channel:'in_app', emailRequested:false, pushRequested:false, createdAt:at, updatedAt:at});
        return {...view, eligible:false, approved:true, state:'Approved', changed:true, auditId, notificationId};
      });
    },
  };
}
module.exports = {VERSION, createService, state};
