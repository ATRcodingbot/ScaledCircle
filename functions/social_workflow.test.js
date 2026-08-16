"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const social = require("./social_workflow");

const posts = [{provider: "facebook", body: "A grounded deck tip."},
  {provider: "instagram", format: "feed", body: "A separate Instagram caption."}];

test("provider availability is honest and capability-driven", () => {
  const providers = social.providerAvailability();
  assert.equal(providers.length, 4);
  assert.equal(providers.every((item) => item.capabilities.canCreatePost === false), true);
  assert.equal(providers.find((item) => item.provider === "facebook").status, "requires_approval");
});

test("draft belongs to one Business and AI generation is never approval", () => {
  const draft = social.createDraft({uid: "business-one", artifactId: "artifact", posts}).record;
  assert.equal(draft.status, "ready_for_review");
  assert.equal(draft.approvedAt, null);
  assert.throws(() => social.approveDraft({uid: "business-two", record: draft,
    contentVersion: 1}), /not_owned/);
});

test("editing invalidates approval and increments content version", () => {
  const ready = social.createDraft({uid: "business-one", artifactId: "artifact", posts}).record;
  const approved = social.approveDraft({uid: "business-one", record: ready, contentVersion: 1});
  const edited = social.editDraft({uid: "business-one", record: approved,
    posts: [{provider: "facebook", body: "Updated copy."}]});
  assert.equal(edited.status, "ready_for_review");
  assert.equal(edited.contentVersion, 2);
  assert.equal(edited.approvedContentVersion, null);
});

test("scheduling requires current approval and an owned connected capability", () => {
  const ready = social.createDraft({uid: "business-one", artifactId: "artifact", posts}).record;
  const draft = {...social.approveDraft({uid: "business-one", record: ready,
    contentVersion: 1}), id: "draft-one"};
  const connection = {id: "meta-one", businessUid: "business-one", provider: "facebook",
    connectionStatus: "connected", requiresReconnect: false, capabilities: {canCreatePost: true}};
  const first = social.publishingJob({uid: "business-one", draft, postIndex: 0, connection,
    scheduledFor: "2026-08-20T13:00:00Z", now: Date.UTC(2026, 7, 16)});
  const second = social.publishingJob({uid: "business-one", draft, postIndex: 0, connection,
    scheduledFor: "2026-08-20T13:00:00Z", now: Date.UTC(2026, 7, 16)});
  assert.equal(first.id, second.id);
  assert.throws(() => social.publishingJob({uid: "business-two", draft, postIndex: 0,
    connection, scheduledFor: "2026-08-20T13:00:00Z", now: 0}), /not_owned/);
});

test("disconnected or revoked connections fail closed", () => {
  const connection = {businessUid: "business-one", provider: "facebook",
    connectionStatus: "connected", requiresReconnect: true, capabilities: {canCreatePost: true}};
  assert.throws(() => social.validateConnection("business-one", connection, "facebook"),
    /connection_required/);
});

test("media paths are owner scoped and do not infer photo facts", () => {
  const media = social.mediaRecord({uid: "business-one", mediaId: "photo-one",
    storagePath: "social_media/business-one/photo-one/deck.jpg", filename: "deck.jpg",
    category: "Decks", description: "Completed deck project"});
  assert.equal(media.description, "Completed deck project");
  assert.equal(Object.hasOwn(media, "price"), false);
  assert.throws(() => social.mediaRecord({uid: "business-two", mediaId: "photo-one",
    storagePath: "social_media/business-one/photo-one/deck.jpg"}), /invalid_social_media_path/);
});

test("mock provider proves one idempotent job can record a provider result", async () => {
  const provider = new social.MockSocialPublishingProvider({providerPostId: "post-1",
    providerPostUrl: "https://example.test/post-1"});
  const result = await provider.publish({jobId: "job-one", body: "Approved body"});
  assert.equal(result.providerPostId, "post-1");
  assert.equal(provider.calls.length, 1);
});
