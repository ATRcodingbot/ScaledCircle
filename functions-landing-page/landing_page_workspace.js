"use strict";

const PAGE_SIZE = 20;
const PAGE_ID = /^[A-Za-z0-9_-]{1,160}$/;

function encodeCursor({createdAtMillis, pageId}) {
  if (!Number.isSafeInteger(createdAtMillis) || createdAtMillis < 0 || !PAGE_ID.test(pageId)) {
    throw new Error("landing_page_cursor_invalid");
  }
  return Buffer.from(JSON.stringify({createdAtMillis, pageId}), "utf8").toString("base64url");
}

function decodeCursor(value) {
  try {
    const decoded = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!Number.isSafeInteger(decoded?.createdAtMillis) || decoded.createdAtMillis < 0 ||
        typeof decoded?.pageId !== "string" || !PAGE_ID.test(decoded.pageId)) {
      throw new Error("invalid");
    }
    return {createdAtMillis: decoded.createdAtMillis, pageId: decoded.pageId};
  } catch (_) {
    throw new Error("landing_page_cursor_invalid");
  }
}

async function exactInquiryCount(db, ownerUid, pageId) {
  if (!ownerUid || !PAGE_ID.test(pageId)) throw new Error("landing_page_count_scope_invalid");
  const snapshot = await db.collection("salesLeads").where("ownerUid", "==", ownerUid)
    .where("attribution.landingPageId", "==", pageId).count().get();
  return snapshot.data().count;
}

module.exports = {PAGE_SIZE, encodeCursor, decodeCursor, exactInquiryCount};
