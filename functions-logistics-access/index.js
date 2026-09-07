'use strict';
const {initializeApp, getApps} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const crypto = require('node:crypto');
const policy = require('./policy');
if (!getApps().length) initializeApp();
const db = getFirestore();
const options = {region: 'us-east1', maxInstances: 4};

function environment() {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (project !== 'scaled-circle' && !(project?.startsWith('demo-') && process.env.FIRESTORE_EMULATOR_HOST)) {
    throw new HttpsError('failed-precondition', 'Production privacy authority is unavailable in this environment.');
  }
}
async function actor(request, requiredRole) {
  environment();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const auth = await getAuth().getUser(request.auth.uid).catch(() => null);
  const user = await db.doc('users/' + request.auth.uid).get();
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  if (!auth || auth.disabled || !auth.emailVerified || !user.exists ||
      !roles.includes(user.data().role) || (user.data().role !== 'admin' && user.data().active !== true)) {
    throw new HttpsError('permission-denied', 'An enabled, verified account with the required role is necessary.');
  }
  return request.auth.uid;
}

async function refresh(transaction, id, source) {
  const result = policy.projection(id, source.exists ? source.data() : null);
  const target = db.doc('campaignDiscovery/' + id);
  if (result.document) transaction.set(target, {...result.document, sourceUpdateTime: source.updateTime});
  else transaction.delete(target);
  return {campaignId: id, result: result.reason};
}

exports.projectCampaignDiscoveryV1 = onDocumentWritten({
  ...options, document: 'campaigns/{campaignId}', retry: true,
}, async event => {
  environment();
  const id = event.params.campaignId;
  // Read current state, not event data: duplicate or reordered delivery must not
  // resurrect a closed campaign or stale private content.
  const outcome = await db.runTransaction(async transaction => {
    const source = await transaction.get(db.doc('campaigns/' + id));
    return refresh(transaction, id, source);
  });
  logger.info('campaign_projection', {version: policy.VERSION, ...outcome});
});

exports.seedCampaignDiscoveryV1 = onCall(options, async request => {
  const uid = await actor(request, 'admin');
  const data = request.data;
  if (!data || Object.keys(data).some(k => k !== 'campaigns') || !Array.isArray(data.campaigns) ||
      !data.campaigns.length || data.campaigns.length > 50 || data.campaigns.some(c =>
        !c || Object.keys(c).some(k => !['id', 'updateTime'].includes(k)) ||
        !policy.ID.test(c.id || '') || typeof c.updateTime !== 'string') ||
      new Set(data.campaigns.map(c => c.id)).size !== data.campaigns.length) {
    throw new HttpsError('invalid-argument', 'Provide one to fifty unique campaign IDs with exact source update times.');
  }
  const batch = [...data.campaigns].sort((a,b) => a.id.localeCompare(b.id));
  const digest = crypto.createHash('sha256').update(JSON.stringify(batch)).digest('hex');
  const audit = db.doc('privacyMigrationAudit/' + digest);
  return db.runTransaction(async transaction => {
    const previous = await transaction.get(audit);
    if (previous.exists) return {alreadyApplied: true, auditId: digest, results: previous.data().results};
    const sources = await Promise.all(batch.map(c => transaction.get(db.doc('campaigns/' + c.id))));
    for (let i=0; i<batch.length; i++) {
      const match = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(batch[i].updateTime);
      const expectedSeconds = match ? Date.parse(match[1] + 'Z') / 1000 : NaN;
      const expectedNanos = match ? Number((match[2] || '').padEnd(9, '0')) : NaN;
      if (!sources[i].exists || sources[i].updateTime.seconds !== expectedSeconds || sources[i].updateTime.nanoseconds !== expectedNanos) {
        throw new HttpsError('failed-precondition', 'Source changed; refresh and review the migration inventory.');
      }
    }
    const results = [];
    for (let i=0; i<batch.length; i++) results.push(await refresh(transaction, batch[i].id, sources[i]));
    transaction.create(audit, {actorUid: uid, action: 'seed_campaign_discovery', version: policy.VERSION,
      environment: 'production', results, createdAt: FieldValue.serverTimestamp()});
    return {alreadyApplied: false, auditId: digest, results};
  });
});

exports.listAssignedLocationIdsV1 = onCall(options, async request => {
  const uid = await actor(request, 'scaler');
  if (request.data && Object.keys(request.data).length) {
    throw new HttpsError('invalid-argument', 'Target users and filters are not accepted.');
  }
  // IDs only; client document reads independently recheck assignment Rules.
  // Read all authority in one transaction so concurrent cancellation retries.
  const ids = await db.runTransaction(async transaction => {
    const rows = await transaction.get(db.collection('campaignLocations').where('assignedScalerId', '==', uid).limit(501));
    if (rows.size > 500) throw new HttpsError('resource-exhausted', 'Contact support to load assignment history.');
    const candidates = rows.docs.filter(d => policy.ID.test(d.data().campaignId || '') && ['assigned','in_progress'].includes(d.data().status));
    const campaignIds = [...new Set(candidates.map(d => d.data().campaignId))];
    const campaigns = await Promise.all(campaignIds.map(id => transaction.get(db.doc('campaigns/' + id))));
    const byId = new Map(campaigns.map(d => [d.id, d.exists ? d.data() : null]));
    return candidates.filter(d => policy.locationAllowed(uid, d.data(), byId.get(d.data().campaignId))).map(d => d.id).sort();
  });
  logger.info('assignment_location_access', {actorUid: uid, count: ids.length, version: policy.VERSION});
  return {locationIds: ids};
});

exports.getReputationCompletionCountV1 = onCall(options, async request => {
  await actor(request, ['admin','business','scaler']);
  if (!request.data || Object.keys(request.data).some(k => k !== 'userId') ||
      !policy.ID.test(request.data.userId || '')) throw new HttpsError('invalid-argument', 'A profile identity is required.');
  const profile = await db.doc('users/' + request.data.userId).get();
  if (!profile.exists) throw new HttpsError('not-found', 'Profile unavailable.');
  // Preserve the existing objective metric, without exposing any contributing
  // campaign or private logistics. This is not a claim about paid earnings.
  const result = await db.collection('campaigns').where('completedBy','==',request.data.userId)
    .select('status').limit(5001).get();
  if (result.size > 5000) throw new HttpsError('resource-exhausted', 'Reputation history requires support review.');
  return {completedCount:result.docs.filter(d=>d.data().status==='completed').length, source:'completed_campaigns'};
});
