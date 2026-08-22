"use strict";

const SUPPORT_EMAIL = "support@scaledcircle.com";
const EMAIL_JOB_COLLECTION = "outboundEmailJobs";

function money(cents, currency = "usd") {
  return `${String(currency).toUpperCase()} ${(Number(cents || 0) / 100).toFixed(2)}`;
}

function safeReference(value) {
  const text = String(value || "");
  return text.length <= 12 ? text : `...${text.slice(-8)}`;
}

function financialEvent({kind, paymentId, campaign, payment, occurredAt}) {
  if (!paymentId || !["payment", "refund"].includes(kind)) {
    throw new Error("invalid_admin_financial_event");
  }
  const campaignId = String(payment.campaignId || campaign.id || "");
  const campaignName = String(campaign.campaignName || campaign.name || campaignId || "Campaign").slice(0, 160);
  const grossCents = Number(payment.totalChargeCents || 0);
  const workerCents = Number(payment.workerCompensationCents || payment.workerAmountCents || 0);
  const feeCents = Number(payment.platformFeeCents || 0);
  const refundCents = Number(payment.refundableAmountCents || grossCents);
  const currency = String(payment.currency || "usd").toLowerCase();
  const isRefund = kind === "refund";
  const stableId = `admin-revenue-${kind}_${paymentId}`;
  const title = isRefund ? "Campaign refund completed" : "Campaign payment received";
  const lines = isRefund ? [
    `Campaign: ${campaignName}`,
    `Campaign ID: ${campaignId}`,
    `Business UID: ${String(payment.businessUid || payment.businessId || "unknown")}`,
    `Original payment: ${money(grossCents, currency)}`,
    `Refund: ${money(refundCents, currency)}`,
    `ScaledCircle retained from campaign charge: ${money(Math.max(0, grossCents - refundCents), currency)}`,
    "Payment status: Refunded",
  ] : [
    `Campaign: ${campaignName}`,
    `Campaign ID: ${campaignId}`,
    `Business UID: ${String(payment.businessUid || payment.businessId || "unknown")}`,
    `Customer payment: ${money(grossCents, currency)}`,
    `Worker compensation: ${money(workerCents, currency)}`,
    `ScaledCircle platform fee: ${money(feeCents, currency)}`,
    "Payment status: Paid",
  ];
  lines.push(
    `Stripe mode: ${String(payment.stripeMode || "unknown").toUpperCase()}`,
    `Payment reference: ${safeReference(paymentId)}`,
    `Timestamp: ${occurredAt || "server-recorded"}`,
  );
  return {
    stableId,
    notification: {
      id: stableId,
      type: isRefund ? "admin_campaign_refund_completed" : "admin_campaign_payment_received",
      title,
      message: lines.join("\n"),
      campaignId,
      paymentId,
      amountCents: isRefund ? refundCents : grossCents,
      revenueCents: isRefund ? -feeCents : feeCents,
      currency,
      read: false,
    },
    email: {
      to: SUPPORT_EMAIL,
      fromAddress: SUPPORT_EMAIL,
      fromName: "Scaled Circle Support",
      replyTo: SUPPORT_EMAIL,
      subject: `${title} — ${campaignName}`.slice(0, 180),
      text: lines.join("\n"),
      template: isRefund ? "support_campaign_refund_completed" : "support_campaign_payment_received",
      eventType: isRefund ? "campaign.refund.completed" : "campaign.payment.paid",
      metadata: {campaignId, kind, grossCents, feeCents, refundCents, currency},
      status: "queued",
      attempts: 0,
    },
  };
}

async function queueAdminFinancialEvent({db, auth, FieldValue, kind, paymentId, campaign, payment}) {
  const admin = await auth.getUserByEmail(SUPPORT_EMAIL);
  const spec = financialEvent({kind, paymentId, campaign, payment});
  const notificationRef = db.collection("notifications").doc(spec.stableId);
  const emailRef = db.collection(EMAIL_JOB_COLLECTION).doc(spec.stableId);
  return db.runTransaction(async (transaction) => {
    const [notification, email] = await Promise.all([
      transaction.get(notificationRef), transaction.get(emailRef),
    ]);
    const timestamp = FieldValue.serverTimestamp();
    if (!notification.exists) transaction.create(notificationRef, {
      ...spec.notification, userId: admin.uid, createdAt: timestamp,
    });
    if (!email.exists) transaction.create(emailRef, {
      ...spec.email, createdAt: timestamp, updatedAt: timestamp,
    });
    return {notificationCreated: !notification.exists, emailCreated: !email.exists};
  });
}

module.exports = {SUPPORT_EMAIL, EMAIL_JOB_COLLECTION, financialEvent, queueAdminFinancialEvent};
