"use strict";

const ELIGIBLE_CAMPAIGN_STATUSES = new Set(["draft"]);
const ELIGIBLE_FUNDING_STATUSES = new Set(["", "unfunded", "payment_pending"]);
const SUCCESSFUL_PAYMENT_STATUSES = new Set([
  "funded", "paid", "captured", "succeeded",
]);
const FINANCIAL_EXCEPTION_STATUSES = new Set([
  "refund_pending", "refunded", "disputed", "chargeback",
  "chargeback_pending", "settled",
]);

function normalizedStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function nextFundingVersion(campaign) {
  const fundedVersion = campaign?.fundingVersion;
  if (fundedVersion === undefined || fundedVersion === null) return 1;
  if (!Number.isSafeInteger(fundedVersion) || fundedVersion < 0) {
    throw new Error("campaign_funding_version_invalid");
  }
  return fundedVersion + 1;
}

/**
 * Pure server-side eligibility decision for a new campaign funding Checkout.
 * The caller must supply authoritative Firestore snapshots read in the same
 * transaction that reserves the deterministic financial operation.
 */
function evaluateFundingCheckout({campaign, payment, businessId,
  expectedFundingVersion}) {
  if (!campaign) return {decision: "reject", code: "campaign_not_found"};
  if (campaign.businessId !== businessId) {
    return {decision: "reject", code: "campaign_not_owned"};
  }

  const fundingVersion = nextFundingVersion(campaign);
  if (fundingVersion !== expectedFundingVersion) {
    return {decision: "reject", code: "funding_version_changed"};
  }

  const campaignStatus = normalizedStatus(campaign.status);
  const fundingStatus = normalizedStatus(campaign.fundingStatus);
  if (!ELIGIBLE_CAMPAIGN_STATUSES.has(campaignStatus)) {
    return {decision: "reject", code: "campaign_status_ineligible"};
  }
  if (!ELIGIBLE_FUNDING_STATUSES.has(fundingStatus)) {
    return {decision: "reject", code: "campaign_funding_ineligible"};
  }
  if (fundingStatus === "payment_pending" &&
      (campaign.fundingCheckoutVersion !== fundingVersion ||
       !campaign.fundingCheckoutOperationId)) {
    return {decision: "reject", code: "campaign_payment_claim_mismatch"};
  }

  if (!payment) return {decision: "claim", fundingVersion};
  if (payment.businessId !== businessId || payment.campaignId !== campaign.id ||
      payment.fundingVersion !== fundingVersion) {
    return {decision: "reject", code: "payment_identity_mismatch"};
  }

  const paymentStatus = normalizedStatus(payment.status);
  if (SUCCESSFUL_PAYMENT_STATUSES.has(paymentStatus)) {
    return {decision: "reject", code: "funding_version_already_paid"};
  }
  if (FINANCIAL_EXCEPTION_STATUSES.has(paymentStatus)) {
    return {decision: "reject", code: "payment_financial_exception"};
  }
  if (paymentStatus === "payment_pending" && payment.stripeCheckoutSessionId &&
      payment.stripeCheckoutUrl) {
    return {
      decision: "recover",
      fundingVersion,
      result: {
        sessionId: payment.stripeCheckoutSessionId,
        url: payment.stripeCheckoutUrl,
        recovered: true,
      },
    };
  }
  if (["payment_pending", "payment_failed", ""].includes(paymentStatus)) {
    return {decision: "claim", fundingVersion};
  }
  return {decision: "reject", code: "payment_status_ineligible"};
}

module.exports = {
  evaluateFundingCheckout,
  nextFundingVersion,
  normalizedStatus,
};
