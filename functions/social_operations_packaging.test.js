"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "functions-social-operations");
const indexSource = fs.readFileSync(path.join(packageRoot, "index.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const firebase = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));

test("Social Operations has one dedicated narrowly-secret-bound codebase", () => {
  const config = firebase.functions.find((entry) => entry.codebase === "social-operations");
  assert.equal(config.source, "functions-social-operations");
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ["firebase-admin", "firebase-functions"]);
  for (const forbidden of [
    "CENSUS_API_KEY", "TWILIO_", "OPENAI_", "STRIPE_", "SMTP_", "GOOGLE_ADS_",
  ]) assert.doesNotMatch(indexSource, new RegExp(forbidden));
  for (const required of ["SOCIAL_OAUTH_TOKEN_ENCRYPTION_KEY",
    "META_SOCIAL_APP_SECRET", "YOUTUBE_SOCIAL_CLIENT_SECRET", "X_SOCIAL_CLIENT_SECRET"]) {
    assert.match(indexSource, new RegExp(required));
  }
});

test("YouTube OAuth codebase binds only shared encryption and the YouTube secret", () => {
  const entrypoint = (name) => indexSource.match(
    new RegExp(`exports\\.${name} = [\\s\\S]*?\\n\\);`))[0];
  for (const name of ["socialOAuthCallbackV1", "syncSocialReadOnlyPerformanceV1"]) {
    const source = entrypoint(name);
    assert.match(source, /providerSecretBinding\("youtube"\)\.secret/);
    assert.doesNotMatch(source, /META_SOCIAL_APP_SECRET|X_SOCIAL_CLIENT_SECRET/);
  }
});

test("X OAuth codebase binds only shared encryption and the X secret", () => {
  const entrypoint = (name) => indexSource.match(
    new RegExp(`exports\\.${name} = [\\s\\S]*?\\n\\);`))[0];
  for (const name of ["socialOAuthXCallbackV1", "syncXSocialReadOnlyPerformanceV1"]) {
    const source = entrypoint(name);
    assert.match(source, /providerSecretBinding\("x"\)\.secret/);
    assert.doesNotMatch(source, /META_SOCIAL_APP_SECRET|YOUTUBE_SOCIAL_CLIENT_SECRET/);
  }
});

test("Social Operations exports provider-free surfaces plus one bounded X certification", () => {
  const names = [...indexSource.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
  assert.deepEqual(names.sort(), [
    "approveFirstXProductionSuccessorV4",
    "approveSocialContentPlanV1",
    "beginFirstXPublishAuthorizationV1",
    "beginSocialOAuthConnectionV1",
    "configureSocialProviderV1",
    "confirmFirstXPublishAuthorizationV1",
    "confirmSocialOAuthConnectionV1",
    "createEmailContentPlanV1",
    "createFirstXPublishApprovalV1",
    "createFirstXPublishVersionV2",
    "createFirstXPublishVersionV3",
    "createFirstXReplacementV1",
    "createSocialContentPlanV1",
    "executeFirstXPublishV1",
    "getFirstXPublishCertificationV1",
    "getSocialOAuthAttemptV1",
    "getSocialOperationsAdminSummary",
    "getSocialOperationsWorkspace",
    "ingestScaledCircleLaunchPlanV1",
    "prepareFirstXPublishFoundationV1",
    "proposeScheduledSocialReplacementV1",
    "publishFirstXProductionSuccessorV4",
    "rateHistoricalSocialContentV1",
    "reconcileFirstXPublishV1",
    "reconcileFirstXRepairV1",
    "reconcileFounderManualFirstXDeletionV1",
    "recordFirstXFounderApprovalV1",
    "registerFirstXProductionResponseAssetV1",
    "reviewScheduledSocialContentV1",
    "socialOAuthCallbackV1",
    "socialOAuthMetaCallbackV1",
    "socialOAuthXCallbackV1",
    "syncMetaSocialReadOnlyPerformanceV1",
    "syncSocialReadOnlyPerformanceV1",
    "syncXSocialReadOnlyPerformanceV1",
  ]);
});

test("X v4 approval and publication are private, exact, and single-attempt", () => {
  const approval = indexSource.match(
    /exports\.approveFirstXProductionSuccessorV4 = [\s\S]*?\n\);/)[0];
  const publish = indexSource.match(
    /exports\.publishFirstXProductionSuccessorV4 = [\s\S]*?\n\);/)[0];
  assert.match(approval, /invoker: "private"/);
  assert.doesNotMatch(approval,
    /providerSecretBinding|createPost|createReplacementPost|uploadMedia/);
  assert.match(publish, /invoker: "private"/);
  assert.match(publish, /providerSecretBinding\("x"\)/);
  assert.match(publish, /attemptCount: 1/);
  assert.match(publish, /providerCreateAttemptCount: 1/);
  assert.match(publish, /reconcilePost/);
  assert.match(publish, /inspectHistoricalPost/);
  assert.match(publish, /assertHistoricalDeletionEvidence/);
  assert.match(publish, /mode === "preflight"/);
  assert.match(publish, /historicalDeletionEvidenceAccepted: true/);
  assert.match(publish, /providerMutationCount: 0/);
  assert.ok(publish.indexOf('mode === "preflight"') < publish.indexOf('status: "creating"'));
  assert.doesNotMatch(publish, /uploadMedia|method:\s*"DELETE"|deletePost/);
  assert.doesNotMatch(approval + publish,
    /scaledcircle-staging\.web\.app|firebaseapp\.com|localhost|127\.0\.0\.1/);
  assert.match(publish, /refreshStoredXCredential/);
  assert.doesNotMatch(publish, /socialOAuth\.refreshTokens/);
});

test("maintained X refresh persists rotation before provider reads and rejects stale writers", () => {
  const helper = indexSource.match(
    /async function refreshStoredXCredential[\s\S]*?\nfunction firstXProductionSuccessorRefs/)[0];
  assert.match(helper, /beginCredentialRefresh/);
  assert.match(helper, /completeCredentialRefresh/);
  assert.match(helper, /rotationGeneration/);
  assert.match(helper, /connectionRevision/);
  assert.match(helper, /refreshLeaseId/);
  assert.match(helper, /readProviderIdentity/);
  assert.ok(helper.indexOf("tokenEnvelope:") < helper.indexOf("readProviderIdentity"));
  assert.match(helper, /status: "reauth_required"/);
  assert.doesNotMatch(helper, /createPost|createReplacementPost|uploadMedia|method:\s*"DELETE"/);
});

test("X reconnect is generation-safe and an expired attempt cannot replace a healthy connection", () => {
  const confirm = indexSource.match(
    /exports\.confirmFirstXPublishAuthorizationV1 = [\s\S]*?\n\);/)[0];
  assert.match(confirm, /currentConnection\.pendingAttemptId !== attemptId/);
  assert.match(confirm, /currentAttempt\?\.status !== "identity_pending"/);
  assert.match(confirm, /currentAttempt\.expiresAtMillis/);
  assert.match(confirm, /credentialGeneration\(currentCredential\) \+ 1/);
  assert.match(confirm, /connectionRevision\(currentConnection\) \+ 1/);
  assert.match(confirm, /tokenHealth: "healthy"/);
});

test("X write authorization supersedes an active read-only attempt before replacement", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "functions-social-operations", "index.js"),
    "utf8",
  );
  assert.match(source, /status: "superseded"/);
  assert.match(source, /supersededByAttemptId: proposed\.attemptId/);
  assert.match(source, /transaction\.update\(pendingRef/);
});

test("bounded X write entrypoints bind only shared encryption and X secret", () => {
  const entrypoint = (name) => indexSource.match(
    new RegExp(`exports\\.${name} = [\\s\\S]*?\\n\\);`))[0];
  for (const name of ["executeFirstXPublishV1", "reconcileFirstXPublishV1",
    "reconcileFounderManualFirstXDeletionV1", "createFirstXReplacementV1",
    "reconcileFirstXRepairV1"]) {
    const source = entrypoint(name);
    assert.match(source, /providerSecretBinding\("x"\)\.secret/);
    assert.doesNotMatch(source, /META_SOCIAL_APP_SECRET|YOUTUBE_SOCIAL_CLIENT_SECRET/);
  }
});

test("X public-origin repair records the Founder deletion without a provider delete", () => {
  const deletion = indexSource.match(
    /exports\.reconcileFounderManualFirstXDeletionV1 = [\s\S]*?\n\);/)[0];
  const replacement = indexSource.match(
    /exports\.createFirstXReplacementV1 = [\s\S]*?\n\);/)[0];
  const reconcileRepair = indexSource.match(
    /exports\.reconcileFirstXRepairV1 = [\s\S]*?\n\);/)[0];
  assert.match(deletion, /ORIGINAL_DEFECTIVE_POST_ID/);
  assert.match(deletion, /FOUNDER_MANUAL_DELETE|ORIGINAL_DELETION_SOURCE/);
  assert.match(deletion, /providerDeleteAttemptCount: 0/);
  assert.match(deletion, /providerDeleteReceipt: null/);
  assert.doesNotMatch(deletion, /method:\s*"DELETE"|deletePost\(|createPost\(/);
  assert.match(replacement, /replacementAttemptCount/);
  assert.match(replacement, /createReplacementPost/);
  assert.doesNotMatch(replacement, /uploadMedia/);
  assert.match(reconcileRepair, /unknown_replacement_outcome/);
  assert.doesNotMatch(reconcileRepair, /createPost|createReplacementPost/);
  assert.doesNotMatch(deletion + replacement, /RRULE|recurr|daily/i);
  const renderer = indexSource.match(/function firstXTrackedUrl\(asset\) \{[\s\S]*?\n\}/)[0];
  assert.match(renderer, /public_publish/);
  assert.match(renderer, /https:\/\/scaledcircle\.com/);
  assert.doesNotMatch(renderer, /scaledcircle-staging|\.web\.app|firebaseapp/);
});

test("the exact X publish job is one-time and terminal after reconciliation", () => {
  const execute = indexSource.match(
    /exports\.executeFirstXPublishV1 = [\s\S]*?\n\);/)[0];
  const reconcile = indexSource.match(
    /exports\.reconcileFirstXPublishV1 = [\s\S]*?\n\);/)[0];
  assert.match(execute, /job\.status === "completed"/);
  assert.match(execute, /job\.status !== "scheduled"/);
  assert.match(execute, /Number\(job\.attemptCount \|\| 0\) !== 0/);
  assert.match(execute, /status: "completed"/);
  assert.match(reconcile, /status: "completed"/);
  assert.doesNotMatch(execute + reconcile, /RRULE|recurr|daily/i);
});

test("X write reconsent remains blocked until separate Founder publication approval", () => {
  const entrypoint = indexSource.match(
    /exports\.beginFirstXPublishAuthorizationV1 = [\s\S]*?\n\);/)[0];
  assert.match(entrypoint, /founderPublicationApproved !== true/);
  assert.match(indexSource, /exports\.recordFirstXFounderApprovalV1 =/);
  const approval = indexSource.match(
    /exports\.recordFirstXFounderApprovalV1 = [\s\S]*?\n\);/)[0];
  assert.match(approval, /socialExternalApprovalIntents/);
  assert.match(approval, /externalExecutionAllowed: false/);
  assert.match(approval, /providerMutations: 0/);
});

test("Meta OAuth codebase binds only shared encryption and the Meta secret", () => {
  const entrypoint = (name) => indexSource.match(
    new RegExp(`exports\\.${name} = [\\s\\S]*?\\n\\);`))[0];
  for (const name of ["socialOAuthMetaCallbackV1", "syncMetaSocialReadOnlyPerformanceV1"]) {
    const source = entrypoint(name);
    assert.match(source, /providerSecretBinding\("meta"\)\.secret/);
    assert.doesNotMatch(source, /YOUTUBE_SOCIAL_CLIENT_SECRET|X_SOCIAL_CLIENT_SECRET/);
  }
});
