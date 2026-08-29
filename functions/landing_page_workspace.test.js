"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const workspace = require("./landing_page_workspace");

function page(id, createdAtMillis) { return {pageId: id, createdAtMillis}; }
function compare(a, b) { return b.createdAtMillis - a.createdAtMillis || b.pageId.localeCompare(a.pageId); }
function paginate(records, cursorValue) {
  const sorted = [...records].sort(compare);
  const cursor = cursorValue ? workspace.decodeCursor(cursorValue) : null;
  const start = cursor ? sorted.findIndex((item) =>
    item.createdAtMillis < cursor.createdAtMillis ||
    (item.createdAtMillis === cursor.createdAtMillis && item.pageId.localeCompare(cursor.pageId) < 0)) : 0;
  const safeStart = cursor ? Math.max(0, start) : 0;
  const visible = sorted.slice(safeStart, safeStart + workspace.PAGE_SIZE);
  const hasMore = sorted.length > safeStart + workspace.PAGE_SIZE;
  const last = visible.at(-1);
  return {visible, hasMore, nextCursor: hasMore ? workspace.encodeCursor(last) : null};
}

test("21 pages remain discoverable through a deterministic continuation", () => {
  const records = Array.from({length: 21}, (_, index) => page(`page_${String(index + 1).padStart(2, "0")}`, 1000 - index));
  const first = paginate(records);
  const second = paginate(records, first.nextCursor);
  assert.equal(first.visible.length, 20);
  assert.equal(first.hasMore, true);
  assert.equal(second.visible.length, 1);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.visible, ...second.visible].map((item) => item.pageId)).size, 21);
});

test("45 pages paginate 20 + 20 + 5 without gaps or duplicates", () => {
  const records = Array.from({length: 45}, (_, index) => page(`page_${String(index + 1).padStart(2, "0")}`, 2000 - Math.floor(index / 3)));
  const batches = [];
  let cursor = null;
  do {
    const batch = paginate(records, cursor);
    batches.push(batch);
    cursor = batch.nextCursor;
  } while (cursor);
  assert.deepEqual(batches.map((batch) => batch.visible.length), [20, 20, 5]);
  const ids = batches.flatMap((batch) => batch.visible.map((item) => item.pageId));
  assert.equal(new Set(ids).size, 45);
  assert.deepEqual(ids, [...records].sort(compare).map((item) => item.pageId));
});

test("cursor contains timestamp and document tie-breaker and rejects malformed input", () => {
  const encoded = workspace.encodeCursor(page("page_tie", 1234));
  assert.deepEqual(workspace.decodeCursor(encoded), {createdAtMillis: 1234, pageId: "page_tie"});
  assert.throws(() => workspace.decodeCursor("not-a-cursor"), /landing_page_cursor_invalid/);
  assert.throws(() => workspace.encodeCursor(page("bad/page", 1234)), /landing_page_cursor_invalid/);
});

test("exact inquiry count is tenant and page scoped and is not capped at 50", async () => {
  const clauses = [];
  const query = {
    where(field, operation, value) { clauses.push([field, operation, value]); return this; },
    count() { return this; },
    async get() { return {data: () => ({count: 61})}; },
  };
  const db = {collection(name) { assert.equal(name, "salesLeads"); return query; }};
  assert.equal(await workspace.exactInquiryCount(db, "business-a", "page_a"), 61);
  assert.deepEqual(clauses, [
    ["ownerUid", "==", "business-a"],
    ["attribution.landingPageId", "==", "page_a"],
  ]);
});

test("exact inquiry counts remain independent across pages", async () => {
  const totals = new Map([["page_a", 3], ["page_b", 61], ["page_c", 0]]);
  const db = {collection() { let selected; return {
    where(field, _operation, value) { if (field === "attribution.landingPageId") selected = value; return this; },
    count() { return this; }, async get() { return {data: () => ({count: totals.get(selected)})}; },
  }; }};
  assert.deepEqual(await Promise.all([...totals.keys()].map((id) =>
    workspace.exactInquiryCount(db, "business-a", id))), [3, 61, 0]);
});
