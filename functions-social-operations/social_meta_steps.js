"use strict";

// Transport-independent execution candidate. Not exported or scheduled in any
// deployed runtime. Live integration must supply transactional job authority and
// provider identity/status verification; request descriptions are not approval.
const {hash} = require("./social_growth_cycle");
const {prepare} = require("./social_meta_candidate");
const {descriptor, executeStep} = require("./social_provider_steps");

async function execute({job, revision, account, approval, store, adapter}) {
  const plan = prepare({job, revision, account, approval});
  for (const method of ["create", "reconcile", "verify"]) {
    if (typeof adapter?.[method] !== "function") throw new Error("meta_adapter_required");
  }
  async function step(key, kind, request) {
    const binding = descriptor(job, {key, kind, requestHash: hash({account: {
      businessUid: account.businessUid, providerUserId: account.providerUserId,
      linkedPageId: account.linkedPageId || null}, request})});
    return executeStep({store, step: binding,
      create: () => adapter.create({kind, request, account}),
      reconcile: record => adapter.reconcile({kind, request, account, record}),
      verify: receipt => adapter.verify({kind, request, account, receipt})});
  }
  if (plan.request) return step("post", plan.request.path.endsWith("/feed") ? "text" : "photo", plan.request);
  let container;
  if (plan.container) {
    const result = await step("image", "child", plan.container);
    if (result.status !== "received") return result;
    container = result.receipt.id;
  } else {
    const children = [];
    for (const [index, request] of plan.children.entries()) {
      const result = await step(`child:${index}`, "child", request);
      if (result.status !== "received") return result;
      children.push(result.receipt.id);
    }
    const result = await step("parent", "parent", {method: "POST", path: plan.parent.path,
      body: {media_type: "CAROUSEL", caption: plan.parent.caption, children}});
    if (result.status !== "received") return result;
    container = result.receipt.id;
  }
  return step("publish", "publish", {method: "POST", path: plan.publish.path, body: {creation_id: container}});
}
module.exports = {execute};
