'use strict';

// A temporary single legitimate physical task. Finance uses the maintained
// campaign Checkout/webhook, immutable compensation and reserve settlement.
const policy = require('./live_work_certification_policy');
const {
  id,
  fail
} = require('./scaler_cashout_shared');
const legal = require('./legal_consent');
const {
  CONFIG,
  statusFor,
  requireActiveBusiness
} = require('./market_rollout');
const {
  stateById
} = require('./market_states');
const TITLE = 'Yard Cleanup Check';
const TASK = 'Complete a real 5–10 minute yard cleanup at the authorized location. Submit a before photo, an after photo and a short note describing the work.';
function createService({
  db,
  auth,
  FieldValue,
  bucket,
  stripe,
  config,
  quoteForCampaign,
  now = Date.now,
  fetchImpl = fetch
}) {
  function permit() {
    if (config.project !== 'scaled-circle' || config.appEnv !== 'production' || config.paidWorkEnabled !== 'false') fail('cashout_certification_unavailable');
    return policy.config(config.permit, now(), {
      allowExpired: true
    });
  }
  const at = () => FieldValue.serverTimestamp();
  function refs(c) {
    return {
      task: db.doc('liveWorkCertifications/' + c.permitId),
      campaign: db.doc('campaigns/' + c.campaignId),
      zone: db.doc('campaignZones/' + c.zoneId),
      contract: db.doc('assignmentCompensations/' + c.zoneId),
      application: db.doc('campaignApplications/' + id(c.permitId, c.scalerUid)),
      completion: db.doc('campaignCompletions/' + id(c.permitId, 'completion'))
    };
  }
  async function actor(uid) {
    const c = permit();
    if (![c.businessUid, c.scalerUid].includes(uid)) fail('cashout_certification_not_authorized');
    const [a, p] = await Promise.all([auth.getUser(uid), db.doc('users/' + uid).get()]);
    const role = uid === c.businessUid ? 'business' : 'scaler';
    const user = p.data();
    if (a.disabled || !a.emailVerified || user?.role !== role || !(user.active === true || user.betaAccess === 'approved') || ['closing', 'deleted'].includes(user.accountStatus)) fail('cashout_certification_not_authorized');
    await legal.createLegalConsentService({
      db,
      FieldValue
    }).requireCurrent({
      uid,
      agreementTypes: role === 'scaler' ? ['terms', 'privacy', 'scaler_work'] : ['terms', 'privacy']
    });
    return {
      c,
      role,
      r: refs(c)
    };
  }
  function assertTask(c, t) {
    if (!t || t.version !== policy.VERSION || t.permitDigest !== policy.binding(c) || t.locationDigest !== id(t.location) || t.businessId !== c.businessUid || t.scalerId !== c.scalerUid || t.campaignId !== c.campaignId || t.zoneId !== c.zoneId) fail('cashout_certification_binding_mismatch');
  }
  async function location(value, c) {
    if (!value || Object.keys(value).some(k => !['address', 'latitude', 'longitude'].includes(k)) || typeof value.address !== 'string' || value.address.trim().length < 12 || value.address.length > 300 || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || Math.abs(value.latitude) > 85 || Math.abs(value.longitude) > 180) fail('cashout_certification_location_required');
    await requireActiveBusiness(db, c.businessUid);
    const url = new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query');
    for (const [k, v] of Object.entries({
      where: '1=1',
      geometry: JSON.stringify({
        x: value.longitude,
        y: value.latitude,
        spatialReference: {
          wkid: 4326
        }
      }),
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'STATE',
      returnGeometry: 'false',
      f: 'json'
    })) url.searchParams.set(k, v);
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) fail('cashout_certification_location_unverified');
    const data = await response.json();
    if (data.error || data.features?.length !== 1 || data.exceededTransferLimit) fail('cashout_certification_location_unverified');
    const state = stateById('us_census_tigerweb:state:' + data.features[0].attributes?.STATE);
    if (!state || statusFor((await db.doc(CONFIG).get()).data(), state.id) !== 'ACTIVE') fail('cashout_certification_market_unavailable');
    return {
      ...value,
      address: value.address.trim(),
      stateId: state.id,
      verifiedBy: 'us_census_tigerweb',
      confirmedBy: c.businessUid
    };
  }
  function payment(c, t, campaign, p) {
    assertTask(c, t);
    if (campaign?.businessId !== c.businessUid || campaign.taskLocationDigest !== t.locationDigest || campaign.fundingStatus !== 'funded' || p?.campaignId !== c.campaignId || p.businessId !== c.businessUid || p.status !== 'paid' || !p.paidAt || p.stripeMode !== 'live' || p.workerAmountCents !== 300 || p.platformFeeCents !== 60 || p.businessChargeCents !== 360 || p.currency !== 'usd' || p.settlementFrozen === true || p.refundedTotalCents > 0 || !/^pi_/.test(p.stripePaymentIntentId || '')) fail('cashout_certification_payment_unverified');
  }
  async function funding(c, r) {
    const [t, cam] = await Promise.all([r.task.get(), r.campaign.get()]);
    const p = (await db.doc('campaignPayments/' + (cam.data()?.fundingPaymentId || 'missing')).get()).data();
    payment(c, t.data(), cam.data(), p);
    const pi = await stripe.paymentIntents.retrieve(p.stripePaymentIntentId);
    if (pi.livemode !== true || pi.status !== 'succeeded' || pi.amount_received !== 360 || pi.currency !== 'usd' || pi.metadata?.campaignId !== c.campaignId || pi.metadata?.businessUid !== c.businessUid || pi.metadata?.paymentId !== cam.data().fundingPaymentId) fail('cashout_certification_provider_unverified');
    const ch = await stripe.charges.retrieve(typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id);
    if (ch.livemode !== true || ch.paid !== true || ch.disputed || ch.amount !== 360 || ch.amount_refunded !== 0 || ch.payment_intent !== pi.id) fail('cashout_certification_provider_unverified');
    return {
      paymentId: cam.data().fundingPaymentId,
      p
    };
  }
  async function get(uid) {
    const {
      c,
      role,
      r
    } = await actor(uid);
    const [t, cam, z, s] = (await Promise.all([r.task, r.campaign, r.zone, r.completion].map(x => x.get()))).map(x => x.data());
    if (t) assertTask(c, t);
    const status = t?.status || 'not_created';
    return {
      mode: 'live',
      role,
      title: TITLE,
      task: TASK,
      duration: '5–10 minutes',
      campaignId: c.campaignId,
      zoneId: c.zoneId,
      completionId: r.completion.id,
      status,
      location: t?.location || null,
      quote: t?.quote || null,
      baseCents: 300,
      bonusCents: 0,
      paidWorkHold: true,
      fundingStatus: cam?.fundingStatus || 'unfunded',
      assignmentState: z?.assignmentStatus || 'none',
      activeTrackingSessionId: z?.activeTrackingSessionId || null,
      notes: s?.notes || '',
      photos: await photos(s),
      actions: role === 'business' ? status === 'not_created' ? ['create'] : status === 'created' && cam?.fundingStatus === 'funded' ? ['publish'] : status === 'created' ? ['fund'] : status === 'applied' ? ['assign'] : status === 'submitted' ? ['approve'] : [] : status === 'offered' ? ['apply'] : status === 'assigned' ? ['accept'] : status === 'accepted' ? ['submit'] : []
    };
  }
  async function photos(s) {
    if (!s?.physicalEvidence) return [];
    return Promise.all(s.physicalEvidence.map(async p => ({
      purpose: p.purpose,
      url: (await bucket.file(p.archivePath, {
        generation: p.generation
      }).getSignedUrl({
        action: 'read',
        expires: now() + 300000
      }))[0]
    })));
  }
  async function evidence(c, r, input) {
    if (typeof input.notes !== 'string' || input.notes.trim().length < 12 || input.notes.length > 2000 || !Array.isArray(input.photos) || input.photos.length !== 2) fail('cashout_certification_evidence_required');
    const result = [];
    for (const purpose of ['before', 'after']) {
      const p = input.photos.find(x => x.purpose === purpose);
      const prefix = `completionProofs/${c.campaignId}/${c.scalerUid}/${r.completion.id}/${purpose}/`;
      if (!p || Object.keys(p).some(k => !['path', 'purpose'].includes(k)) || !p.path?.startsWith(prefix) || !/^[A-Za-z0-9_.-]{1,100}$/.test(p.path.slice(prefix.length))) fail('cashout_certification_evidence_invalid');
      const file = bucket.file(p.path),
        [metadata] = await file.getMetadata();
      if (!/^image\/(jpeg|png|webp)$/.test(metadata.contentType || '') || Number(metadata.size) <= 0 || Number(metadata.size) > 10 * 1024 * 1024) fail('cashout_certification_evidence_invalid');
      const [bytes] = await bucket.file(p.path, {
        generation: metadata.generation
      }).download();
      const image = await require('sharp')(bytes, {
        limitInputPixels: 40000000
      }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(image.format) || image.width < 100 || image.height < 100) fail('cashout_certification_evidence_invalid');
      const archivePath = `live_work_evidence/${c.permitId}/${purpose}_${metadata.generation}`;
      await bucket.file(p.path, {
        generation: metadata.generation
      }).copy(bucket.file(archivePath));
      const [saved] = await bucket.file(archivePath).getMetadata();
      if (saved.md5Hash !== metadata.md5Hash) fail('cashout_certification_evidence_invalid');
      result.push({
        purpose,
        archivePath,
        generation: saved.generation,
        md5Hash: saved.md5Hash,
        sourcePath: p.path,
        sourceGeneration: metadata.generation
      });
    }
    if (result[0].md5Hash === result[1].md5Hash) fail('cashout_certification_evidence_distinct_required');
    return result;
  }
  async function run(uid, input) {
    const {
      c,
      role,
      r
    } = await actor(uid);
    const action = input?.action;
    if (!['create', 'publish', 'apply', 'assign', 'accept', 'submit', 'approve'].includes(action) || Object.keys(input).some(k => !['action', 'location', 'notes', 'photos', 'confirmation'].includes(k))) fail('cashout_certification_request_invalid');
    if (['create', 'publish', 'assign', 'approve'].includes(action) ? role !== 'business' : role !== 'scaler') fail('cashout_certification_not_authorized');
    if (input.confirmation !== true) fail('cashout_certification_confirmation_required');
    if (action === 'create') policy.config(config.permit, now());
    const selected = action === 'create' ? await location(input.location, c) : null;
    if (action !== 'create') await funding(c, r);
    const prepared = action === 'submit' ? await evidence(c, r, input) : null;
    await db.runTransaction(async tx => {
      const [t, cam, z, application, contract, submission] = (await Promise.all([r.task, r.campaign, r.zone, r.application, r.contract, r.completion].map(x => tx.get(x)))).map(x => x.data());
      if (action === 'create') {
        if (t) {
          assertTask(c, t);
          if (id(t.location) !== id(selected)) fail('cashout_certification_location_immutable');
          return;
        }
        if (cam || z || contract || submission || application) fail('cashout_certification_already_exists');
        const quote = quoteForCampaign({
          basePay: 3,
          bonus: 0
        });
        if (quote.workerAmountCents !== 300 || quote.platformFeeCents !== 60 || quote.totalChargeCents !== 360) fail('cashout_certification_quote_changed');
        const locationDigest = id(selected);
        tx.create(r.task, {
          version: policy.VERSION,
          permitDigest: policy.binding(c),
          businessId: c.businessUid,
          scalerId: c.scalerUid,
          campaignId: c.campaignId,
          zoneId: c.zoneId,
          status: 'created',
          location: selected,
          locationDigest,
          quote,
          createdAt: at()
        });
        tx.create(r.campaign, {
          businessId: c.businessUid,
          name: TITLE,
          description: TASK,
          campaignType: 'yardCleanup',
          status: 'draft',
          basePay: 3,
          bonus: 0,
          workerAmountCents: 300,
          fundingVersion: 0,
          fundingStatus: 'unfunded',
          intendedScalerId: c.scalerUid,
          liveWorkCertificationId: c.permitId,
          liveWorkCertificationDigest: policy.binding(c),
          taskLocationDigest: locationDigest,
          location: selected,
          certificationFixture: true,
          marketplaceVisible: false,
          acceptingApplications: false,
          trackingEnabled: false,
          createdAt: at()
        });
        tx.create(r.zone, {
          campaignId: c.campaignId,
          businessId: c.businessUid,
          name: TITLE,
          campaignType: 'yardCleanup',
          status: 'unassigned',
          mapped: true,
          location: selected,
          serviceArea: [],
          trackingEnabled: false,
          certificationFixture: true,
          createdAt: at()
        });
        return;
      }
      assertTask(c, t);
      const p = (await tx.get(db.doc('campaignPayments/' + cam?.fundingPaymentId))).data();
      payment(c, t, cam, p);
      const transitions = {
        publish: ['created', 'offered'],
        apply: ['offered', 'applied'],
        assign: ['applied', 'assigned'],
        accept: ['assigned', 'accepted'],
        submit: ['accepted', 'submitted'],
        approve: ['submitted', 'completed']
      };
      const [from, to] = transitions[action];
      if (t.status === to) return;
      if (t.status !== from) fail('cashout_certification_state_changed');
      if (action === 'publish') tx.update(r.campaign, {
        status: 'private_offered',
        publishedAt: at()
      });
      if (action === 'apply') {
        if (application) fail('cashout_certification_application_conflict');
        tx.create(r.application, {
          campaignId: c.campaignId,
          zoneId: c.zoneId,
          businessId: c.businessUid,
          scalerId: c.scalerUid,
          status: 'pending',
          createdAt: at()
        });
      }
      if (action === 'assign') {
        if (application?.scalerId !== c.scalerUid || application.status !== 'pending') fail('cashout_certification_application_required');
        tx.update(r.application, {
          status: 'accepted',
          reviewedBy: uid,
          reviewedAt: at()
        });
        tx.update(r.zone, {
          assignedScalerId: c.scalerUid,
          assignmentStatus: 'awaiting_acceptance',
          status: 'assigned',
          assignedBy: uid,
          assignedAt: at()
        });
      }
      if (action === 'accept') {
        if (z.assignedScalerId !== uid || contract) fail('cashout_certification_assignment_required');
        const accepted = {
          policyVersion: policy.VERSION,
          permitDigest: policy.binding(c),
          zoneId: c.zoneId,
          campaignId: c.campaignId,
          businessId: c.businessUid,
          scalerId: c.scalerUid,
          baseAmountCents: 300,
          bonusAmountCents: 0,
          currency: 'usd'
        };
        tx.create(r.contract, {
          ...accepted,
          contractDigest: id(accepted),
          immutable: true,
          acceptedAtMs: now()
        });
        tx.update(r.zone, {
          assignmentStatus: 'accepted',
          acceptedAt: at()
        });
      }
      if (action === 'submit') {
        policy.contract(c, c.zoneId, z, contract);
        if (submission || !prepared) fail('cashout_certification_submission_conflict');
        tx.create(r.completion, {
          campaignId: c.campaignId,
          zoneId: c.zoneId,
          businessId: c.businessUid,
          scalerId: uid,
          status: 'submitted',
          reviewStatus: 'pending',
          notes: input.notes.trim(),
          physicalEvidence: prepared,
          submittedAt: at(),
          gpsRequired: false
        });
        tx.update(r.zone, {
          status: 'submitted',
          reviewStatus: 'pending',
          submittedCompletionId: r.completion.id,
          submittedAt: at()
        });
      }
      if (action === 'approve') {
        policy.contract(c, c.zoneId, z, contract);
        if (submission?.status !== 'submitted' || submission.scalerId !== c.scalerUid || submission.physicalEvidence?.length !== 2 || !submission.notes || z.submittedCompletionId !== r.completion.id) fail('cashout_certification_evidence_required');
        const service = require('./campaign_reserve_settlement').createService({
          db,
          FieldValue,
          project: config.project,
          stripe: () => stripe,
          productionAuthority: {
            assert: value => {
              permit();
              policy.contract(c, value.zoneId, value.zone, value.contract);
              if (value.project !== 'scaled-circle' || value.actorUid !== c.businessUid || value.source !== 'completed_task_review' || value.completionId !== r.completion.id || value.payout.transferAmountCents !== 300 || value.payout.baseAmountCents !== 300 || value.payout.bonusAmountCents !== 0) fail('cashout_certification_settlement_invalid');
              payment(c, t, cam, value.payment);
            }
          }
        });
        await service.commit(tx, {
          zoneId: c.zoneId,
          zone: z,
          contract,
          paymentId: cam.fundingPaymentId,
          payment: p,
          payout: {
            baseAmountCents: 300,
            bonusAmountCents: 0,
            transferAmountCents: 300
          },
          actorUid: uid,
          completionId: r.completion.id,
          source: 'completed_task_review',
          evidence: {
            type: 'physical_before_after',
            completionId: r.completion.id
          }
        });
      }
      tx.update(r.task, {
        status: to,
        updatedAt: at()
      });
      tx.create(r.task.collection('audit').doc(action), {
        action,
        actorUid: uid,
        from,
        to,
        at: at()
      });
    });
    return get(uid);
  }
  return {
    get,
    run
  };
}
module.exports = {
  createService,
  TITLE,
  TASK
};
