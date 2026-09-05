"use strict";

const receipts = require("./social_x_receipts");

// The initial normal transport certifies plain-text posts. Media is rejected,
// rather than silently dropped or uploaded outside the approved operation.
function approvedText(job) {
  const variants = job?.binding?.variants;
  if (job?.provider !== "x" || !Array.isArray(variants)) throw new Error("x_publish_binding_invalid");
  const variant = variants.find((item) => item.provider === "x");
  if (!variant || variant.mediaAssetId || variant.mediaRevisionId || variant.mediaRequirement) {
    throw new Error("x_publish_media_not_certified");
  }
  const text = variant.copy;
  // Conservative ASCII support avoids undercounting weighted Unicode/emoji.
  // Broader formats need their own length and immutable-media certification.
  if (typeof text !== "string" || !text.trim() || text !== text.trim() ||
      /[^\x20-\x7E\n]/.test(text) || text.length > 280) throw new Error("x_publish_text_invalid");
  return text;
}

function createAdapter({credentials, fetchImpl = globalThis.fetch, now = Date.now}) {
  const sessions = new Map();
  async function request(session, path, options = {}) {
    const response = await fetchImpl(`https://api.x.com/2/${path}`, {
      ...options, redirect: "error", signal: AbortSignal.timeout(20000),
      headers: {Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json"},
    });
    if (!response.ok) throw new Error("x_publish_provider_response_unavailable");
    const body = await response.json();
    if (body.errors?.length) throw new Error("x_publish_provider_response_incomplete");
    return body;
  }
  async function session(job) {
    if (!sessions.has(job.id)) {
      const value = await credentials(job);
      if (!value?.accessToken || !/^\d{1,20}$/.test(value.providerUserId || "") ||
          !/^[A-Za-z0-9_]{1,15}$/.test(value.handle || "")) throw new Error("x_publish_identity_invalid");
      const identity = await request(value, "users/me?user.fields=id,username");
      if (identity.data?.id !== value.providerUserId || identity.data?.username !== value.handle) {
        throw new Error("x_publish_identity_mismatch");
      }
      sessions.set(job.id, value);
    }
    return sessions.get(job.id);
  }
  function expected(job, value) {
    if (job.sendStarted !== true || !Number.isFinite(job.sendStartedAt)) throw new Error("x_publish_send_window_missing");
    return {expectedUserId: value.providerUserId, expectedHandle: value.handle,
      approvedText: approvedText(job), mediaKeys: [],
      startedAt: new Date(job.sendStartedAt - 1000).toISOString(),
      endedAt: new Date(job.sendStartedAt + 120000).toISOString()};
  }
  async function verifyReceipt(job, receipt) {
    const value = await session(job);
    if (!/^\d{1,20}$/.test(receipt?.providerPostId || "")) throw new Error("x_publish_receipt_missing");
    const body = await request(value, `tweets/${receipt.providerPostId}?tweet.fields=author_id,created_at,entities,attachments`);
    const verified = receipts.verify({post: body.data, ...expected(job, value)});
    if (verified.providerPostUrl !== receipt.providerPostUrl || receipt.contentHash !== job.binding.contentHash) {
      throw new Error("x_publish_receipt_mismatch");
    }
  }
  return {
    async verifyApprovedAssets(job) { approvedText(job); await session(job); },
    async create(job) {
      const value = await session(job);
      expected(job, value);
      // No retry loop. Any error after the durable send claim is indeterminate.
      const body = await request(value, "tweets", {method: "POST", body: JSON.stringify({text: approvedText(job)})});
      if (!/^\d{1,20}$/.test(body.data?.id || "")) throw new Error("x_publish_receipt_missing");
      return {providerPostId: body.data.id,
        providerPostUrl: `https://x.com/${value.handle}/status/${body.data.id}`,
        contentHash: job.binding.contentHash};
    },
    verifyReceipt,
    async reconcile(job) {
      const value = await session(job), criteria = expected(job, value);
      const query = new URLSearchParams({max_results: "100", start_time: criteria.startedAt,
        end_time: new Date(Math.min(now(), Date.parse(criteria.endedAt))).toISOString(),
        "tweet.fields": "author_id,created_at,entities,attachments"});
      const body = await request(value, `users/${value.providerUserId}/tweets?${query}`);
      const receipt = receipts.reconcile({posts: body.data || [], hasMore: Boolean(body.meta?.next_token), ...criteria});
      return receipt ? {...receipt, contentHash: job.binding.contentHash} : null;
    },
  };
}

module.exports = {approvedText, createAdapter};
