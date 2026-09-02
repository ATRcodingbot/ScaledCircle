"use strict";

const crypto = require("node:crypto");

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const PROVIDERS = Object.freeze(["meta", "x", "youtube"]);
const PROVIDER_SCOPES = Object.freeze({
  meta: Object.freeze([
    "pages_show_list",
    "pages_read_engagement",
    "read_insights",
    "instagram_basic",
    "instagram_manage_insights",
  ]),
  x: Object.freeze(["users.read", "tweet.read", "offline.access"]),
  youtube: Object.freeze([
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ]),
});

function text(value, maximum = 2400) {
  return value == null ? "" : String(value).trim().slice(0, maximum);
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function digest(value) {
  const canonical = typeof value === "string" ? value : JSON.stringify(value);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function randomOpaque(bytes = 32, randomBytes = crypto.randomBytes) {
  return base64url(randomBytes(bytes));
}

function normalizeProvider(value) {
  const provider = text(value, 30).toLowerCase();
  if (!PROVIDERS.includes(provider)) throw new Error("unsupported_social_oauth_provider");
  return provider;
}

function normalizeScopes(provider, scopes) {
  const required = PROVIDER_SCOPES[normalizeProvider(provider)];
  const granted = new Set((Array.isArray(scopes) ? scopes : String(scopes || "").split(/[ ,]+/))
    .map((scope) => text(scope, 180)).filter(Boolean));
  return {
    granted: [...granted].sort(),
    required: [...required],
    missing: required.filter((scope) => !granted.has(scope)),
  };
}

function keyBytes(value) {
  const clean = text(value, 1000);
  let decoded;
  if (/^[A-Fa-f0-9]{64}$/.test(clean)) decoded = Buffer.from(clean, "hex");
  else decoded = Buffer.from(clean, "base64");
  if (decoded.length !== 32) throw new Error("social_oauth_encryption_key_invalid");
  return decoded;
}

function encryptJson(value, encryptionKey, aad = "social-oauth-v1", randomBytes = crypto.randomBytes) {
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(encryptionKey), iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    version: 1,
    algorithm: "A256GCM",
    iv: base64url(iv),
    ciphertext: base64url(ciphertext),
    tag: base64url(cipher.getAuthTag()),
  };
}

function decryptJson(envelope, encryptionKey, aad = "social-oauth-v1") {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== "A256GCM") {
    throw new Error("social_oauth_envelope_invalid");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes(encryptionKey),
    Buffer.from(envelope.iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

function validateProviderConfig(input = {}) {
  const provider = normalizeProvider(input.provider);
  const clientId = text(input.clientId, 500);
  const redirectUri = text(input.redirectUri, 1200);
  const environment = text(input.environment, 40).toLowerCase();
  if (!clientId || !/^https:\/\//.test(redirectUri)) throw new Error("social_oauth_config_missing");
  if (!["staging", "production"].includes(environment)) throw new Error("social_oauth_environment_invalid");
  return {
    provider,
    clientId,
    redirectUri,
    environment,
    enabled: input.enabled === true,
    historicalSyncEnabled: input.historicalSyncEnabled === true,
    appName: text(input.appName, 180) || null,
  };
}

function authorizationUrl({provider, config, state, codeChallenge}) {
  const normalized = normalizeProvider(provider);
  const valid = validateProviderConfig({...config, provider: normalized});
  if (!valid.enabled) throw new Error("social_oauth_provider_disabled");
  const scopes = PROVIDER_SCOPES[normalized];
  let url;
  if (normalized === "meta") {
    url = new URL("https://www.facebook.com/v23.0/dialog/oauth");
    url.searchParams.set("client_id", valid.clientId);
    url.searchParams.set("redirect_uri", valid.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("state", state);
  } else if (normalized === "x") {
    url = new URL("https://x.com/i/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", valid.clientId);
    url.searchParams.set("redirect_uri", valid.redirectUri);
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  } else {
    url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", valid.clientId);
    url.searchParams.set("redirect_uri", valid.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

function createAttempt({businessUid, provider, config, encryptionKey, now = Date.now(), randomBytes}) {
  const normalized = normalizeProvider(provider);
  const valid = validateProviderConfig({...config, provider: normalized});
  if (!valid.enabled) throw new Error("social_oauth_provider_disabled");
  const uid = text(businessUid, 180);
  if (!uid) throw new Error("social_oauth_business_required");
  const state = randomOpaque(32, randomBytes);
  const verifier = randomOpaque(48, randomBytes);
  const codeChallenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const attemptId = digest(state);
  const aad = `${uid}:${normalized}:${attemptId}`;
  const continueUrl = authorizationUrl({provider: normalized, config: valid, state, codeChallenge});
  return {
    attemptId,
    state,
    authorizationUrl: continueUrl,
    record: {
      schemaVersion: "SocialOAuthAttemptV1",
      businessUid: uid,
      provider: normalized,
      environment: valid.environment,
      status: "authorizing",
      stateDigest: attemptId,
      verifierEnvelope: encryptJson({verifier}, encryptionKey, aad, randomBytes),
      authorizationEnvelope: encryptJson({authorizationUrl: continueUrl}, encryptionKey,
        `${aad}:authorization`, randomBytes),
      safeCandidates: [],
      candidateEnvelope: null,
      grantedScopes: [],
      missingScopes: [...PROVIDER_SCOPES[normalized]],
      createdAtMillis: now,
      expiresAtMillis: now + OAUTH_ATTEMPT_TTL_MS,
      completedAtMillis: null,
    },
  };
}

function isReusableAttempt(record, {businessUid, provider, now = Date.now()} = {}) {
  if (!record || record.businessUid !== text(businessUid, 180) ||
      record.provider !== normalizeProvider(provider)) return false;
  if (!["authorizing", "exchanging", "identity_pending"].includes(record.status)) return false;
  return Number.isFinite(record.expiresAtMillis) && record.expiresAtMillis > now;
}

function continuationUrl(record, {businessUid, provider, attemptId, encryptionKey,
  now = Date.now()} = {}) {
  if (!isReusableAttempt(record, {businessUid, provider, now}) || record.status !== "authorizing" ||
      !record.authorizationEnvelope) return null;
  const aad = `${text(businessUid, 180)}:${normalizeProvider(provider)}:${text(attemptId, 128)}`;
  const value = decryptJson(record.authorizationEnvelope, encryptionKey, `${aad}:authorization`);
  const url = text(value?.authorizationUrl, 4000);
  return /^https:\/\//.test(url) ? url : null;
}

function safeIdentityCandidate(candidate = {}) {
  return {
    candidateId: text(candidate.candidateId || candidate.accountId, 240),
    provider: text(candidate.provider, 30),
    accountDisplayName: text(candidate.accountDisplayName, 180),
    accountType: text(candidate.accountType, 80),
    handle: text(candidate.handle, 180) || null,
    linkedAccountDisplayName: text(candidate.linkedAccountDisplayName, 180) || null,
    linkedHandle: text(candidate.linkedHandle, 180) || null,
    capabilities: {
      profile: candidate.capabilities?.profile === true,
      analytics: candidate.capabilities?.analytics === true,
      publishText: false,
      publishImage: false,
      publishVideo: false,
      schedule: false,
    },
  };
}

function assertAttempt(record, {provider, now = Date.now()} = {}) {
  if (!record || !["authorizing", "exchanging"].includes(record.status)) {
    throw new Error("social_oauth_attempt_not_active");
  }
  if (provider && record.provider !== normalizeProvider(provider)) throw new Error("social_oauth_provider_mismatch");
  if (!Number.isFinite(record.expiresAtMillis) || record.expiresAtMillis <= now) {
    throw new Error("social_oauth_attempt_expired");
  }
  return record;
}

function safeProviderMessage(value) {
  return text(value, 240)
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/bearer\s+[^\s]+/gi, "Bearer [redacted]");
}

async function fetchJson(fetchImpl, url, options = {}, safeContext = {}) {
  const response = await fetchImpl(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("social_provider_request_failed");
    error.providerStatus = response.status;
    error.providerCode = text(body?.error?.code || body?.error || body?.title, 100);
    error.providerSubcode = text(body?.error?.error_subcode, 100) || null;
    error.providerMessage = safeProviderMessage(body?.error?.message || body?.error_description || "");
    Object.assign(error, safeContext);
    throw error;
  }
  return body;
}

function form(values) {
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value != null && value !== "") body.set(key, String(value));
  });
  return body;
}

async function exchangeMeta({code, config, clientSecret, fetchImpl}) {
  const graphVersion = "v23.0";
  const graphBase = `https://graph.facebook.com/${graphVersion}`;
  const tokenUrl = new URL(`${graphBase}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", config.clientId);
  tokenUrl.searchParams.set("client_secret", clientSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", code);
  const short = await fetchJson(fetchImpl, tokenUrl, {}, {
    providerStage: "meta_code_exchange", providerEndpoint: "/oauth/access_token",
    providerGraphVersion: graphVersion, providerObjectType: "oauth_code",
    providerTokenClass: "authorization_code",
  });
  const longUrl = new URL(`${graphBase}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", config.clientId);
  longUrl.searchParams.set("client_secret", clientSecret);
  longUrl.searchParams.set("fb_exchange_token", short.access_token);
  const token = await fetchJson(fetchImpl, longUrl, {}, {
    providerStage: "meta_long_lived_exchange", providerEndpoint: "/oauth/access_token",
    providerGraphVersion: graphVersion, providerObjectType: "oauth_token",
    providerTokenClass: "short_lived_user",
  });
  const permissionsUrl = new URL(`${graphBase}/me/permissions`);
  permissionsUrl.searchParams.set("access_token", token.access_token);
  const permissions = await fetchJson(fetchImpl, permissionsUrl, {}, {
    providerStage: "meta_permissions", providerEndpoint: "/me/permissions",
    providerGraphVersion: graphVersion, providerObjectType: "user_permissions",
    providerTokenClass: "long_lived_user",
  });
  const grantedScopes = (permissions.data || [])
    .filter((permission) => permission.status === "granted")
    .map((permission) => text(permission.permission, 180)).filter(Boolean);
  const accountFields = "id,name,access_token,tasks";
  const pageIdentityFields = "id,name,instagram_business_account{id,username,name}";
  const accountUrl = new URL(`${graphBase}/me/accounts`);
  accountUrl.searchParams.set("fields", accountFields);
  accountUrl.searchParams.set("limit", "100");
  accountUrl.searchParams.set("access_token", token.access_token);
  const accounts = await fetchJson(fetchImpl, accountUrl, {}, {
    providerStage: "meta_page_enumeration", providerEndpoint: "/me/accounts",
    providerGraphVersion: graphVersion, providerObjectType: "user_accounts_edge",
    providerFields: accountFields, providerTokenClass: "long_lived_user", grantedScopes,
  });
  let pages = await Promise.all((accounts.data || []).map(async (page) => {
    const pageId = text(page.id, 180);
    const pageToken = text(page.access_token, 10000) || text(token.access_token, 10000);
    const pageUrl = new URL(`${graphBase}/${encodeURIComponent(pageId)}`);
    pageUrl.searchParams.set("fields", pageIdentityFields);
    pageUrl.searchParams.set("access_token", pageToken);
    const identity = await fetchJson(fetchImpl, pageUrl, {}, {
      providerStage: "meta_page_identity", providerEndpoint: "/{page-id}",
      providerGraphVersion: graphVersion, providerObjectType: "page",
      providerFields: pageIdentityFields,
      providerTokenClass: page.access_token ? "page" : "long_lived_user",
      selectedPageId: pageId, grantedScopes,
    });
    return {...page, ...identity, access_token: text(page.access_token, 10000)};
  }));
  if (!pages.length) {
    const debugUrl = new URL(`${graphBase}/debug_token`);
    debugUrl.searchParams.set("input_token", token.access_token);
    debugUrl.searchParams.set("access_token", `${config.clientId}|${clientSecret}`);
    const debug = await fetchJson(fetchImpl, debugUrl, {}, {
      providerStage: "meta_token_introspection", providerEndpoint: "/debug_token",
      providerGraphVersion: graphVersion, providerObjectType: "user_token",
      providerTokenClass: "app_access_token", grantedScopes,
    });
    const granularScopes = debug.data?.granular_scopes || [];
    const pageScope = granularScopes.find((scope) =>
      text(scope.scope, 180) === "pages_show_list") ||
      granularScopes.find((scope) => text(scope.scope, 180) === "pages_read_engagement");
    const selectedPageIds = [...new Set((Array.isArray(pageScope?.target_ids) ?
      pageScope.target_ids : []).map((id) => text(id, 180)).filter(Boolean))];
    pages = await Promise.all(selectedPageIds.map(async (pageId) => {
      const pageUrl = new URL(`${graphBase}/${encodeURIComponent(pageId)}`);
      pageUrl.searchParams.set("fields", pageIdentityFields);
      pageUrl.searchParams.set("access_token", token.access_token);
      return fetchJson(fetchImpl, pageUrl, {}, {
        providerStage: "meta_page_identity", providerEndpoint: "/{page-id}",
        providerGraphVersion: graphVersion, providerObjectType: "page",
        providerFields: pageIdentityFields, providerTokenClass: "long_lived_user",
        selectedPageId: pageId, grantedScopes,
      });
    }));
  }
  const candidates = pages.map((page) => ({
    candidateId: `meta_page_${text(page.id, 180)}`,
    provider: "meta",
    accountId: text(page.id, 180),
    accountDisplayName: text(page.name, 180),
    accountType: "facebook_page",
    handle: null,
    linkedAccountId: text(page.instagram_business_account?.id, 180) || null,
    linkedAccountDisplayName: text(page.instagram_business_account?.name, 180) || null,
    linkedHandle: text(page.instagram_business_account?.username, 180) || null,
    pageAccessToken: text(page.access_token, 10000),
    userAccessToken: text(token.access_token, 10000),
    expiresIn: Number(token.expires_in || 0) || null,
    capabilities: {profile: true, analytics: true},
  })).filter((candidate) => candidate.accountId && candidate.accountDisplayName);
  return {candidates, scopes: grantedScopes};
}

async function exchangeX({code, verifier, config, clientSecret, fetchImpl}) {
  const headers = {"Content-Type": "application/x-www-form-urlencoded"};
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${clientSecret}`).toString("base64")}`;
  }
  const token = await fetchJson(fetchImpl, "https://api.x.com/2/oauth2/token", {
    method: "POST", headers,
    body: form({code, grant_type: "authorization_code", client_id: config.clientId,
      redirect_uri: config.redirectUri, code_verifier: verifier}),
  });
  const identity = await fetchJson(fetchImpl,
    "https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url,public_metrics",
    {headers: {Authorization: `Bearer ${token.access_token}`}});
  const user = identity.data || {};
  return {candidates: [{candidateId: `x_user_${text(user.id, 180)}`, provider: "x",
    accountId: text(user.id, 180), accountDisplayName: text(user.name, 180),
    accountType: "x_user", handle: text(user.username, 180),
    accessToken: text(token.access_token, 10000), refreshToken: text(token.refresh_token, 10000),
    expiresIn: Number(token.expires_in || 0) || null,
    capabilities: {profile: true, analytics: true}}],
  scopes: String(token.scope || "").split(" ").filter(Boolean)};
}

async function exchangeYouTube({code, verifier, config, clientSecret, fetchImpl}) {
  const token = await fetchJson(fetchImpl, "https://oauth2.googleapis.com/token", {
    method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: form({code, client_id: config.clientId, client_secret: clientSecret,
      redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: verifier}),
  });
  const channels = await fetchJson(fetchImpl,
    "https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true&maxResults=50",
    {headers: {Authorization: `Bearer ${token.access_token}`}});
  const candidates = (channels.items || []).map((channel) => ({
    candidateId: `youtube_channel_${text(channel.id, 180)}`,
    provider: "youtube",
    accountId: text(channel.id, 180),
    accountDisplayName: text(channel.snippet?.title, 180),
    accountType: "youtube_channel",
    handle: text(channel.snippet?.customUrl, 180) || null,
    accessToken: text(token.access_token, 10000),
    refreshToken: text(token.refresh_token, 10000),
    expiresIn: Number(token.expires_in || 0) || null,
    capabilities: {profile: true, analytics: true},
  })).filter((candidate) => candidate.accountId && candidate.accountDisplayName);
  return {candidates, scopes: String(token.scope || "").split(" ").filter(Boolean)};
}

async function completeExchange({attempt, code, config, clientSecret, encryptionKey,
  fetchImpl = globalThis.fetch, now = Date.now()}) {
  assertAttempt(attempt, {provider: config.provider, now});
  const aad = `${attempt.businessUid}:${attempt.provider}:${attempt.stateDigest}`;
  const verifier = decryptJson(attempt.verifierEnvelope, encryptionKey, aad).verifier;
  let result;
  if (attempt.provider === "meta") result = await exchangeMeta({code, config, clientSecret, fetchImpl});
  else if (attempt.provider === "x") {
    result = await exchangeX({code, verifier, config, clientSecret, fetchImpl});
  } else result = await exchangeYouTube({code, verifier, config, clientSecret, fetchImpl});
  if (!result.candidates.length) throw new Error("social_oauth_no_owned_identity");
  const scopeStatus = normalizeScopes(attempt.provider, result.scopes);
  return {
    status: scopeStatus.missing.length ? "error" : "identity_pending",
    safeCandidates: result.candidates.map(safeIdentityCandidate),
    candidateEnvelope: encryptJson({candidates: result.candidates}, encryptionKey, aad),
    grantedScopes: scopeStatus.granted,
    missingScopes: scopeStatus.missing,
    completedAtMillis: now,
  };
}

function selectCandidate({attempt, candidateId, encryptionKey, now = Date.now()}) {
  if (!attempt || attempt.status !== "identity_pending") throw new Error("social_oauth_identity_not_ready");
  if (!Number.isFinite(attempt.expiresAtMillis) || attempt.expiresAtMillis <= now) {
    throw new Error("social_oauth_attempt_expired");
  }
  const aad = `${attempt.businessUid}:${attempt.provider}:${attempt.stateDigest}`;
  const candidates = decryptJson(attempt.candidateEnvelope, encryptionKey, aad).candidates || [];
  const candidate = candidates.find((item) => item.candidateId === text(candidateId, 240));
  if (!candidate) throw new Error("social_oauth_identity_not_found");
  const credentialAad = `${attempt.businessUid}:${attempt.provider}:${candidate.accountId}`;
  const secretFields = {};
  for (const key of ["accessToken", "refreshToken", "userAccessToken", "pageAccessToken"] ) {
    if (candidate[key]) secretFields[key] = candidate[key];
  }
  return {
    safeCandidate: safeIdentityCandidate(candidate),
    credentialRecord: {
      schemaVersion: "SocialConnectionCredentialV1",
      businessUid: attempt.businessUid,
      provider: attempt.provider,
      providerAccountIdHash: digest(candidate.accountId),
      tokenEnvelope: encryptJson(secretFields, encryptionKey, credentialAad),
      grantedScopes: [...attempt.grantedScopes],
      expiresAtMillis: candidate.expiresIn ? now + candidate.expiresIn * 1000 : null,
      createdAtMillis: now,
      updatedAtMillis: now,
    },
    privateAccount: {
      accountId: candidate.accountId,
      linkedAccountId: candidate.linkedAccountId || null,
    },
  };
}

function callbackHtml({success, message}) {
  const safe = text(message, 240).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" ` +
    `content="width=device-width"><title>ScaledCircle Social Connection</title></head>` +
    `<body style="font:16px system-ui;padding:32px;max-width:640px;margin:auto">` +
    `<h1>${success ? "Connection ready to confirm" : "Connection needs attention"}</h1>` +
    `<p>${safe}</p><p>You may close this window and return to ScaledCircle.</p></body></html>`;
}

async function refreshTokens({provider, tokens, config, clientSecret, fetchImpl = globalThis.fetch}) {
  const normalized = normalizeProvider(provider);
  if (normalized === "meta") return {...tokens, refreshed: false};
  if (!tokens?.refreshToken) throw new Error("social_oauth_refresh_token_missing");
  let refreshed;
  if (normalized === "x") {
    const headers = {"Content-Type": "application/x-www-form-urlencoded"};
    if (clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${clientSecret}`).toString("base64")}`;
    }
    refreshed = await fetchJson(fetchImpl, "https://api.x.com/2/oauth2/token", {
      method: "POST", headers, body: form({grant_type: "refresh_token",
        refresh_token: tokens.refreshToken, client_id: config.clientId}),
    });
  } else {
    refreshed = await fetchJson(fetchImpl, "https://oauth2.googleapis.com/token", {
      method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: form({grant_type: "refresh_token", refresh_token: tokens.refreshToken,
        client_id: config.clientId, client_secret: clientSecret}),
    });
  }
  return {
    ...tokens,
    accessToken: text(refreshed.access_token, 10000),
    refreshToken: text(refreshed.refresh_token, 10000) || tokens.refreshToken,
    expiresIn: Number(refreshed.expires_in || 0) || null,
    refreshed: true,
  };
}

function utcDate(daysAgo = 0, now = Date.now()) {
  return new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);
}

async function readHistoricalPerformance({provider, surface, tokens, account,
  fetchImpl = globalThis.fetch, now = Date.now()}) {
  const normalized = normalizeProvider(provider);
  if (normalized === "x") {
    const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(account.accountId)}/tweets`);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("tweet.fields", "created_at,public_metrics,non_public_metrics,organic_metrics");
    const body = await fetchJson(fetchImpl, url,
      {headers: {Authorization: `Bearer ${tokens.accessToken}`}});
    return (body.data || []).map((item) => ({providerObjectId: text(item.id, 180),
      observedAtMillis: now, periodStart: null, periodEnd: null,
      metrics: {views: item.public_metrics?.impression_count ?? null,
        engagements: ["like_count", "retweet_count", "reply_count", "quote_count"]
          .reduce((sum, key) => sum + Number(item.public_metrics?.[key] || 0), 0)},
      unavailable: ["reach", "saves", "clicks", "leads", "conversions"]}));
  }
  if (normalized === "youtube") {
    const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    url.searchParams.set("ids", "channel==MINE");
    url.searchParams.set("startDate", utcDate(30, now));
    url.searchParams.set("endDate", utcDate(1, now));
    url.searchParams.set("metrics", "views,likes,comments,shares,estimatedMinutesWatched");
    const body = await fetchJson(fetchImpl, url,
      {headers: {Authorization: `Bearer ${tokens.accessToken}`}});
    const row = body.rows?.[0];
    if (!row) return [];
    const keys = (body.columnHeaders || []).map((column) => column.name);
    const values = Object.fromEntries(keys.map((key, index) => [key, Number(row[index] || 0)]));
    return [{providerObjectId: text(account.accountId, 180), observedAtMillis: now,
      periodStart: utcDate(30, now), periodEnd: utcDate(1, now),
      metrics: {views: values.views ?? 0, engagements: (values.likes || 0) +
        (values.comments || 0) + (values.shares || 0),
      videoWatchSeconds: values.estimatedMinutesWatched == null ? null :
        values.estimatedMinutesWatched * 60},
      unavailable: ["reach", "clicks", "saves", "leads", "conversions"]}];
  }
  const pageToken = tokens.pageAccessToken || tokens.userAccessToken;
  const instagram = surface === "instagram" && account.linkedAccountId;
  const targetId = instagram ? account.linkedAccountId : account.accountId;
  const url = new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(targetId)}/insights`);
  url.searchParams.set("metric", instagram ? "views,reach,profile_views" :
    "page_impressions,page_post_engagements,page_views_total");
  url.searchParams.set("period", "days_28");
  url.searchParams.set("access_token", pageToken);
  const body = await fetchJson(fetchImpl, url);
  const providerMetrics = Array.isArray(body.data) ? body.data : [];
  if (!providerMetrics.length) return [];
  const metric = Object.fromEntries(providerMetrics.map((item) => {
    const raw = item.values?.at(-1)?.value;
    const value = raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
    return [item.name, value];
  }));
  return [{providerObjectId: text(targetId, 180), observedAtMillis: now,
    periodStart: utcDate(28, now), periodEnd: utcDate(0, now),
    metrics: instagram ? {views: metric.views ?? null, reach: metric.reach ?? null,
      profileActions: metric.profile_views ?? null} : {impressions: metric.page_impressions ?? null,
      engagements: metric.page_post_engagements ?? null, profileActions: metric.page_views_total ?? null},
    unavailable: instagram ? ["clicks", "saves", "leads", "conversions"] :
      ["reach", "clicks", "saves", "leads", "conversions"]}];
}

module.exports = {
  OAUTH_ATTEMPT_TTL_MS, PROVIDERS, PROVIDER_SCOPES, digest, normalizeProvider, normalizeScopes,
  encryptJson, decryptJson, validateProviderConfig, authorizationUrl, createAttempt,
  isReusableAttempt, continuationUrl,
  safeIdentityCandidate, assertAttempt, completeExchange, selectCandidate, callbackHtml,
  refreshTokens, readHistoricalPerformance,
};
