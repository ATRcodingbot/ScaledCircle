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
  assert.equal(JSON.stringify(attempt.record).includes(attempt.authorizationUrl), false);
  assert.equal(new URL(attempt.authorizationUrl).searchParams.get("code_challenge_method"), "S256");
  assert.equal(oauth.continuationUrl(attempt.record, {businessUid: "business-one", provider: "x",
    attemptId: attempt.attemptId, encryptionKey: key, now: 1001}), attempt.authorizationUrl);
});

test("active attempts are reused while expired and cross-tenant attempts fail closed", () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "youtube",
    config: config("youtube"), encryptionKey: key, now: 1000});
  assert.equal(oauth.isReusableAttempt(attempt.record,
    {businessUid: "biz", provider: "youtube", now: 2000}), true);
  assert.equal(oauth.isReusableAttempt(attempt.record,
    {businessUid: "other", provider: "youtube", now: 2000}), false);
  assert.equal(oauth.isReusableAttempt(attempt.record,
    {businessUid: "biz", provider: "youtube", now: 1000 + oauth.OAUTH_ATTEMPT_TTL_MS}), false);
  assert.equal(oauth.continuationUrl(attempt.record, {businessUid: "biz", provider: "youtube",
    attemptId: attempt.attemptId, encryptionKey: key,
    now: 1000 + oauth.OAUTH_ATTEMPT_TTL_MS}), null);
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

test("X publish reconsent permits only the exact bounded image-post scope set", () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "x",
    config: config("x"), encryptionKey: key, now: 1000,
    scopes: oauth.X_PUBLISH_SCOPES, purpose: "x_first_publish_certification"});
  const scopes = new URL(attempt.authorizationUrl).searchParams.get("scope").split(" ");
  assert.deepEqual(new Set(scopes), new Set([
    "users.read", "tweet.read", "offline.access", "tweet.write", "media.write",
  ]));
  assert.deepEqual(attempt.record.requestedScopes, oauth.X_PUBLISH_SCOPES);
  assert.throws(() => oauth.createAttempt({businessUid: "biz", provider: "x",
    config: config("x"), encryptionKey: key, scopes: oauth.X_PUBLISH_SCOPES}),
  /scope_purpose_mismatch/);
  assert.throws(() => oauth.requestedScopes("x", [...oauth.X_PUBLISH_SCOPES, "follows.write"]),
    /scope_set_forbidden/);
  assert.throws(() => oauth.requestedScopes("youtube", oauth.X_PUBLISH_SCOPES),
    /scope_set_forbidden/);
});

test("X publish callback projects write capability without exposing credentials", async () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "x",
    config: config("x"), encryptionKey: key, now: 1000,
    scopes: oauth.X_PUBLISH_SCOPES, purpose: "x_first_publish_certification"});
  const fetchImpl = async (url) => String(url).includes("oauth2/token") ? {
    ok: true, json: async () => ({access_token: "access-secret", refresh_token: "refresh-secret",
      expires_in: 7200, scope: oauth.X_PUBLISH_SCOPES.join(" ")}),
  } : {ok: true, json: async () => ({data: {id: "2090731921177210880",
    name: "Scaled Circle", username: "ScaledCircle"}})};
  const completed = await oauth.completeExchange({attempt: attempt.record, code: "code",
    config: config("x"), clientSecret: "client-secret", encryptionKey: key,
    fetchImpl, now: 2000});
  assert.equal(completed.safeCandidates[0].capabilities.publishText, true);
  assert.equal(completed.safeCandidates[0].capabilities.publishImage, true);
  assert.equal(completed.safeCandidates[0].capabilities.publishVideo, false);
  assert.equal(JSON.stringify(completed).includes("access-secret"), false);
});

test("Meta callback returns the exact owned Page and linked professional account safely", async () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "meta",
    config: config("meta"), encryptionKey: key, now: 1000});
  const responses = [
    {access_token: "short-secret"},
    {access_token: "long-secret", expires_in: 3600},
    {data: oauth.PROVIDER_SCOPES.meta.map((permission) => ({permission, status: "granted"}))},
    {data: [{id: "1198660363339503", name: "Scaled Circle", access_token: "page-secret",
      tasks: ["ANALYZE"]}]},
    {id: "1198660363339503", name: "Scaled Circle",
      instagram_business_account: {id: "17841441730285620",
        username: "scaledcircleapp", name: "Scaled Circle"}},
  ];
  const completed = await oauth.completeExchange({attempt: attempt.record, code: "code",
    config: config("meta"), clientSecret: "client-secret", encryptionKey: key,
    fetchImpl: async () => ({ok: true, json: async () => responses.shift()}), now: 2000});
  assert.equal(completed.status, "identity_pending");
  assert.deepEqual(completed.safeCandidates[0], {
    candidateId: "meta_page_1198660363339503", provider: "meta",
    accountDisplayName: "Scaled Circle", accountType: "facebook_page", handle: null,
    linkedAccountDisplayName: "Scaled Circle", linkedHandle: "scaledcircleapp",
    capabilities: {profile: true, analytics: true, publishText: false,
      publishImage: false, publishVideo: false, schedule: false},
  });
  assert.equal(JSON.stringify(completed).includes("page-secret"), false);
  assert.equal(JSON.stringify(completed).includes("long-secret"), false);
});

test("Meta callback resolves the exact granularly selected Page when me/accounts is empty", async () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "meta",
    config: config("meta"), encryptionKey: key, now: 1000});
  const responses = [
    {access_token: "short-secret"},
    {access_token: "long-secret", expires_in: 3600},
    {data: oauth.PROVIDER_SCOPES.meta.map((permission) => ({permission, status: "granted"}))},
    {data: []},
    {data: {granular_scopes: [
      {scope: "pages_show_list", target_ids: ["1198660363339503"]},
      {scope: "instagram_basic", target_ids: ["17841441730285620"]},
      {scope: "read_insights", target_ids: ["1198660363339503", "17841441730285620"]},
    ]}},
    {id: "1198660363339503", name: "Scaled Circle",
      instagram_business_account: {id: "17841441730285620",
        username: "scaledcircleapp", name: "Scaled Circle"}},
  ];
  const calls = [];
  const completed = await oauth.completeExchange({attempt: attempt.record, code: "code",
    config: config("meta"), clientSecret: "client-secret", encryptionKey: key,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return {ok: true, json: async () => responses.shift()};
    }, now: 2000});
  assert.equal(completed.status, "identity_pending");
  assert.equal(completed.safeCandidates[0].candidateId, "meta_page_1198660363339503");
  assert.equal(completed.safeCandidates[0].linkedHandle, "scaledcircleapp");
  assert.equal(calls.some((url) => url.includes("debug_token")), true);
  assert.equal(calls.some((url) => url.includes("1198660363339503")), true);
  assert.equal(calls.some((url) => url.includes("17841441730285620") &&
    !url.includes("debug_token")), false);
  assert.equal(JSON.stringify(completed).includes("page-secret"), false);
});

test("Meta Page fallback excludes accounts-edge-only fields after provider code 100", async () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "meta",
    config: config("meta"), encryptionKey: key, now: 1000});
  const responses = [
    {access_token: "short-secret"},
    {access_token: "long-secret", expires_in: 3600},
    {data: oauth.PROVIDER_SCOPES.meta.map((permission) => ({permission, status: "granted"}))},
    {data: []},
    {data: {granular_scopes: [
      {scope: "pages_show_list", target_ids: ["1198660363339503"]},
      {scope: "instagram_basic", target_ids: ["17841441730285620"]},
    ]}},
    {id: "1198660363339503", name: "Scaled Circle",
      instagram_business_account: {id: "17841441730285620",
        username: "scaledcircleapp", name: "Scaled Circle"}},
  ];
  const calls = [];
  const completed = await oauth.completeExchange({attempt: attempt.record, code: "code",
    config: config("meta"), clientSecret: "client-secret", encryptionKey: key,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return {ok: true, json: async () => responses.shift()};
    }, now: 2000});
  const pageCall = calls.find((url) => url.includes("1198660363339503") &&
    !url.includes("debug_token"));
  assert.match(decodeURIComponent(pageCall), /fields=id,name,instagram_business_account/);
  assert.doesNotMatch(decodeURIComponent(pageCall), /access_token,tasks/);
  assert.equal(completed.safeCandidates[0].linkedHandle, "scaledcircleapp");
});

test("Meta provider failures retain safe Graph diagnostics without credential material", async () => {
  const attempt = oauth.createAttempt({businessUid: "biz", provider: "meta",
    config: config("meta"), encryptionKey: key, now: 1000});
  const responses = [
    {ok: true, body: {access_token: "short-secret"}},
    {ok: true, body: {access_token: "long-secret", expires_in: 3600}},
    {ok: true, body: {data: oauth.PROVIDER_SCOPES.meta.map((permission) =>
      ({permission, status: "granted"}))}},
    {ok: true, body: {data: []}},
    {ok: true, body: {data: {granular_scopes: [
      {scope: "pages_show_list", target_ids: ["1198660363339503"]},
    ]}}},
    {ok: false, status: 400, body: {error: {code: 100, error_subcode: 33,
      message: "Unsupported get request. access_token=must-not-log"}}},
  ];
  await assert.rejects(() => oauth.completeExchange({attempt: attempt.record, code: "code",
    config: config("meta"), clientSecret: "client-secret", encryptionKey: key,
    fetchImpl: async () => {
      const response = responses.shift();
      return {ok: response.ok, status: response.status || 200,
        json: async () => response.body};
    }, now: 2000}), (error) => {
    assert.equal(error.providerStage, "meta_page_identity");
    assert.equal(error.providerEndpoint, "/{page-id}");
    assert.equal(error.providerGraphVersion, "v23.0");
    assert.equal(error.providerTokenClass, "long_lived_user");
    assert.equal(error.selectedPageId, "1198660363339503");
    assert.equal(error.providerCode, "100");
    assert.equal(error.providerSubcode, "33");
    assert.doesNotMatch(error.providerMessage, /must-not-log/);
    return true;
  });
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

test("missing Meta provider evidence remains unavailable instead of becoming zero", async () => {
  const snapshots = await oauth.readHistoricalPerformance({provider: "meta",
    surface: "facebook", tokens: {pageAccessToken: "token"}, account: {accountId: "page"},
    fetchImpl: async () => ({ok: true, json: async () => ({data: []})})});
  assert.deepEqual(snapshots, []);

  const partial = await oauth.readHistoricalPerformance({provider: "meta",
    surface: "facebook", tokens: {pageAccessToken: "token"}, account: {accountId: "page"},
    fetchImpl: async () => ({ok: true, json: async () => ({data: [
      {name: "page_impressions", values: [{value: 0}]},
    ]})})});
  assert.equal(partial[0].metrics.impressions, 0);
  assert.equal(partial[0].metrics.engagements, null);
  assert.equal(partial[0].metrics.profileActions, null);
});
