'use strict';

// Operator-only Firebase Admin utility. No browser writes or deployed HTTP endpoint.
// The caller supplies a private, reviewed inventory; a name match alone never authorizes deletion.
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const VERSION = 'ProductionHygieneV1';
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const related = (row, id) => row.path.split('/').includes(id) || JSON.stringify(row.data).includes(id);
const financialKey = /stripe|subscription|wallet|payout|earning|payment|balance|compensation|contract/i;
const meaningful = value => value !== null && value !== undefined && value !== false && value !== '' && value !== 0;
const financialValue = data => Object.entries(data || {}).some(([key, value]) =>
  (financialKey.test(key) && meaningful(value)) ||
  (value && typeof value === 'object' && financialValue(value)));
const retainedAudit = row => row.path.startsWith('adminAuditEvents/') &&
  row.data.schemaVersion === VERSION && row.data.eventType?.startsWith('production_hygiene_');

function assertPendingApplication(row, uid) {
  assert.equal(row.path.split('/').length, 2, 'Nested application is held');
  assert.ok(['pending', 'rejected'].includes(row.data.status), 'Accepted application is held');
  if (uid) assert.equal(row.data.scalerId, uid, 'Application ownership mismatch');
  assert.ok(!row.data.acceptedAt && !row.data.assignedAt && !row.data.assignmentId,
    'Application with assignment history is held');
  assert.ok(!financialValue(row.data), 'Application with financial history is held');
}

function planSnapshot(snapshot, review) {
  assert.equal(snapshot.projectId, 'scaled-circle', 'Production project must be explicit');
  assert.equal(review.projectId, snapshot.projectId);
  assert.equal(review.version, VERSION);
  assert.ok(review.reason?.trim() && review.operatorEmail?.includes('@'));
  assert.ok(review.protectedEmails?.length >= 4 && review.protectedUids?.length >= 4,
    'Reviewed protected inventory is required');
  assert.ok(review.accounts.length <= 25 && review.campaigns.length <= 20);
  assert.equal(new Set(review.accounts.map(x => x.uid)).size, review.accounts.length);
  assert.equal(new Set(review.campaigns.map(x => x.id)).size, review.campaigns.length);
  assert.equal(snapshot.provider.mode, 'live');
  assert.equal(snapshot.provider.accountId, review.stripeAccountId);
  assert.equal(snapshot.provider.complete, true, 'Incomplete provider inventory is held');
  const rows = snapshot.rows.filter(row => !retainedAudit(row));
  const deletes = new Map();
  const retains = new Map();
  const holds = [];
  const protectedEmails = new Set(review.protectedEmails.map(x => x.toLowerCase()));
  const protectedUids = new Set(review.protectedUids);
  const hasProviderReference = (...values) => snapshot.provider.records.some(record =>
    values.filter(Boolean).some(value => JSON.stringify(record).toLowerCase().includes(value.toLowerCase())));
  const acceptedAccounts = [];
  const acceptedCampaigns = [];
  for (const candidate of review.accounts) {
    try {
      assert.equal(candidate.reviewedSynthetic, true, 'Synthetic evidence must be reviewed');
      assert.ok(candidate.evidence?.trim(), 'Synthetic evidence is required');
      assert.ok(!protectedUids.has(candidate.uid) && !protectedEmails.has(candidate.email.toLowerCase()),
        'Explicitly protected account');
      const user = snapshot.users.find(x => x.uid === candidate.uid);
      assert.ok(user, 'Auth identity not found');
      assert.equal(user.email.toLowerCase(), candidate.email.toLowerCase());
      assert.ok(/test/i.test([user.email, user.displayName].join(' ')), 'No test identity match');
      assert.ok(!Object.keys(user.customClaims || {}).length, 'Claim-bearing account is held');
      assert.ok(!hasProviderReference(user.uid, user.email), 'LIVE provider history is held');
      const refs = rows.filter(row => related(row, user.uid));
      for (const row of refs) {
        if (row.path === 'users/' + user.uid) {
          assert.ok(['scaler', 'business'].includes(row.data.role), 'Unknown/admin profile is held');
          assert.equal(row.data.email.toLowerCase(), user.email.toLowerCase());
          assert.ok(row.data.admin !== true && row.data.isAdmin !== true, 'Privileged profile is held');
          for (const key of ['businessId', 'workspaceId', 'ownerUid', 'ownerId'])
            assert.ok(!row.data[key] || row.data[key] === user.uid, 'Cross-workspace profile is held');
          assert.ok(!financialValue(row.data), 'Profile economic binding is held');
        } else if (row.path.startsWith('applications/')) {
          assertPendingApplication(row, user.uid);
        } else {
          throw Error('Retained or shared relationship is held: ' + row.path);
        }
      }
      refs.forEach(row => deletes.set(row.path, row));
      acceptedAccounts.push({uid:user.uid, email:user.email, creationTime:user.creationTime,
        lastSignInTime:user.lastSignInTime, customClaims:user.customClaims || {}});
    } catch (error) { holds.push({kind:'account', id:candidate.uid, reason:error.message}); }
  }
  for (const candidate of review.campaigns) {
    try {
      assert.equal(candidate.reviewedSynthetic, true);
      assert.ok(candidate.evidence?.trim());
      const row = rows.find(x => x.path === 'campaigns/' + candidate.id);
      assert.ok(row, 'Campaign is missing');
      const data = row.data;
      assert.equal(data.businessId, candidate.businessId, 'Campaign tenant changed');
      assert.ok(['draft', 'open'].includes(data.status), 'Non-draft/open campaign is held');
      assert.ok([undefined, null, 'unfunded'].includes(data.fundingStatus), 'Funded/history campaign is held');
      assert.ok(!financialValue(data), 'Campaign economic binding is held');
      for (const field of ['fundedAt','fundingPaymentId','acceptedCompensationContract',
        'reservedWorkerBudget','totalPaidOut','assignedScalerCount']) {
        assert.ok(!meaningful(data[field]), 'Campaign financial/assignment evidence is held: ' + field);
      }
      assert.ok(!data.archived && !data.isQaFixture && data.platformFeeStatus !== 'charged');
      assert.ok(!hasProviderReference(candidate.id), 'Campaign provider history is held');
      const refs = rows.filter(x => related(x, candidate.id));
      const historical = [];
      for (const ref of refs) {
        const [collection, id, nested] = ref.path.split('/');
        assert.ok(!nested, 'Nested campaign history is held');
        if (collection === 'campaigns') assert.equal(id, candidate.id, 'Shared campaign reference');
        else if (collection === 'campaignDiscovery') assert.equal(id, candidate.id);
        else if (collection === 'campaignZones') {
          assert.equal(ref.data.campaignId, candidate.id);
          assert.equal(ref.data.status, 'unassigned');
          assert.ok(!financialValue(ref.data), 'Zone economic history is held');
          for (const key of ['assignedScalerId','activeTrackingSessionId','lastTrackingSessionId',
            'acceptedAt','assignedAt','submittedAt','completedAt','startedAt','compensationContract',
            'acceptedCompensationContract']) assert.ok(!meaningful(ref.data[key]), 'Zone history is held: ' + key);
        } else if (collection === 'applications') {
          assert.equal(ref.data.campaignId, candidate.id);
          assertPendingApplication(ref);
        } else if (collection === 'notifications') {
          assert.equal(ref.data.campaignId, candidate.id);
          assert.equal(ref.data.userId, data.businessId);
          assert.equal(ref.data.type, 'application_received');
          assert.ok(!financialValue(ref.data), 'Financial notification is held');
        } else if (collection === 'privacyMigrationAudit') {
          // Shared immutable migration evidence remains byte-identical. The new cleanup
          // audit identifies deleted subjects without editing the original receipt.
          historical.push(ref);
        } else {
          throw Error('Campaign relationship requires review: ' + ref.path);
        }
      }
      historical.forEach(x => retains.set(x.path, x));
      refs.filter(x => !historical.includes(x)).forEach(x => deletes.set(x.path, x));
      acceptedCampaigns.push({id:candidate.id, businessId:data.businessId});
    } catch (error) { holds.push({kind:'campaign', id:candidate.id, reason:error.message}); }
  }
  assert.ok(deletes.size <= 100, 'Deletion bound exceeded');
  const plan = {version:VERSION, projectId:snapshot.projectId, reason:review.reason,
    operatorEmail:review.operatorEmail, reviewDigest:digest(review),
    accounts:acceptedAccounts, campaigns:acceptedCampaigns,
    retains:[...retains.values()].map(row => ({path:row.path, hash:digest(row.data), version:row.version}))
      .sort((a,b) => a.path.localeCompare(b.path)),
    deletes:[...deletes.values()].map(row => ({path:row.path, hash:digest(row.data), version:row.version}))
      .sort((a,b) => a.path.localeCompare(b.path)), holds};
  return {...plan, seal:digest(plan)};
}

async function inventory(db, auth) {
  const rows = [], collections = [], queue = await db.listCollections();
  await Promise.all(Array.from({length:4}, async () => { while (queue.length) {
    const collection = queue.shift(); collections.push(collection.path);
    assert.ok(collections.length <= 500, 'Inventory collection bound exceeded');
    const documents = await collection.listDocuments();
    await Promise.all(Array.from({length:4}, async () => { while (documents.length) {
      const ref = documents.shift();
      const snap = await ref.get();
      if (snap.exists) rows.push({path:ref.path, data:snap.data(),
        version:`${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}`});
      assert.ok(rows.length <= 5000, 'Inventory document bound exceeded');
      queue.push(...await ref.listCollections());
    }}));
  }}));
  const users = []; let page;
  do {
    const batch = await auth.listUsers(1000, page);
    users.push(...batch.users.map(u => ({uid:u.uid, email:u.email, displayName:u.displayName,
      customClaims:u.customClaims || {}, creationTime:u.metadata.creationTime,
      lastSignInTime:u.metadata.lastSignInTime})));
    assert.ok(users.length <= 1000, 'Auth inventory bound exceeded'); page = batch.pageToken;
  } while (page);
  return {rows, users, collections};
}

function createService({db, auth, FieldValue, projectId, readProvider, review, actor}) {
  assert.equal(projectId, 'scaled-circle');
  assert.equal(actor.kind, 'google_iam_admin');
  assert.equal(actor.email, review.operatorEmail, 'Authenticated operator differs from review');
  const timestamp = () => FieldValue.serverTimestamp();
  async function preview() {
    const state = await inventory(db, auth);
    const provider = await readProvider();
    return {plan:planSnapshot({...state, projectId, provider}, review), collections:state.collections,
      preservation:state.rows.map(row => ({path:row.path, version:row.version, hash:digest(row.data)})),
      identities:state.users};
  }
  async function execute(expectedSeal) {
    assert.match(expectedSeal, /^[a-f0-9]{64}$/);
    const auditPrefix = 'hygiene_' + expectedSeal;
    const committed = db.doc('adminAuditEvents/' + auditPrefix + '_records_removed');
    const finished = db.doc('adminAuditEvents/' + auditPrefix + '_complete');
    const priorDone = await finished.get();
    if (priorDone.exists) return {alreadyComplete:true, ...priorDone.data().result};
    const prior = await committed.get();
    let plan;
    if (prior.exists) {
      // Resume only the exact recorded Auth tail; never re-delete records after a partial failure.
      assert.equal(prior.data().operatorEmail, actor.email);
      assert.equal(prior.data().reviewDigest, digest(review));
      plan = prior.data().plan;
      assert.equal(plan.seal, expectedSeal);
    } else {
      const previewResult = await preview(); plan = previewResult.plan;
      assert.equal(plan.holds.length, 0, 'A held item cannot be executed');
      assert.equal(plan.seal, expectedSeal, 'Inventory changed; review a fresh preview');
      const started = db.doc('adminAuditEvents/' + auditPrefix + '_started');
      const startedBefore = await started.get();
      if (!startedBefore.exists) await started.create({schemaVersion:VERSION,
        eventType:'production_hygiene_started', operatorEmail:actor.email,
        reviewDigest:digest(review), plan, occurredAt:timestamp()});
      // Quiesce only the reviewed synthetic identities. A failure leaves a recoverable hold.
      for (const user of plan.accounts) {
        await auth.updateUser(user.uid, {disabled:true});
        await auth.revokeRefreshTokens(user.uid);
      }
      const fresh = await preview();
      assert.equal(fresh.plan.seal, expectedSeal, 'State changed while disabling synthetic accounts');
      await db.runTransaction(async tx => {
        // Query every inventoried collection: added/changed relationships in those collections
        // invalidate the transaction. No financial, consent or shared record is a write target.
        const currentRows = [];
        for (const collection of fresh.collections) {
          const docs = await tx.get(db.collection(collection));
          for (const doc of docs.docs) currentRows.push({path:doc.ref.path, data:doc.data(),
            version:`${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}`});
        }
        const current = planSnapshot({projectId, rows:currentRows,
          users:plan.accounts, provider:await readProvider()}, review);
        assert.equal(current.seal, expectedSeal, 'Concurrent record change; cleanup held');
        for (const row of plan.deletes) tx.delete(db.doc(row.path));
        tx.create(committed, {schemaVersion:VERSION, eventType:'production_hygiene_records_removed',
          operatorEmail:actor.email, reviewDigest:digest(review), plan, occurredAt:timestamp()});
      });
    }
    for (const user of plan.accounts) {
      try {
        const current = await auth.getUser(user.uid);
        assert.equal(current.email, user.email);
        assert.equal(current.metadata.creationTime, user.creationTime);
        assert.equal(current.disabled, true, 'Account must remain disabled during cleanup');
        await auth.deleteUser(user.uid);
      } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    }
    const after = await inventory(db, auth);
    for (const record of plan.retains) {
      const actual = after.rows.find(row => row.path === record.path);
      assert.ok(actual && digest(actual.data) === record.hash && actual.version === record.version,
        'Retained audit record changed');
    }
    for (const user of plan.accounts) {
      assert.ok(!after.users.some(x => x.uid === user.uid), 'Deleted Auth identity remains');
      assert.ok(!after.rows.some(row => !retainedAudit(row) && related(row, user.uid)), 'Account orphan remains');
    }
    for (const campaign of plan.campaigns) assert.ok(!after.rows.some(row =>
      !retainedAudit(row) && !plan.retains.some(x => x.path === row.path) &&
      related(row, campaign.id)), 'Campaign orphan remains');
    const result = {seal:expectedSeal, accountsDeleted:plan.accounts.length,
      campaignsDeleted:plan.campaigns.length, documentsDeleted:plan.deletes.length, orphans:0};
    await finished.create({schemaVersion:VERSION, eventType:'production_hygiene_complete',
      operatorEmail:actor.email, result, occurredAt:timestamp()});
    return result;
  }
  return {preview, execute};
}

function draftArchivePlan(snapshot, review) {
  assert.equal(snapshot.projectId, 'scaled-circle');
  assert.equal(review.projectId, snapshot.projectId);
  assert.equal(snapshot.provider.mode, 'live');
  assert.equal(snapshot.provider.complete, true);
  assert.equal(snapshot.provider.accountId, review.stripeAccountId);
  assert.ok(review.reason && review.archives.length > 0 && review.archives.length <= 10);
  assert.equal(new Set(review.archives.map(x=>x.id)).size,review.archives.length);
  const records=[];
  for(const target of review.archives) {
    assert.equal(target.reviewedSynthetic,true);assert.ok(target.evidence);
    const source=snapshot.rows.find(x=>x.path==='campaigns/'+target.id);assert.ok(source);
    assert.equal(source.data.businessId,target.businessId);
    assert.equal(source.data.status,'draft','Only unstarted synthetic drafts can be archived here');
    assert.ok([undefined,null,'unfunded'].includes(source.data.fundingStatus));
    for(const k of ['fundedAt','reservedWorkerBudget','totalPaidOut','assignedScalerCount'])
      assert.ok(!meaningful(source.data[k]),'Draft has funded/accepted history: '+k);
    const refs=snapshot.rows.filter(x=>!retainedAudit(x)&&related(x,target.id));
    for(const r of refs) {
      const collection=r.path.split('/')[0];
      assert.ok(['campaigns','campaignDiscovery','campaignZones','applications','privacyMigrationAudit',
        'marketingMaterials','marketingMaterialVersions','marketingMaterialApprovals','printReadyArtifacts',
        'responseAssets','campaignPayments'].includes(collection),'Unclassified relationship is held: '+r.path);
      if(collection==='campaigns')assert.equal(r.path,'campaigns/'+target.id,'Shared campaign is held');
      assert.ok(!/^(campaignCompletions|trackingSessions|campaignRoutes|wallets|walletTransactions|payouts)\//.test(r.path),
        'Work or financial ledger reference is held');
      if(r.path.startsWith('campaignZones/')) {
        assert.equal(r.data.status,'unassigned');
        for(const k of ['assignedScalerId','assignedAt','acceptedAt','activeTrackingSessionId',
          'lastTrackingSessionId','startedAt','submittedAt','completedAt'])assert.ok(!meaningful(r.data[k]));
      }
      if(r.path.startsWith('applications/')||r.path.includes('/applications/'))assertPendingApplication(r);
    }
    const provider=snapshot.provider.records.filter(x=>JSON.stringify(x).includes(target.id));
    for(const record of provider) {
      assert.equal(record.type,'checkout/sessions','Provider economic history is held');
      assert.equal(record.status,'expired');assert.equal(record.payment_status,'unpaid');
    }
    const payments=refs.filter(x=>x.path.startsWith('campaignPayments/'));
    for(const payment of payments) {
      assert.ok(!payment.data.paidAt&&!payment.data.refundedAt&&
        !['paid','succeeded','confirmed','refunded','settled'].includes(payment.data.status),
      'Recorded payment economics are held');
      assert.ok(provider.some(x=>x.metadata?.paymentId===payment.path.split('/')[1]),
        'Payment requires exact expired provider proof');
    }
    if(source.data.fundingPaymentId)assert.ok(payments.some(x=>x.path===
      'campaignPayments/'+source.data.fundingPaymentId),'Missing payment binding is held');
    records.push({id:target.id,businessId:target.businessId,
      refs:refs.map(x=>({path:x.path,hash:digest(x.data),version:x.version})).sort((a,b)=>a.path.localeCompare(b.path)),
      provider});
  }
  const plan={version:VERSION,operation:'archive_unstarted_synthetic_drafts',projectId:snapshot.projectId,
    operatorEmail:review.operatorEmail,reason:review.reason,records};
  return {...plan,seal:digest(plan)};
}

function createDraftArchiveService({db,auth,FieldValue,projectId,readProvider,review,actor}) {
  assert.equal(projectId,'scaled-circle');assert.equal(actor.kind,'google_iam_admin');
  assert.equal(actor.email,review.operatorEmail);
  async function preview(){const state=await inventory(db,auth);return draftArchivePlan({
    ...state,projectId,provider:await readProvider()},review);}
  async function execute(seal) {
    assert.match(seal,/^[a-f0-9]{64}$/);
    const audit=db.doc('adminAuditEvents/hygiene_archive_'+seal);
    if((await audit.get()).exists)return {alreadyComplete:true,seal};
    const plan=await preview();assert.equal(plan.seal,seal,'Archive inventory changed');
    await db.runTransaction(async tx=>{
      for(const record of plan.records)for(const before of record.refs) {
        const current=await tx.get(db.doc(before.path));
        assert.ok(current.exists&&digest(current.data())===before.hash&&
          `${current.updateTime.seconds}:${current.updateTime.nanoseconds}`===before.version,
        'Archive source or history changed');
      }
      for(const record of plan.records)tx.update(db.doc('campaigns/'+record.id),{
        status:'archived',archived:true,archivedBy:actor.email,archivedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),marketplaceVisible:false,acceptingApplications:false});
      tx.create(audit,{schemaVersion:VERSION,eventType:'production_hygiene_drafts_archived',
        operatorEmail:actor.email,plan,occurredAt:FieldValue.serverTimestamp()});
    });
    return {seal,campaignsArchived:plan.records.length,financialRecordsChanged:0};
  }
  return {preview,execute};
}

module.exports = {VERSION, digest, planSnapshot, inventory, createService,draftArchivePlan,createDraftArchiveService};
