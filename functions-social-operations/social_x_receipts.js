"use strict";

// Provider-specific normalization, independent of any tenant, post or Founder.
// Missing URL/media evidence is a mismatch, never permission to create again.
function matchingText({post, approvedText, expectedHandle}) {
  if (typeof post?.text !== "string" || typeof approvedText !== "string" || !approvedText ||
      !/^[A-Za-z0-9_]{1,15}$/.test(expectedHandle || "") || !/^\d{1,20}$/.test(post.id || "")) return false;
  let expanded = post.text;
  const seen = new Set();
  for (const entity of post.entities?.urls || []) {
    if (!/^https:\/\/t\.co\/[A-Za-z0-9]+$/.test(entity.url || "")) return false;
    if (seen.has(entity.url)) return false;
    seen.add(entity.url);
    const destination = entity.expanded_url;
    if (typeof destination !== "string") return false;
    const photo = new RegExp(`^https://(?:x|twitter)\\.com/${expectedHandle}/status/${post.id}/photo/[1-4]$`, "i");
    if (photo.test(destination)) {
      // A provider-generated photo link is only removable at the text's end.
      if (!expanded.endsWith(entity.url)) return false;
      expanded = expanded.slice(0, -entity.url.length).trimEnd();
    } else {
      // Expansion must reproduce the exact approved destination, including its
      // query. No t.co-shaped wildcard or unrelated redirect is accepted.
      if (!approvedText.includes(destination) || !expanded.includes(entity.url)) return false;
      expanded = expanded.split(entity.url).join(destination);
    }
  }
  return expanded === approvedText;
}

function verify({post, expectedUserId, expectedHandle, approvedText, mediaKeys = [], startedAt, endedAt}) {
  if (!post || String(post.author_id) !== String(expectedUserId) || !expectedUserId ||
      !matchingText({post, approvedText, expectedHandle})) throw new Error("x_growth_receipt_mismatch");
  const actualKeys = post.attachments?.media_keys || [];
  if (!Array.isArray(actualKeys) || JSON.stringify([...actualKeys].sort()) !== JSON.stringify([...mediaKeys].sort())) {
    throw new Error("x_growth_media_mismatch");
  }
  const time = Date.parse(post.created_at), start = Date.parse(startedAt), end = Date.parse(endedAt);
  if (![time, start, end].every(Number.isFinite) || time < start || time > end || start > end) {
    throw new Error("x_growth_receipt_window_mismatch");
  }
  return {providerPostId: post.id, providerPostUrl: `https://x.com/${expectedHandle}/status/${post.id}`,
    createdAt: post.created_at, evidence: "provider_exact_identity_text_media_window"};
}

function reconcile({posts, hasMore, ...expected}) {
  if (hasMore !== false || !Array.isArray(posts)) throw new Error("x_growth_reconciliation_incomplete");
  const matches = [];
  for (const post of posts) {
    try { matches.push(verify({post, ...expected})); } catch (_) { /* Unrelated posts are not receipts. */ }
  }
  if (matches.length > 1) throw new Error("x_growth_duplicate_matches");
  return matches[0] || null;
}

module.exports = {matchingText, verify, reconcile};
