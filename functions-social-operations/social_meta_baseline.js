"use strict";

// Read-only snapshots retain provider vocabulary; views are not impressions.
const VERSION = "v26.0";
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
function measure(value, source, reason = null) {
  const valid = count(value);
  return {value: valid, status: valid === null ? "UNAVAILABLE" : "OBSERVED", source,
    ...(reason ? {reason} : {})};
}
function insight(body, metric, source) {
  if (!Array.isArray(body?.data)) return measure(null, source, "malformed_response");
  const item = body.data.find(row => row.name === metric);
  if (!item) return {value: null, status: "NO_DATA", source};
  // Never sum daily unique reach into a purported unique period total.
  if (item.total_value) return measure(item.total_value.value, source);
  if (!Array.isArray(item.values) || !item.values.length) return {value: null, status: "NO_DATA", source};
  return {...measure(item.values.at(-1).value, source), period: item.period || null,
    providerEndTime: item.values.at(-1).end_time || null};
}
async function collect({surface, account, tokens, fetchImpl = globalThis.fetch, now = Date.now(), diagnostic = () => {}}) {
  const ig = surface === "instagram";
  if (!["facebook", "instagram"].includes(surface) || !/^\d+$/.test(account?.accountId || "") ||
      (ig && !/^\d+$/.test(account.linkedAccountId || ""))) throw Error("meta_baseline_identity_required");
  const id = ig ? account.linkedAccountId : account.accountId;
  const token = ig ? tokens.userAccessToken : tokens.pageAccessToken;
  if (!token) throw Error("meta_baseline_credential_required");
  async function get(path, params = {}) {
    if (!new RegExp(`^/(?:${account.accountId}|${account.linkedAccountId || account.accountId})(?:/insights|/posts|/media)?$`).test(path)) {
      throw Error("meta_baseline_path_denied");
    }
    const url = new URL(`https://graph.facebook.com/${VERSION}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, {method: "GET", redirect: "error",
      headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(20000)});
    const body = await response.json();
    if (!response.ok || body.error) {
      const code = count(body.error?.code);
      if (!ig) {
        let message = typeof body.error?.message === "string" ? body.error.message : "Provider response unavailable";
        for (const secret of Object.values(tokens).filter(value => typeof value === "string" && value.length)) {
          message = message.split(secret).join("[REDACTED]");
        }
        message = message.replace(/https?:\/\/\S+/gi, "[URL REDACTED]")
          .replace(/(?:Bearer\s+|access_token[=:]\s*)[^\s,;]+/gi, "[REDACTED]")
          .replace(/\bEA[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]").slice(0, 600);
        diagnostic({event: "facebook_baseline_graph_error", providerAccountId: id,
          path, apiVersion: VERSION, metric: params.metric || null,
          httpStatus: response.status, code, subcode: count(body.error?.error_subcode),
          type: typeof body.error?.type === "string" && /^[A-Za-z_]{1,80}$/.test(body.error.type) ? body.error.type : null,
          providerMessage: message});
      }
      // Latest Page posts are optional. Their separate read-content permission
      // must not discard successful Page insights or broaden the OAuth scope.
      if (!ig && path === `/${id}/posts` && response.status === 400 && code === 10 &&
          body.error?.type === "OAuthException" &&
          /pages_read_user_content|Page Public Content Access/.test(body.error.message || "")) {
        return {errorCode: code, unavailableReason: "optional_post_read_permission_not_granted"};
      }
      if ([190, 10, 200].includes(code) || response.status === 401 || response.status === 403 || response.status === 429) {
        throw Error(`meta_baseline_authority_or_rate_limit_${code || response.status}`);
      }
      return {errorCode: code || response.status};
    }
    return body;
  }
  const identity = await get(`/${id}`, {fields: ig ? "id,username,followers_count,media_count" : "id,name,followers_count,instagram_business_account{id}"});
  if (identity.id !== id || (ig ? identity.username !== account.linkedHandle :
    identity.instagram_business_account?.id !== account.linkedAccountId ||
      (account.pageName && identity.name !== account.pageName))) throw Error("meta_baseline_identity_mismatch");
  const result = {schemaVersion: "MetaBaselineV1", provider: surface, providerAccountId: id,
    observedAt: new Date(now).toISOString(), apiVersion: VERSION, source: "meta_graph_read_only",
    confidence: "LOW_CONFIDENCE", experiment: "INITIAL_EXPERIMENT", metrics: {
      followers: measure(identity.followers_count, `/${id}:followers_count`),
      impressions: measure(null, "provider_contract", "not_requested_as_views"),
    }};
  const since = Math.floor((now - 28 * 86400000) / 1000), until = Math.floor(now / 1000);
  result.requestedRange = {since, until, timeZone: "UTC"};
  const metrics = ig ? ["views", "reach", "total_interactions", "profile_links_taps"] :
    ["page_media_view", "page_post_engagements", "page_views_total"];
  for (const metric of metrics) {
    const source = `/${id}/insights:${metric}`;
    const body = await get(`/${id}/insights`, {metric, period: "day", since, until,
      ...(ig ? {metric_type: "total_value"} : {})});
    result.metrics[metric] = body.errorCode ? measure(null, source, `provider_error_${body.errorCode}`) : insight(body, metric, source);
  }
  const latest = await get(`/${id}/${ig ? "media" : "posts"}`, {limit: 5,
    fields: ig ? "id,timestamp,media_type,permalink,like_count,comments_count" :
      "id,created_time,permalink_url,shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)"});
  result.latest = Array.isArray(latest.data) ? latest.data.map(row => ({id: row.id,
    createdAt: row.timestamp || row.created_time || null,
    likesOrReactions: measure(ig ? row.like_count : row.reactions?.summary?.total_count, `${row.id}:likes_or_reactions`),
    comments: measure(ig ? row.comments_count : row.comments?.summary?.total_count, `${row.id}:comments`),
    shares: measure(ig ? null : row.shares?.count, `${row.id}:shares`)})) : [];
  result.latestStatus = Array.isArray(latest.data) ? (latest.data.length ? "OBSERVED" : "NO_DATA") : "UNAVAILABLE";
  if (!ig && latest.unavailableReason) result.latestUnavailableReason = latest.unavailableReason;
  result.metrics[ig ? "mediaCount" : "postCount"] = ig ? measure(identity.media_count, `/${id}:media_count`) :
    measure(null, `/${id}/posts`, "bounded_sample_is_not_lifetime_count");
  return result;
}
module.exports = {collect, insight, measure};
