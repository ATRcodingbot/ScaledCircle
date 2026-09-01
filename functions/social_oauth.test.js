"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const oauth = require("../functions-social-operations/social_oauth");

const key = Buffer.alloc(32, 7).toString("base64");
const config = (provider) => ({provider, clientId: `${provider}-client`,
  redirectUri: "https://us-east1-scaledcircle-staging.cloudfunctions.net/socialOAuthCallbackV1",
  environment: "staging", enabled: true, appName: "ScaledCircle Social Operations — Production"});

test("OAuth URLs request only the certified read-only scopes", () => {
  for (const provider of oauth.PROVIDERS) {
    const url = new URL(oauth.authorizationUrl({provider, config: config(provider),
      state: "opaque-state", codeChallenge: "challenge"}));
    const scopes = String(url.searchParams.get("scope") || "").split(/[ ,]+/);
    assert.deepEqual(new Set(scopes), new Set(oauth.PROVIDER_SCOPES[provider]));
    assert.equal(scopes.some((scope) => /write|upload|manage_posts|content_publish/i.test(scope)), false);
    assert.equal(url.searchParams.get("state"), "opaque-state");
  }
});

test("attempts use hashed state, PKCE, expiry, and encrypted verifier", () => {
  let byte = 0;
  const randomBytes = (size) => Buffer.alloc(size, ++byte);
  const attempt = oauth.createAttempt({businessUid: "business-one", provider: "x",
    config: config("x"), encryptionKey: key, now: 1000, randomBytes});
  assert.equal(attempt.attemptId, oauth.digest(attempt.state));
  assert.equal(attempt.record.expiresAtMillis, 1000 + oauth.OAUTH_ATTEMPT_TTL_MS);
  assert.equal(JSON.stringify(attempt.record).includes("verifier"), true);
  assert.equal(JSON.stringify(attempt.record).includes(attempt.state), false);
  assert.equal(new URL(attempt.authorizationUrl).searchParams.get("code_challenge_method"), "S256");
});

test("encrypted credential envelopes authenticate associated context", () => {
  const envelope = oauth.encryptJson({accessToken: "sensitive-token"}, key, "biz:x:account");
  assert.equal(JSON.stringify(envelope).includes("sensitive-token"), false);
  assert.deepEqual(oauth.decryptJson(envelope, key, "biz:x:account"),
    {accessToken: "sensitive-token"});
  assert.throws(() => oauth.decryptJson(envelope, key, "other-context"));
});

test("missing scopes fail closed before identity confirmation", () => {
  const scope = oauth.normalizeScopes("x", ["users.read"]);
  assert.deepEqual(scope.missing.sort(), ["offline.access", "tweet.read"]);
  assert.throws(() => oauth.selectCandidate({attempt: {status: "error"},
    candidateId: "one", encryptionKey: key}), /identity_not_ready/);
});

test("X callback exchanges with PKCE and returns only safe identity metadata", async () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "x",
    config: config("x"), encryptionKey: key, now: 1000});
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), options});
    if (String(url).includes("oauth2/token")) return {
      ok: true, json: async () => ({access_token: "access-secret", refresh_token: "refresh-secret",
        expires_in: 7200, scope: "users.read tweet.read offline.access"}),
    };
    return {ok: true, json: async () => ({data: {id: "123", name: "ScaledCircle",
      username: "scaledcircle"}})};
  };
  const completed = await oauth.completeExchange({attempt: attempt.record, code: "code",
    config: config("x"), clientSecret: "client-secret", encryptionKey: key,
    fetchImpl, now: 2000});
  assert.equal(completed.status, "identity_pending");
  assert.deepEqual(completed.safeCandidates[0], {
    candidateId: "x_user_123", provider: "x", accountDisplayName: "ScaledCircle",
    accountType: "x_user", handle: "scaledcircle", linkedAccountDisplayName: null,
    linkedHandle: null, capabilities: {profile: true, analytics: true, publishText: false,
      publishImage: false, publishVideo: false, schedule: false},
  });
  assert.equal(JSON.stringify(completed).includes("access-secret"), false);
  assert.match(String(calls[0].options.body), /code_verifier=/);
});

test("identity confirmation stores encrypted credentials and never grants writes", () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "youtube",
    config: config("youtube"), encryptionKey: key, now: 1000});
  const aad = `biz:youtube:${attempt.attemptId}`;
  const record = {...attempt.record, status: "identity_pending",
    grantedScopes: [...oauth.PROVIDER_SCOPES.youtube], missingScopes: [],
    candidateEnvelope: oauth.encryptJson({candidates: [{candidateId: "youtube_channel_abc",
      provider: "youtube", accountId: "abc", accountDisplayName: "ScaledCircle",
      accountType: "youtube_channel", handle: "@ScaledCircle", accessToken: "access",
      refreshToken: "refresh", capabilities: {profile: true, analytics: true}}]}, key, aad)};
  const selected = oauth.selectCandidate({attempt: record,
    candidateId: "youtube_channel_abc", encryptionKey: key, now: 2000});
  assert.equal(selected.safeCandidate.capabilities.publishVideo, false);
  assert.equal(JSON.stringify(selected.credentialRecord).includes("access"), false);
  assert.equal(selected.credentialRecord.grantedScopes.includes("youtube.upload"), false);
});

test("callback HTML escapes provider-controlled text", () => {
  const html = oauth.callbackHtml({success: false, message: "<script>alert(1)</script>"});
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("YouTube historical sync returns no snapshot when the provider has no evidence", async () => {
  const snapshots = await oauth.readHistoricalPerformance({provider: "youtube",
    surface: "youtube", tokens: {accessToken: "token"}, account: {accountId: "channel"},
    fetchImpl: async () => ({ok: true, json: async () => ({columnHeaders: [], rows: []})})});
  assert.deepEqual(snapshots, []);
});

test("YouTube watch minutes normalize to canonical watch seconds", async () => {
  const snapshots = await oauth.readHistoricalPerformance({provider: "youtube",
    surface: "youtube", tokens: {accessToken: "token"}, account: {accountId: "channel"},
    fetchImpl: async () => ({ok: true, json: async () => ({
      columnHeaders: ["views", "likes", "comments", "shares", "estimatedMinutesWatched"]
        .map((name) => ({name})),
      rows: [[100, 4, 2, 1, 12]],
    })})});
  assert.equal(snapshots[0].metrics.videoWatchSeconds, 720);
  assert.equal(snapshots[0].metrics.engagements, 7);
});

test("Instagram reach remains available when returned by the provider", async () => {
  const snapshots = await oauth.readHistoricalPerformance({provider: "meta",
    surface: "instagram", tokens: {pageAccessToken: "token"},
    account: {accountId: "page", linkedAccountId: "instagram"},
    fetchImpl: async () => ({ok: true, json: async () => ({data: [
      {name: "views", values: [{value: 40}]},
      {name: "reach", values: [{value: 30}]},
      {name: "profile_views", values: [{value: 5}]},
    ]})})});
  assert.equal(snapshots[0].metrics.reach, 30);
  assert.equal(snapshots[0].unavailable.includes("reach"), false);
});
