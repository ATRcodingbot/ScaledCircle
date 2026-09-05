"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../functions-social-operations/social_meta_connection");
const oauth = require("../functions-social-operations/social_oauth");
const p = {businessUid: "fixture-business", pageId: "123", pageName: "Fixture Page",
  instagramId: "456", instagramUsername: "fixture"};
const config = {provider: "meta", environment: "production", enabled: true,
  writeScopesEnabled: true, externalPublishingEnabled: false, metaDogfood: p,
  clientId: "fixture-app", redirectUri: oauth.callbackUrl({provider: "meta", environment: "production"})};
const key = Buffer.alloc(32, 9).toString("base64");
test("restricted Meta authority denies wrong tenant, environment, policy and publication flags", () => {
  assert.deepEqual(policy.authorize(config, p.businessUid), p);
  assert.deepEqual(policy.authorize(config, p.businessUid,
    Object.fromEntries(Object.entries(p).reverse())), p);
  assert.throws(() => policy.authorize(config, "other"));
  assert.throws(() => policy.authorize(config, p.businessUid, {...p, pageId: "789"}));
  for (const patch of [{environment: "staging"}, {enabled: false}, {writeScopesEnabled: false},
    {externalPublishingEnabled: true}, {metaDogfood: null}]) {
    assert.throws(() => policy.authorize({...config, ...patch}, p.businessUid));
  }
});
test("Meta confirmation rejects superseded, replayed, expired and cross-account attempts", () => {
  const args = {attempt: {businessUid: p.businessUid, provider: "meta", environment: "production",
    purpose: "meta_connection_authority", status: "identity_pending", expiresAtMillis: 2000, metaDogfood: p},
  attemptId: "attempt", businessUid: p.businessUid, environment: "production", config,
  facebook: {pendingAttemptId: "attempt"}, instagram: {}, now: 1000};
  policy.confirmation(args);
  for (const patch of [{facebook: {pendingAttemptId: "newer"}}, {now: 2000},
    {instagram: {providerUserId: "789"}}, {environment: "staging"},
    {attempt: {...args.attempt, status: "connected_write"}},
    {attempt: {...args.attempt, metaDogfood: null}}]) assert.throws(() => policy.confirmation({...args, ...patch}));
});
test("Meta capabilities derive from scopes and never authorize scheduling", () => {
  assert.equal(policy.capabilities(oauth.META_PUBLISH_SCOPES, "facebook").publishText, true);
  assert.equal(policy.capabilities(oauth.META_PUBLISH_SCOPES, "instagram").publishText, false);
  assert.equal(policy.capabilities(oauth.META_PUBLISH_SCOPES, "instagram").publishImage, true);
  assert.equal(policy.capabilities(oauth.PROVIDER_SCOPES.meta, "instagram").publishImage, false);
  assert.equal(policy.capabilities(oauth.META_PUBLISH_SCOPES, "instagram").schedule, false);
});
test("Meta exchange verifies live linkage and professional identity using GET only without leaking tokens", async () => {
  for (const defect of [null, "link", "type", "handle", "token", "extra_scope"]) {
    const attempt = oauth.createAttempt({businessUid: p.businessUid, provider: "meta", config,
      encryptionKey: key, now: 1000, scopes: oauth.META_PUBLISH_SCOPES, purpose: "meta_connection_authority"});
    let calls = 0;
    const responses = [{access_token: "short-fixture"}, {access_token: "long-fixture", expires_in: 3600},
      {data: [...oauth.META_PUBLISH_SCOPES, "public_profile", ...(defect === "extra_scope" ? ["ads_read"] : [])]
        .map(permission => ({permission, status: "granted"}))},
      {id: p.pageId, name: p.pageName, access_token: defect === "token" ? null : "page-fixture",
        instagram_business_account: {id: defect === "link" ? "789" : p.instagramId}},
      {id: p.instagramId, username: defect === "handle" ? "other" : p.instagramUsername,
        account_type: defect === "type" ? "PERSONAL" : "BUSINESS"}];
    const run = oauth.completeExchange({attempt: attempt.record, code: "fixture-code", config,
      clientSecret: "fixture-secret", encryptionKey: key, now: 1100,
      fetchImpl: async (url, init) => {
        assert.equal(init?.method || "GET", "GET");
        assert.equal(new URL(url).hostname, "graph.facebook.com");
        return {ok: true, json: async () => responses[calls++]};
      }});
    if (defect) {await assert.rejects(run); continue;}
    const completed = await run;
    assert.equal(calls, 5);
    assert.equal(completed.status, "identity_pending");
    assert.equal(JSON.stringify(completed).includes("page-fixture"), false);
    const selected = oauth.selectCandidate({attempt: {...attempt.record, ...completed},
      candidateId: "meta_page_123", encryptionKey: key, now: 1200});
    assert.equal(selected.privateAccount.linkedAccountId, "456");
    assert.equal(JSON.stringify(selected.credentialRecord).includes("long-fixture"), false);
    assert.deepEqual(completed.grantedScopes, [...oauth.META_PUBLISH_SCOPES].sort());
  }
});
