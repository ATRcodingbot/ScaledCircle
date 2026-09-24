'use strict';
const pricing = require('./campaign_funding_quote');
async function quote({request, db, auth, FieldValue, Timestamp, HttpsError}) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to plan a campaign.');
  const user = await auth.getUser(request.auth.uid);
  if (user.disabled || !user.emailVerified) throw new HttpsError('permission-denied', 'Use a verified, enabled Business account.');
  const profile = (await db.doc('users/' + request.auth.uid).get()).data() || {};
  const businessId = request.data?.businessId || profile.activeBusinessId || request.auth.uid;
  const workspace = require('./business_workspace').createWorkspaceService({db, auth, FieldValue, Timestamp});
  await workspace.authority({uid: request.auth.uid, businessId, permission: 'campaigns', allowExpired: false});
  if (Object.keys(request.data || {}).some(k => !['workerAmountCents', 'businessId'].includes(k))) {
    throw new HttpsError('invalid-argument', 'Provide the worker reserve in integer cents.');
  }
  try {
    return {...pricing.quoteCampaignFunding(request.data?.workerAmountCents), quoteVersion: 1,
      planningOnly: true, feeBasis: 'worker_reserve_including_reserved_bonus'};
  } catch (_) {
    throw new HttpsError('invalid-argument', 'Provide a positive worker reserve in integer cents within policy limits.');
  }
}
module.exports = {quote};
