"use strict";
const Stripe = require("stripe");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const lifecycle = require("./campaign_funding_lifecycle");
const adminRevenueNotifications = require("./admin_revenue_notifications");
initializeApp();
const db = getFirestore();
const auth = getAuth();
const PAYMENT_ENVIRONMENT = lifecycle.paymentEnvironment(process.env);
const STRIPE_SECRET_KEY = defineSecret(PAYMENT_ENVIRONMENT.stripeMode === "live" ?
  "STRIPE_LIVE_SECRET_KEY" : "STRIPE_TEST_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret(PAYMENT_ENVIRONMENT.stripeMode === "live" ?
  "STRIPE_LIVE_WEBHOOK_SECRET" : "STRIPE_TEST_WEBHOOK_SECRET");
const OPTIONS = {region: "us-east1", timeoutSeconds: 60, memory: "256MiB", maxInstances: 10};
const cleanId = (value) => /^[A-Za-z0-9_-]{1,160}$/.test(String(value || "").trim()) ? String(value).trim() : "";

function checkoutReturnBaseUrl() {
  return PAYMENT_ENVIRONMENT.returnBaseUrl;
}

async function ownedCampaign(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in as a Business.");
  if (request.auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Verify your email first.");
  const user = (await db.collection("users").doc(request.auth.uid).get()).data() || {};
  if (String(user.role || "").toLowerCase() !== "business") throw new HttpsError("permission-denied", "Business access required.");
  const campaignId = cleanId(request.data?.campaignId);
  if (!campaignId) throw new HttpsError("invalid-argument", "A campaign is required.");
  const ref = db.collection("campaigns").doc(campaignId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Campaign not found.");
  const campaign = snapshot.data() || {};
  if (campaign.businessId !== request.auth.uid) throw new HttpsError("permission-denied", "You do not own this campaign.");
  return {uid: request.auth.uid, campaignId, ref, campaign};
}

async function validZones(campaignId, uid) {
  const zones = await db.collection("campaignZones").where("campaignId", "==", campaignId).get();
  return zones.docs.filter((doc) => lifecycle.mappedZoneIsValid(doc.data(), campaignId, uid));
}

async function assertFundable(input) {
  if (input.campaign.status !== "draft" || !["", "unfunded", "payment_failed", "checkout_expired", "payment_pending"]
    .includes(String(input.campaign.fundingStatus || ""))) {
    throw new HttpsError("failed-precondition", "This campaign is not fundable.");
  }
  const zones = await validZones(input.campaignId, input.uid);
  if (!zones.length) throw new HttpsError("failed-precondition", "Map at least one valid campaign Zone before funding.");
  return zones;
}

function stripeClient() {
  try { return new Stripe(lifecycle.assertStripeSecret(STRIPE_SECRET_KEY.value(), PAYMENT_ENVIRONMENT.stripeMode)); } catch (_) {
    throw new HttpsError("failed-precondition", "Stripe campaign funding is not safely configured for this environment.");
  }
}

exports.quoteCampaignFunding = onCall({...OPTIONS, timeoutSeconds: 30}, async (request) => {
  const input = await ownedCampaign(request);
  await assertFundable(input);
  try { return lifecycle.quoteForCampaign(input.campaign); } catch (_) {
    throw new HttpsError("failed-precondition", "Campaign worker compensation is invalid.");
  }
});

exports.createCampaignFundingCheckoutSession = onCall({...OPTIONS, secrets: [STRIPE_SECRET_KEY]}, async (request) => {
  const input = await ownedCampaign(request);
  await assertFundable(input);
  const quote = lifecycle.quoteForCampaign(input.campaign);
  if (request.data?.approvedQuoteDigest !== quote.quoteDigest) {
    throw new HttpsError("failed-precondition", "Campaign pricing changed. Review and approve the new quote.");
  }
  const version = Number.isSafeInteger(input.campaign.fundingVersion) ? input.campaign.fundingVersion + 1 : 1;
  const paymentId = lifecycle.paymentId(input.campaignId, version);
  const paymentRef = db.collection("campaignPayments").doc(paymentId);
  const stripe = stripeClient();
  const existing = (await paymentRef.get()).data();
  let checkoutAttempt = Math.max(1, Number(existing?.checkoutAttempt || 1));
  if (existing?.stripeCheckoutSessionId) {
    const current = await stripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId);
    const decision = lifecycle.checkoutRecoveryDecision(existing, current, Math.floor(Date.now() / 1000));
    if (existing.status === "payment_pending" && decision.action === "recover") {
      return {paymentId, ...decision, quote, paymentMode: PAYMENT_ENVIRONMENT.stripeMode};
    }
    if (existing.status === "payment_pending" && decision.action === "await_webhook") {
      return {paymentId, processing: true, quote, paymentMode: PAYMENT_ENVIRONMENT.stripeMode};
    }
    checkoutAttempt += 1;
    if (checkoutAttempt > 3) {
      await Promise.all([
        paymentRef.set({status: "checkout_retry_exhausted", settlementFrozen: true,
          updatedAt: FieldValue.serverTimestamp()}, {merge: true}),
        input.ref.set({fundingStatus: "payment_failed", status: "funding_review_required",
          fundingReviewRequired: true, updatedAt: FieldValue.serverTimestamp()}, {merge: true}),
      ]);
      throw new HttpsError("resource-exhausted", "This campaign reached its safe Checkout retry limit.");
    }
    await paymentRef.set({status: "checkout_expired", stripeCheckoutUrl: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  }
  await paymentRef.set({paymentId, campaignId: input.campaignId, businessUid: input.uid, businessId: input.uid,
    ...quote, fundingVersion: version, checkoutAttempt, status: "created", stripeMode: PAYMENT_ENVIRONMENT.stripeMode,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  const returnBaseUrl = checkoutReturnBaseUrl();
  const session = await stripe.checkout.sessions.create({mode: "payment", client_reference_id: paymentId,
    line_items: [{quantity: 1, price_data: {currency: quote.currency, unit_amount: quote.totalChargeCents,
      product_data: {name: `ScaledCircle campaign funding: ${String(input.campaign.name || input.campaignId).slice(0, 80)}`}}}],
    payment_intent_data: {metadata: {paymentId, campaignId: input.campaignId, businessUid: input.uid}},
    success_url: `${returnBaseUrl}/#/campaign-funding-return?status=processing&campaignId=${encodeURIComponent(input.campaignId)}`,
    cancel_url: `${returnBaseUrl}/#/campaign/${input.campaignId}?funding=cancelled`,
    metadata: {paymentId, campaignId: input.campaignId, businessUid: input.uid,
      purchaseType: `campaign_funding_${PAYMENT_ENVIRONMENT.stripeMode}_v1`},
    expires_at: Math.floor(Date.now() / 1000) + 1800,
  }, {idempotencyKey: lifecycle.stripeIdempotencyKey(`${paymentId}:${checkoutAttempt}`, PAYMENT_ENVIRONMENT.stripeMode)});
  lifecycle.assertStripeEvent(session, PAYMENT_ENVIRONMENT.stripeMode);
  await db.runTransaction(async (transaction) => {
    transaction.set(paymentRef, {status: "payment_pending", stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl: session.url, stripeCheckoutExpiresAt: session.expires_at, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    transaction.set(input.ref, {fundingStatus: "payment_pending", fundingPaymentId: paymentId,
      fundingCheckoutVersion: version, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  });
  return {paymentId, sessionId: session.id, url: session.url, quote,
    paymentMode: PAYMENT_ENVIRONMENT.stripeMode};
});

async function transition(paymentId, paymentUpdate, campaignUpdate) {
  const paymentRef = db.collection("campaignPayments").doc(paymentId);
  await db.runTransaction(async (transaction) => {
    const paymentSnapshot = await transaction.get(paymentRef);
    if (!paymentSnapshot.exists) throw new Error("campaign_payment_missing");
    const currentPayment = paymentSnapshot.data() || {};
    if (!lifecycle.transitionAllowed(String(currentPayment.status || ""), paymentUpdate.status)) return;
    const campaignRef = db.collection("campaigns").doc(currentPayment.campaignId || "missing");
    if (!(await transaction.get(campaignRef)).exists) throw new Error("campaign_missing");
    transaction.set(paymentRef, {...paymentUpdate, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    transaction.set(campaignRef, {...campaignUpdate, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  });
}

async function notifyAdminFinancialEvent(kind, paymentId) {
  const paymentSnapshot = await db.collection("campaignPayments").doc(paymentId).get();
  if (!paymentSnapshot.exists) throw new Error("campaign_payment_missing_for_admin_notification");
  const payment = paymentSnapshot.data() || {};
  const campaignSnapshot = await db.collection("campaigns").doc(payment.campaignId || "missing").get();
  if (!campaignSnapshot.exists) throw new Error("campaign_missing_for_admin_notification");
  await adminRevenueNotifications.queueAdminFinancialEvent({
    db, auth, FieldValue, kind, paymentId,
    payment,
    campaign: {id: campaignSnapshot.id, ...(campaignSnapshot.data() || {})},
  });
}

async function cancellationFacts(campaignId) {
  const campaignRef = db.collection("campaigns").doc(campaignId);
  const [zones, locations, applications, assignedScalers, participants, jobRooms,
    tracking, completions, handoffs, compensation, payouts] = await Promise.all([
    db.collection("campaignZones").where("campaignId", "==", campaignId).get(),
    db.collection("campaignLocations").where("campaignId", "==", campaignId).get(),
    campaignRef.collection("applications").get(),
    campaignRef.collection("assignedScalers").limit(1).get(),
    db.collection("zoneScalerParticipations").where("campaignId", "==", campaignId).limit(1).get(),
    db.collection("jobRooms").where("campaignId", "==", campaignId).limit(1).get(),
    db.collection("trackingSessions").where("campaignId", "==", campaignId).limit(1).get(),
    db.collection("campaignCompletions").where("campaignId", "==", campaignId).limit(1).get(),
    db.collection("materialHandoffs").where("campaignId", "==", campaignId).limit(1).get(),
    db.collection("assignmentCompensations").where("campaignId", "==", campaignId).limit(1).get(),
    db.collection("payouts").where("campaignId", "==", campaignId).limit(1).get(),
  ]);
  const assignedDocuments = [...zones.docs, ...locations.docs].some((snapshot) => {
    const data = snapshot.data() || {};
    return Boolean(cleanId(data.assignedScalerId)) ||
      (Array.isArray(data.assignedScalerIds) && data.assignedScalerIds.some(cleanId));
  });
  const acceptedApplication = applications.docs.some((snapshot) =>
    ["accepted", "assigned"].includes(String(snapshot.data()?.status || "")));
  const materialHandoff = [...zones.docs, ...locations.docs].some((snapshot) => {
    const data = snapshot.data() || {};
    return Boolean(data.materialHandoffAt || data.materialHandoffStatus || data.materialAcceptedAt);
  });
  const workerEarning = compensation.docs.some((snapshot) => {
    const data = snapshot.data() || {};
    return Number(data.earnedCents || data.amountEarnedCents || data.payableCents || 0) > 0 ||
      !["", "draft", "void", "canceled"].includes(String(data.status || ""));
  });
  return {zones, locations, applications,
    policy: {hasAssignedZone: assignedDocuments, hasAcceptedApplication: acceptedApplication,
      hasAssignedScalerRecord: !assignedScalers.empty || !participants.empty || !jobRooms.empty,
      hasTrackingSession: !tracking.empty,
      hasCompletionEvidence: !completions.empty, hasMaterialHandoff: materialHandoff || !handoffs.empty,
      hasWorkerEarning: workerEarning, hasSettlement: !compensation.empty,
      hasPayout: !payouts.empty}};
}

exports.cancelUnassignedFundedCampaign = onCall({...OPTIONS, secrets: [STRIPE_SECRET_KEY]}, async (request) => {
  const input = await ownedCampaign(request);
  const paymentId = cleanId(input.campaign.fundingPaymentId);
  if (!paymentId) throw new HttpsError("failed-precondition", "No funded campaign payment was found.");
  const paymentRef = db.collection("campaignPayments").doc(paymentId);
  const facts = await cancellationFacts(input.campaignId);
  const payment = (await paymentRef.get()).data() || {};
  const resumeCancellation = input.campaign.status === "canceling" &&
    input.campaign.fundingStatus === "refund_pending" && payment.status === "refund_pending";
  if (resumeCancellation && payment.stripeRefundId) {
    return {campaignId: input.campaignId, paymentId, status: "refund_pending",
      refundableAmountCents: Number(input.campaign.refundAmountCents || payment.refundableAmountCents ||
        payment.totalChargeCents || 0), currency: payment.currency, duplicate: true};
  }
  const policy = resumeCancellation ? {eligible: true, blockers: []} :
    lifecycle.cancelRefundEligibility({campaign: input.campaign, payment, ...facts.policy,
    hasDispute: payment.status === "disputed"});
  if (!policy.eligible) {
    const assigned = policy.blockers.includes("scaler_assigned") || policy.blockers.includes("work_started") ||
      policy.blockers.includes("worker_obligation");
    throw new HttpsError("failed-precondition", assigned ?
      "A Scaler has already been assigned to this campaign. Cancellation requires a different review process." :
      "This campaign is not eligible for an instant self-service refund.", {blockers: policy.blockers});
  }
  if (!resumeCancellation) await db.runTransaction(async (transaction) => {
    const [campaignSnapshot, paymentSnapshot] = await Promise.all([
      transaction.get(input.ref), transaction.get(paymentRef),
    ]);
    const currentPolicy = lifecycle.cancelRefundEligibility({campaign: campaignSnapshot.data(),
      payment: paymentSnapshot.data(), ...facts.policy, hasDispute: paymentSnapshot.data()?.status === "disputed"});
    if (!currentPolicy.eligible) throw new HttpsError("failed-precondition", "Campaign refund eligibility changed. Refresh and review it again.");
    transaction.set(input.ref, {status: "canceling", fundingStatus: "refund_pending",
      marketplaceVisible: false, acceptingApplications: false, cancellationReason: cleanId(request.data?.reason) || null,
      cancellationApplicantCount: facts.applications.size, cancellationAssignmentCount: 0,
      cancellationPolicyVersion: "unassigned_full_refund_v1",
      refundRequestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    transaction.set(paymentRef, {status: "refund_pending", settlementFrozen: true,
      cancellationReason: cleanId(request.data?.reason) || null,
      cancellationPolicyVersion: "unassigned_full_refund_v1",
      refundRequestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  });
  try {
    const stripe = stripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    lifecycle.assertStripeEvent(paymentIntent, PAYMENT_ENVIRONMENT.stripeMode);
    const chargeId = typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id;
    if (!chargeId) throw new Error("campaign_charge_missing");
    const charge = await stripe.charges.retrieve(chargeId);
    lifecycle.assertStripeEvent(charge, PAYMENT_ENVIRONMENT.stripeMode);
    const refundableCents = Number(charge.amount || 0) - Number(charge.amount_refunded || 0);
    if (refundableCents !== Number(payment.totalChargeCents || 0) || refundableCents <= 0) {
      throw new Error("campaign_full_refund_amount_mismatch");
    }
    const refund = await stripe.refunds.create({charge: charge.id,
      metadata: {paymentId, campaignId: input.campaignId, businessUid: input.uid,
        refundReason: "unassigned_campaign_cancellation"}},
    {idempotencyKey: lifecycle.stripeRefundIdempotencyKey(paymentId, PAYMENT_ENVIRONMENT.stripeMode)});
    await Promise.all([
      paymentRef.set({stripeRefundId: refund.id, refundableAmountCents: refundableCents,
        refundRequestStatus: String(refund.status || "pending"), updatedAt: FieldValue.serverTimestamp()}, {merge: true}),
      input.ref.set({refundAmountCents: refundableCents, updatedAt: FieldValue.serverTimestamp()}, {merge: true}),
    ]);
    const batch = db.batch();
    for (const application of facts.applications.docs) {
      batch.set(application.ref,
        {status: "canceled", campaignCanceledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      const scalerId = cleanId(application.data()?.scalerId || application.id);
      if (scalerId) batch.set(db.collection("notifications")
        .doc(`campaign_canceled_${input.campaignId}_${scalerId}`), {
        id: `campaign_canceled_${input.campaignId}_${scalerId}`, userId: scalerId,
        type: "campaign_canceled", title: "Campaign canceled",
        message: "Campaign canceled by the Business.", campaignId: input.campaignId,
        read: false, createdAt: FieldValue.serverTimestamp(),
      }, {merge: false});
    }
    await batch.commit();
    return {campaignId: input.campaignId, paymentId, status: "refund_pending", refundableAmountCents: refundableCents,
      currency: payment.currency, applicantCount: facts.applications.size};
  } catch (error) {
    await Promise.all([
      paymentRef.set({status: "refund_review_required", settlementFrozen: true,
        refundFailureCode: String(error?.code || error?.message || "refund_request_failed").slice(0, 120),
        updatedAt: FieldValue.serverTimestamp()}, {merge: true}),
      input.ref.set({status: "funding_review_required", fundingStatus: "refund_review_required",
        marketplaceVisible: false, acceptingApplications: false, fundingReviewRequired: true,
        updatedAt: FieldValue.serverTimestamp()}, {merge: true}),
    ]);
    logger.error("Unassigned campaign refund requires review.", {campaignId: input.campaignId, paymentId,
      code: error?.code || "refund_request_failed"});
    throw new HttpsError("internal", "The campaign is safely blocked, but the refund requires review.");
  }
});

exports.archiveCanceledCampaign = onCall(OPTIONS, async (request) => {
  const input = await ownedCampaign(request);
  if (input.campaign.status !== "canceled" || input.campaign.fundingStatus !== "refunded") {
    throw new HttpsError("failed-precondition", "Only a canceled, refunded campaign can be removed from My Campaigns.");
  }
  await input.ref.set({archived: true, hiddenFromBusinessHistory: true, archivedBy: input.uid,
    archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {campaignId: input.campaignId, archived: true};
});

async function processEvent(stripe, event) {
  lifecycle.assertStripeEvent(event, PAYMENT_ENVIRONMENT.stripeMode);
  const object = event.data?.object || {};
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    const session = await stripe.checkout.sessions.retrieve(object.id);
    lifecycle.assertStripeEvent(session, PAYMENT_ENVIRONMENT.stripeMode);
    if (session.payment_status !== "paid") throw new Error("campaign_payment_not_paid");
    const paymentId = cleanId(session.client_reference_id);
    const payment = (await db.collection("campaignPayments").doc(paymentId).get()).data() || {};
    if (session.amount_total !== payment.totalChargeCents || session.currency !== payment.currency ||
        session.metadata?.campaignId !== payment.campaignId || session.metadata?.businessUid !== payment.businessUid) {
      throw new Error("campaign_payment_reconciliation_failed");
    }
    await transition(paymentId, {status: "paid", stripePaymentIntentId: session.payment_intent,
      paidAt: FieldValue.serverTimestamp()}, {fundingStatus: "funded", fundingPaymentId: paymentId,
      fundingVersion: payment.fundingVersion, fundedAt: FieldValue.serverTimestamp()});
    await notifyAdminFinancialEvent("payment", paymentId);
    return;
  }
  let paymentId = cleanId(object.metadata?.paymentId || object.client_reference_id);
  if (!paymentId && typeof object.payment_intent === "string") {
    const matches = await db.collection("campaignPayments")
      .where("stripePaymentIntentId", "==", object.payment_intent).limit(1).get();
    paymentId = matches.empty ? "" : matches.docs[0].id;
  }
  if (!paymentId) return;
  const payment = (await db.collection("campaignPayments").doc(paymentId).get()).data();
  if (!payment) return;
  const campaign = (await db.collection("campaigns").doc(payment.campaignId).get()).data() || {};
  const state = lifecycle.campaignStateForPaymentEvent(event.type, campaign.status);
  if (!state) return;
  if (event.type === "refund.updated" && object.status !== "succeeded") return;
  const eventRefundAmount = Number(object.amount || object.amount_refunded || 0);
  if (event.type === "refund.updated" && eventRefundAmount > 0 && eventRefundAmount < Number(payment.totalChargeCents || 0)) {
    return transition(paymentId, {status: "refund_pending", settlementFrozen: true},
      {fundingStatus: "refund_pending", status: "funding_review_required", fundingReviewRequired: true,
        marketplaceVisible: false, acceptingApplications: false});
  }
  if (event.type === "charge.refunded" && Number(object.amount_refunded || 0) < Number(object.amount || 0)) {
    return transition(paymentId, {status: "refund_pending", settlementFrozen: true},
      {fundingStatus: "refund_pending", status: "funding_review_required", fundingReviewRequired: true});
  }
  await transition(paymentId, {status: state.paymentStatus, settlementFrozen: state.settlementFrozen === true,
    ...(state.paymentStatus === "refunded" ? {refundedAt: FieldValue.serverTimestamp()} : {})},
  {fundingStatus: state.fundingStatus, marketplaceVisible: false, acceptingApplications: false,
    ...(state.campaignStatus ? {status: state.campaignStatus,
      fundingReviewRequired: state.campaignStatus !== "canceled"} : {}),
    ...(state.campaignStatus === "canceled" ? {canceledAt: FieldValue.serverTimestamp()} : {})});
  if (state.paymentStatus === "refunded") await notifyAdminFinancialEvent("refund", paymentId);
}

exports.stripeWebhook = onRequest({...OPTIONS, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]}, async (request, response) => {
  if (request.method !== "POST") return response.status(405).send("Method Not Allowed");
  let event;
  try {
    const stripe = stripeClient();
    const webhookSecret = lifecycle.assertWebhookSecret(STRIPE_WEBHOOK_SECRET.value());
    event = stripe.webhooks.constructEvent(request.rawBody, request.headers["stripe-signature"], webhookSecret);
    lifecycle.assertStripeEvent(event, PAYMENT_ENVIRONMENT.stripeMode);
    const eventRef = db.collection("stripeCampaignEvents").doc(event.id);
    let claimed = false;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(eventRef);
      if (snapshot.data()?.status === "processed") return;
      const updatedAt = snapshot.data()?.updatedAt;
      if (snapshot.data()?.status === "processing" && updatedAt instanceof Timestamp && Date.now() - updatedAt.toMillis() < 300000) return;
      transaction.set(eventRef, {eventId: event.id, type: event.type, livemode: event.livemode,
        stripeMode: PAYMENT_ENVIRONMENT.stripeMode, status: "processing",
        attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
        createdAt: snapshot.exists ? snapshot.data().createdAt : FieldValue.serverTimestamp()}, {merge: true});
      claimed = true;
    });
    if (!claimed) return response.status(200).json({received: true, duplicate: true});
    await processEvent(stripe, event);
    await eventRef.set({status: "processed", processedAt: FieldValue.serverTimestamp()}, {merge: true});
    return response.status(200).json({received: true});
  } catch (error) {
    logger.error("Campaign Stripe webhook rejected.", {eventId: event?.id || null, eventType: event?.type || null,
      code: error?.code || "webhook_rejected"});
    return response.status(event ? 500 : 400).send("Webhook rejected.");
  }
});

exports.publishFundedCampaign = onCall(OPTIONS, async (request) => {
  const input = await ownedCampaign(request);
  if (input.campaign.status === "open") return {campaignId: input.campaignId, status: "open"};
  const zones = await validZones(input.campaignId, input.uid);
  const paymentId = cleanId(input.campaign.fundingPaymentId);
  const payment = paymentId ? (await db.collection("campaignPayments").doc(paymentId).get()).data() : null;
  if (!zones.length || input.campaign.fundingStatus !== "funded" || payment?.status !== "paid" ||
      payment.stripeMode !== PAYMENT_ENVIRONMENT.stripeMode || payment.campaignId !== input.campaignId ||
      payment.businessUid !== input.uid) {
    throw new HttpsError("failed-precondition", "Signed Stripe payment and a valid mapped Zone are required.");
  }
  await input.ref.set({status: "open", publishedAt: FieldValue.serverTimestamp(), zonesLockedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  const batch = db.batch();
  for (const zone of zones) batch.set(zone.ref, {mapLocked: true, mapLockedAt: FieldValue.serverTimestamp()}, {merge: true});
  await batch.commit();
  return {campaignId: input.campaignId, status: "open", zonesLocked: zones.length};
});
