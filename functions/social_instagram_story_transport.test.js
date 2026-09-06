"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const model = require("./social_story_model"), {createTransport, createStore, describe} = require("./social_instagram_story_transport");
function fixture() {
  const bytes = Buffer.from("story fixture"), sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const revision = model.media({owner: "owner", provider: "instagram", sha256, sourceHashes: [sha256], width: 1080,
    height: 1920, mime: "image/jpeg", bytes: bytes.length, url: `https://scaledcircle.com/social/${sha256}.jpg`,
    renditionRecipe: "test", intentionalRendition: true, textBounds: {x: 100, y: 300, width: 800, height: 1000}});
  const job = {id: `story_job_${"a".repeat(64)}`, surface: "story", owner: "owner", provider: "instagram", accountId: "123",
    mediaRevisionId: revision.id, mediaHash: sha256, versionId: "story_version_test", scheduledFor: "2030-01-01T00:00:00Z"};
  const account = {owner: "owner", id: "123", linkedPageId: "456", type: "BUSINESS", login: "facebook", roleOrigin: "direct",
    scopes: ["instagram_basic", "instagram_content_publish", "pages_read_engagement"]};
  const records = new Map(); let tail = Promise.resolve(), creates = 0, ready = true, denied = false, lose = null;
  const db = {doc: path => ({path, get: async () => ({data: () => records.get(path)})}), runTransaction: fn => {
    const task = tail.then(() => fn({get: r => r.get(), create: (r,v) => {assert.equal(records.has(r.path), false); records.set(r.path, structuredClone(v));},
      update: (r,v) => records.set(r.path, {...records.get(r.path), ...structuredClone(v)})})); tail = task.catch(() => {}); return task;
  }};
  const store = createStore({db, authorize: async () => {if (denied) throw Error("story_paused");}});
  const fetchImpl = async (url, options) => {
    if (url === revision.url) return new Response(bytes, {headers: {"content-type": "image/jpeg"}});
    assert.match(url, /^https:\/\/graph.facebook.com\/v26.0\//);
    if (options.method === "POST") {
      creates++; const body = JSON.parse(options.body);
      if (url.endsWith("/media")) assert.deepEqual(body, {image_url: revision.url, media_type: "STORIES"});
      else {assert.ok(url.endsWith("/media_publish")); assert.deepEqual(body, {creation_id: "700"});}
      if (lose === (url.endsWith("/media") ? "container" : "publish")) throw Error("ambiguous_network_failure");
      return Response.json({id: url.endsWith("/media") ? "700" : "800"});
    }
    if (url.includes("/content_publishing_limit?")) return Response.json({data: [{quota_usage: 3, config: {quota_total: 50, quota_duration: 86400}}]});
    if (url.includes("/700?")) return Response.json({id: "700", status_code: ready ? "FINISHED" : "IN_PROGRESS"});
    assert.ok(url.includes("/123/stories?")); return Response.json({data: [{id: "800", media_product_type: "STORY"}]});
  };
  const args = {job, revision, account, store, fetchImpl, deploymentEnabled: true, now: () => Date.parse(job.scheduledFor),
    authorize: async () => {if (denied) throw Error("story_paused");},
    credentials: async () => ({owner: "owner", accountId: "123", linkedPageId: "456", accessToken: "mock", tokenType: "USER", scopes: account.scopes})};
  return {args, records, count: () => creates, setReady: v => ready = v, deny: () => denied = true, lose: v => lose = v};
}
test("Story descriptor uses Facebook Login STORIES container, no caption/sticker/feed request", () => {
  const f = fixture(), d = describe(f.args);
  assert.equal(d.create.body.media_type, "STORIES"); assert.equal(d.create.body.caption, undefined);
  assert.equal(d.maximumEffects.createRequests, 2);
  for (const change of [{type: "CREATOR"}, {login: "instagram"}, {scopes: []}, {id: "999"}]) assert.throws(() => describe({...f.args, account: {...f.args.account, ...change}}));
  assert.throws(() => describe({...f.args, job: {...f.args.job, surface: "feed"}}));
});
test("one container and one publish persist exactly once under replay and concurrency", async () => {
  const f = fixture(), runtime = createTransport(f.args);
  await Promise.allSettled([runtime.run(), runtime.run()]);
  const receipt = await runtime.run(); assert.equal(receipt.state, "PUBLISHED"); assert.equal(f.count(), 2);
  assert.ok([...f.records.keys()].every(k => k.startsWith("socialStoryJobs/")));
  assert.deepEqual(await runtime.run(), receipt); assert.equal(f.count(), 2);
});
test("delayed container reuses known ID and never creates a replacement", async () => {
  const f = fixture(); f.setReady(false); const runtime = createTransport(f.args);
  assert.equal((await runtime.run()).state, "WAITING_FOR_CONTAINER"); assert.equal(f.count(), 1);
  f.setReady(true); assert.equal((await runtime.run()).state, "PUBLISHED"); assert.equal(f.count(), 2);
});
test("lost container and lost final publish responses HOLD without a second POST", async () => {
  for (const key of ["container", "publish"]) {
    const f = fixture(); f.lose(key); const runtime = createTransport(f.args);
    await assert.rejects(runtime.run()); const count = f.count();
    assert.equal((await runtime.run()).state, "HOLD_UNKNOWN_OUTCOME"); assert.equal(f.count(), count);
  }
});
test("disabled deployment, pause, future schedule and read-only reconciliation cannot create", async () => {
  const f = fixture(); await assert.rejects(createTransport({...f.args, deploymentEnabled: false}).run());
  await assert.rejects(createTransport({...f.args, now: () => 0}).run());
  assert.equal((await createTransport(f.args).run({reconcileOnly: true})).state, "HOLD_READ_ONLY");
  f.deny(); await assert.rejects(createTransport(f.args).run()); assert.equal(f.count(), 0);
});
test("wrong credential identity and changed media fail before provider POST", async () => {
  const f = fixture();
  await assert.rejects(createTransport({...f.args, credentials: async () => ({owner: "other"})}).run()); assert.equal(f.count(), 0);
  assert.throws(() => createTransport({...f.args, revision: {...f.args.revision, sha256: "b".repeat(64)}}));
});
test("independent Story authority rejects feed approvals, pause and immutable changes", async () => {
  const f = fixture(), approvalId = `story_approval_${"b".repeat(64)}`;
  const plan = model.week({surface: "story", owner: "owner", provider: "instagram", accountId: "123",
    startsAt: "2030-01-01T00:00:00Z", endsAt: "2030-01-08T00:00:00Z", timeZone: "America/New_York",
    items: ["product_authority", "business_value", "two_sided_model"].map((pillar,i) => ({surface: "story", contentId: `s${i}`,
      version: 1, text: `Story ${i}`, pillar, media: f.args.revision, scheduledFor: "2030-01-02T00:00:00Z", ctaBehavior: "link_in_bio_text"}))});
  const jobs = model.draftJobs(plan), job = {...jobs[0], approvalId, status: "approved"};
  const approval = {schemaVersion: "StoryApprovalV1", surface: "story", owner: "owner", provider: "instagram", accountId: "123",
    planId: plan.id, planDigest: plan.digest, jobIds: jobs.map(j => j.id)};
  const health = {killSwitchActive: false};
  const allowance = {surface: "story", owner: "owner", provider: "instagram", approvalId, planDigest: plan.digest,
    publishingEnabled: true, killSwitchActive: false, jobIds: jobs.map(j => j.id)};
  const docs = {[`socialStoryJobs/${job.id}`]: job, [`socialStoryApprovals/${approvalId}`]: approval,
    [`socialStoryPlans/${plan.id}`]: plan, [`socialStoryMediaRevisions/${job.mediaRevisionId}`]: f.args.revision,
    "agentHealth/owner": health, "socialStoryAuthorities/owner/providers/instagram": allowance,
    "socialConnections/owner/providers/instagram": {providerUserId: "123", linkedPageId: "456", tokenHealth: "healthy",
      environment: "production", grantedScopes: f.args.account.scopes}};
  const db = {doc: p => ({get: async () => ({data: () => docs[p]})})};
  const auth = require("./social_instagram_story_transport").createAuthority({db, plan, account: f.args.account});
  await auth(null, job, "create");
  approval.surface = "feed"; await assert.rejects(auth(null, job, "create")); approval.surface = "story";
  health.killSwitchActive = true; await assert.rejects(auth(null, job, "create")); health.killSwitchActive = false;
  allowance.killSwitchActive = true; await assert.rejects(auth(null, job, "create")); allowance.killSwitchActive = false;
  await assert.rejects(auth(null, {...job, mediaHash: "wrong"}, "create"));
});

test('quota exhaustion and unknown quota never publish; undocumented credential role fails closed',async()=>{
 for(const data of [{data:[{quota_usage:50,config:{quota_total:50,quota_duration:86400}}]},{data:[]}]){
  const f=fixture(),original=f.args.fetchImpl;f.args.fetchImpl=(u,o)=>u.includes('/content_publishing_limit?')?Promise.resolve(Response.json(data)):original(u,o);
  assert.match((await createTransport(f.args).run()).state,/HOLD_/);assert.equal(f.count(),1);
  assert.match((await createTransport(f.args).run()).state,/HOLD_/);assert.equal(f.count(),1);
 }
 const f=fixture();delete f.args.account.roleOrigin;await assert.rejects(createTransport(f.args).run(),/role_permission_unverified/);assert.equal(f.count(),0);
});
