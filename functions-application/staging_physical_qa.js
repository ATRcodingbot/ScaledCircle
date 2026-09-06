"use strict";

const CAMPAIGN_ID = "ios_physical_qa_v1";
const ZONE_ID = "ios_physical_qa_zone_v1";
const AUTHORITY_PATH = `internalCertificationAuthorities/${CAMPAIGN_ID}`;

function reserved(campaignId, zoneId) {
  return campaignId === CAMPAIGN_ID || zoneId === ZONE_ID;
}

function validateAuthority(projectId, authority) {
  if (projectId !== "scaledcircle-staging" ||
      authority?.projectId !== "scaledcircle-staging" ||
      authority?.certificationFixture !== true || authority?.immutable !== true ||
      authority?.campaignId !== CAMPAIGN_ID || authority?.zoneId !== ZONE_ID ||
      typeof authority.businessUid !== "string" || !authority.businessUid ||
      typeof authority.scalerUid !== "string" || !authority.scalerUid ||
      authority.businessUid === authority.scalerUid) throw new Error("qa_authority_unavailable");
  return authority;
}

function assertAccess({projectId, authority, uid, targetScalerUid, campaignId, zoneId}) {
  const binding = validateAuthority(projectId, authority);
  if ((campaignId !== undefined && campaignId !== binding.campaignId) ||
      (zoneId !== undefined && zoneId !== binding.zoneId) ||
      ![binding.businessUid, binding.scalerUid].includes(uid) ||
      (targetScalerUid !== undefined && targetScalerUid !== binding.scalerUid)) {
    throw new Error("qa_identity_denied");
  }
  return binding;
}

// No broad opportunity notifications, email jobs, or audience matching for QA.
function suppressOpportunity(campaignId, campaign) {
  return reserved(campaignId) || campaign?.certificationFixture === true;
}

module.exports = {CAMPAIGN_ID, ZONE_ID, AUTHORITY_PATH, reserved,
  validateAuthority, assertAccess, suppressOpportunity};
