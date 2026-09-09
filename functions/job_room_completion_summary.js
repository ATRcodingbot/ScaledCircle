'use strict';
const labels = require('./job_room_participant_labels');

// Display-only reads after the existing Job Room authorization; never settles work.
async function read({db, room, zone, zoneId, actor}) {
  const ids = [...new Set([room.scalerId, ...(room.scalerIds || [])].filter(x => typeof x === 'string' && x))];
  if (!actor?.uid || (!actor.isAdmin && actor.uid !== room.businessId && !ids.includes(actor.uid)) ||
      zone.campaignId !== room.campaignId || zone.businessId !== room.businessId) {
    throw Error('job_room_member_required');
  }
  const participantLabels = await labels.load(db, room, actor);
  const records = await db.collection('campaignCompletions').where('zoneId', '==', zoneId).limit(20).get();
  const ledger = await db.collection('walletTransactions').doc(`earning_${zoneId}_v1`).get();
  const earning = ledger.data() || {};
  const cents = x => Number.isSafeInteger(x) && x >= 0 ? x : null;
  const completions = records.docs.map(d => ({...d.data(), id:d.id}))
    .filter(c => c.zoneId === zoneId && c.campaignId === room.campaignId && ids.includes(c.scalerId) &&
      (actor.isAdmin || actor.uid === room.businessId || actor.uid === c.scalerId))
    .sort((a,b) => (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0))
    .map(c => ({id:c.id,zoneId,campaignId:room.campaignId,scalerId:c.scalerId,
      status:c.status || null,reviewStatus:c.reviewStatus || zone.reviewStatus || null,
      proofCount:Array.isArray(c.proofs)?c.proofs.length:0,
      gpsPointCount:Number(c.gpsPointCount || zone.submittedRoutePointCount || 0),
      submittedAt:c.submittedAt || null,reviewedAt:c.reviewedAt || zone.reviewedAt || null,
      approvedAt:c.approvedAt || null,
      earning:earning.type === 'scaler_earnings' && earning.scalerId === c.scalerId &&
        earning.zoneId === zoneId && earning.campaignId === room.campaignId ? {
          id:ledger.id,type:earning.type,status:earning.status || null,currency:earning.currency || 'usd',
          amountCents:cents(earning.amountCents),baseAmountCents:cents(earning.baseAmountCents),
          bonusAmountCents:cents(earning.bonusAmountCents),
        } : null,
    }));
  return {participantLabels,completions};
}
module.exports={read};
