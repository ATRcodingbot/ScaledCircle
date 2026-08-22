"use strict";

const {applicationDefault, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");
const {queueAdminFinancialEvent} = require("../admin_revenue_notifications");

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
}

async function main() {
  const projectId = argument("project");
  const paymentId = argument("payment");
  const paidEventId = argument("paid-event");
  const refundEventId = argument("refund-event");
  const apply = process.argv.includes("--apply");
  if (!projectId || !paymentId || !paidEventId || !refundEventId) {
    throw new Error("project, payment, paid-event, and refund-event are required");
  }
  initializeApp({credential: applicationDefault(), projectId});
  const db = getFirestore();
  const [paymentSnapshot, paidEventSnapshot, refundEventSnapshot] = await Promise.all([
    db.collection("campaignPayments").doc(paymentId).get(),
    db.collection("stripeCampaignEvents").doc(paidEventId).get(),
    db.collection("stripeCampaignEvents").doc(refundEventId).get(),
  ]);
  if (!paymentSnapshot.exists || !paidEventSnapshot.exists || !refundEventSnapshot.exists) {
    throw new Error("authoritative payment or event record is missing");
  }
  const payment = paymentSnapshot.data() || {};
  const paidEvent = paidEventSnapshot.data() || {};
  const refundEvent = refundEventSnapshot.data() || {};
  if (payment.status !== "refunded" || payment.stripeMode !== "live" ||
      Number(payment.totalChargeCents) !== 960 ||
      paidEvent.status !== "processed" || paidEvent.type !== "checkout.session.completed" || paidEvent.livemode !== true ||
      refundEvent.status !== "processed" || refundEvent.type !== "charge.refunded" || refundEvent.livemode !== true) {
    throw new Error("authoritative LIVE payment/refund invariants did not match");
  }
  const campaignSnapshot = await db.collection("campaigns").doc(payment.campaignId).get();
  const campaign = {id: campaignSnapshot.id, ...(campaignSnapshot.data() || {})};
  if (!apply) {
    console.log(JSON.stringify({verified: true, applied: false, paymentId, campaignId: payment.campaignId}));
    return;
  }
  const common = {db, auth: getAuth(), FieldValue, paymentId, campaign, payment};
  const paymentResult = await queueAdminFinancialEvent({...common, kind: "payment"});
  const refundResult = await queueAdminFinancialEvent({...common, kind: "refund"});
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const paymentJobId = `admin-revenue-payment_${paymentId}`;
  const refundJobId = `admin-revenue-refund_${paymentId}`;
  const [paymentJob, refundJob, paymentNotice, refundNotice] = await Promise.all([
    db.collection("outboundEmailJobs").doc(paymentJobId).get(),
    db.collection("outboundEmailJobs").doc(refundJobId).get(),
    db.collection("notifications").doc(paymentJobId).get(),
    db.collection("notifications").doc(refundJobId).get(),
  ]);
  console.log(JSON.stringify({verified: true, applied: true,
    payment: {...paymentResult, emailStatus: paymentJob.data()?.status,
      notificationExists: paymentNotice.exists},
    refund: {...refundResult, emailStatus: refundJob.data()?.status,
      notificationExists: refundNotice.exists}}));
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
