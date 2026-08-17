"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const taxonomy = require("./marketplace_work_types");

test("MarketplaceWorkTypeV1 has unique canonical IDs and required fields", () => {
  assert.equal(taxonomy.VERSION, "MarketplaceWorkTypeV1");
  assert.equal(new Set(taxonomy.TYPES.map((type) => type.id)).size, taxonomy.TYPES.length);
  for (const type of taxonomy.TYPES) {
    for (const key of ["id", "customerLabel", "description", "businessPostable",
      "scalerSelectable", "requiresVehicle", "supportsCrew", "requiresOutreachConsent",
      "category", "legacyAliases"]) assert.notEqual(type[key], undefined);
  }
});
test("legacy aliases map deterministically", () => {
  assert.equal(taxonomy.canonicalId("door_hangers"), "door_hanger_distribution");
  assert.equal(taxonomy.canonicalId("door_hanger_distribution"), "door_hanger_distribution");
  assert.equal(taxonomy.canonicalId("dump_runs"), "dump_run");
  assert.equal(taxonomy.canonicalId("junkRemoval"), "junk_removal");
  assert.equal(taxonomy.canonicalId("unknown"), null);
});
test("unsupported hauling concepts remain disabled until Business posting exists", () => {
  for (const id of ["junk_removal", "hauling_material_transport", "general_local_labor"])
    assert.equal(taxonomy.resolve(id).businessPostable, false);
  assert.equal(taxonomy.resolve("door_to_door_outreach").requiresOutreachConsent, true);
});
