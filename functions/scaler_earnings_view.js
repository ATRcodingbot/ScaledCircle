"use strict";

// Read-only presentation of economic records. Never evaluates or posts compensation.
const {HttpsError} = require('firebase-functions/v2/https');
const LIMIT = 5000;
const minor = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const dollars = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
const amount = (record) => record.amountCents != null ? minor(record.amountCents) : dollars(record.amount);
const time = (value) => value?.toMillis?.() ?? (Number.isSafeInteger(value) ? value : null);
const fail = () => { throw new HttpsError('failed-precondition', 'Your earnings need a fresh account review. No balance has changed.'); };

function project({wallet, ledger, zones, campaigns, contracts, staging}) {
  const availableCents = wallet.availableBalance == null ? 0 : dollars(wallet.availableBalance);
  if (availableCents == null) fail();
  let lifetimeCents = 0, awaitingReviewCents = 0, payoutPendingCents = 0, reviewAmountUnknown = false;
  const activity = [], posted = new Map(), paidZones = new Set();
  const title = (campaignId) => {
    const c = campaigns.get(campaignId) || {};
    const value = c.campaignName || c.title || c.name;
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : 'Campaign work';
  };
  for (const record of ledger) {
    if ((!staging && record.mode === 'test') ||
        (record.walletSide && record.walletSide !== 'scaler') ||
        (record.currency && record.currency !== 'usd')) continue;
    if (record.type === 'scaler_earnings' && (!record.status || ['available', 'completed', 'paid', 'approved'].includes(record.status))) {
      const cents = amount(record);
      if (cents == null) fail();
      const key = record.transferOperationId || record.payoutId || record.id;
      if (posted.has(key)) { if (posted.get(key) !== cents) fail(); continue; }
      posted.set(key, cents);
      lifetimeCents += cents;
      if (record.zoneId) paidZones.add(record.zoneId);
      activity.push({kind:'approved', title:title(record.campaignId), amountCents:cents,
        at:time(record.createdAt || record.createdAtMillis), zoneId:record.zoneId || null});
    } else if (record.type === 'withdrawal' && ['pending', 'completed', 'failed', 'needs_attention'].includes(record.status)) {
      const cents = amount(record);
      if (cents == null) fail();
      if (record.status === 'pending') payoutPendingCents += cents;
      activity.push({kind:record.status === 'pending' ? 'payout_pending' : record.status === 'completed' ? 'payout_completed' : 'payout_review',
        title:'Cash out', amountCents:cents, at:time(record.createdAt || record.createdAtMillis)});
    }
  }
  for (const zone of zones) {
    if (!['submitted','verification_pending','review_pending'].includes(zone.status) ||
        paidZones.has(zone.id) || ['approved','paid'].includes(zone.reviewStatus) || zone.paymentStatus === 'paid') continue;
    const exceptional = zone.reviewMode === 'technical_review' || zone.reviewMode === 'access_exception' ||
      ['disputed','redo_required'].includes(zone.reviewStatus);
    // Only the stored submission result may supply expected compensation.
    const expected = exceptional ? null : zone.calculatedTransferAmountCents != null ?
      minor(zone.calculatedTransferAmountCents) : dollars(zone.payoutAmount);
    const contract = contracts.get(zone.id) || {};
    if (expected == null) reviewAmountUnknown = true; else awaitingReviewCents += expected;
    activity.push({kind:'awaiting_review', title:title(zone.campaignId), zoneId:zone.id,
      amountCents:expected, at:time(zone.submittedAt || zone.updatedAt),
      coveragePercentage:typeof zone.completionPercentage === 'number' ? zone.completionPercentage : null,
      baseCents:minor(contract.baseAmountCents), bonusCents:minor(zone.calculatedBonusAmountCents),
      technicalReview:exceptional});
  }
  activity.sort((a,b) => (b.at || 0) - (a.at || 0));
  return {availableCents, lifetimeCents, awaitingReviewCents, reviewAmountUnknown, payoutPendingCents,
    activity:activity.slice(0,100), activityHasMore:activity.length > 100,
    cashout:{eligible:false, message:'Cash out is not available for this account yet.'},
    environment:staging ? 'staging' : 'production', currency:'usd'};
}

async function read({db, uid, staging}) {
  return db.runTransaction(async tx => {
    const user = (await tx.get(db.doc('users/'+uid))).data();
    if (user?.role?.toLowerCase() !== 'scaler' || user.disabled === true) {
      throw new HttpsError('permission-denied', 'Sign in with your Scaler account to view earnings.');
    }
    const walletRef = db.doc('wallets/'+uid);
    const [walletDoc, transactions, assignments] = await Promise.all([
      tx.get(walletRef), tx.get(walletRef.collection('transactions').limit(LIMIT+1)),
      tx.get(db.collection('campaignZones').where('assignedScalerId','==',uid).limit(LIMIT+1)),
    ]);
    if (transactions.size > LIMIT || assignments.size > LIMIT) fail(); // Never label a partial sum lifetime earnings.
    const wallet = walletDoc.data() || {};
    if (wallet.ownerId && wallet.ownerId !== uid) fail();
    const ledger = transactions.docs.map(d => ({...d.data(), id:d.id}));
    const zones = assignments.docs.map(d => ({...d.data(), id:d.id}));
    const campaignIds = [...new Set([...ledger,...zones].map(d=>d.campaignId).filter(id=>typeof id==='string' && id && !id.includes('/')))];
    const campaignDocs = await Promise.all(campaignIds.map(id=>tx.get(db.doc('campaigns/'+id))));
    const contractDocs = await Promise.all(zones.filter(z=>['submitted','verification_pending','review_pending'].includes(z.status))
      .map(z=>tx.get(db.doc('assignmentCompensations/'+z.id))));
    return project({wallet, ledger, zones, staging,
      campaigns:new Map(campaignDocs.map(d=>[d.id,d.data() || {}])),
      contracts:new Map(contractDocs.map(d=>[d.id,d.data() || {}]))});
  }, {readOnly:true});
}
module.exports = {read, project};
