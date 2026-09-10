"use strict";

// Customer permissions are separate from the internal publishing pilot and
// from permission to execute any specific publication.
const PURPOSE = "meta_customer_managed";
function available(business, allowlist = "") {
  return !business.isAdmin && business.role === "business" &&
    ["scale", "managed_growth"].includes(business.planId) &&
    allowlist.split(",").map(s => s.trim()).filter(Boolean).includes(business.uid);
}
function publishingTarget(connection) {
  if (!connection || !["connected_read_only", "connected_write"].includes(connection.status) ||
      connection.requiresReconnect === true || !connection.credentialId ||
      !/^\d+$/.test(connection.providerUserId || "")) throw Error("social_oauth_customer_read_connection_required");
  return {pageId: connection.providerUserId, credentialId: connection.credentialId};
}
function assertTarget(attempt, connection, account) {
  if (attempt.purpose !== PURPOSE || !attempt.customerTarget ||
      account.accountId !== attempt.customerTarget.pageId ||
      connection.providerUserId !== attempt.customerTarget.pageId ||
      connection.credentialId !== attempt.customerTarget.credentialId) {
    throw Error("social_oauth_customer_page_changed");
  }
}
async function readBaseline({surface, connection, credential, account, tokens, collect, fetchImpl = fetch}) {
  const id = surface === "facebook" ? account.accountId : account.linkedAccountId;
  if (!/^\d+$/.test(id || "") || connection.providerUserId !== id ||
      connection.credentialId !== credential.id || connection.capabilities?.analytics !== true) {
    throw Error("meta_baseline_customer_identity_or_permission");
  }
  let safeTokens = {...tokens};
  if (surface === "facebook" && !safeTokens.pageAccessToken) {
    if (!tokens.userAccessToken) throw Error("meta_baseline_credential_required");
    const url = new URL(`https://graph.facebook.com/v26.0/${account.accountId}`);
    url.searchParams.set("fields", "id,access_token");
    const response = await fetchImpl(url, {method: "GET", redirect: "error",
      headers: {Authorization: `Bearer ${tokens.userAccessToken}`}, signal: AbortSignal.timeout(20000)});
    const result = await response.json();
    if (!response.ok || result.id !== account.accountId || !result.access_token) {
      throw Error(result.error?.code === 190 ? "meta_baseline_authority_or_rate_limit_190" : "meta_baseline_page_credential_unavailable");
    }
    safeTokens.pageAccessToken = result.access_token;
  }
  return collect({surface, account: {...account,
    ...(surface === "instagram" ? {linkedHandle: connection.handle} : {pageName: connection.accountDisplayName})},
    tokens: safeTokens, fetchImpl});
}
module.exports = {PURPOSE, available, publishingTarget, assertTarget, readBaseline};
