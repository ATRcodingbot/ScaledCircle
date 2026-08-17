"use strict";

const VERSION = "MarketplaceWorkTypeV1";

// This is the single server-authoritative marketplace work taxonomy. Flutter
// receives the selectable projection through getMarketplaceWorkTypes; it does
// not maintain an independent list.
const TYPES = Object.freeze([
  {id: "flyer_distribution", customerLabel: "Flyer Distribution", description: "Distribute printed flyers inside a mapped campaign area.", businessPostable: true, scalerSelectable: true, requiresVehicle: false, supportsCrew: true, requiresOutreachConsent: false, category: "distribution", legacyAliases: []},
  {id: "door_hanger_distribution", customerLabel: "Door Hanger / Material Distribution", description: "Distribute door hangers or other approved materials without sales outreach.", businessPostable: true, scalerSelectable: true, requiresVehicle: false, supportsCrew: true, requiresOutreachConsent: false, category: "distribution", legacyAliases: ["door_hangers", "door_hanger", "material_distribution"]},
  {id: "business_card_distribution", customerLabel: "Business Card Distribution", description: "Distribute approved Business cards in a mapped area.", businessPostable: true, scalerSelectable: true, requiresVehicle: false, supportsCrew: true, requiresOutreachConsent: false, category: "distribution", legacyAliases: []},
  {id: "material_pickup", customerLabel: "Material Pickup", description: "Pick up campaign materials for an assigned field job.", businessPostable: false, scalerSelectable: true, requiresVehicle: true, supportsCrew: false, requiresOutreachConsent: false, category: "logistics", legacyAliases: []},
  {id: "dump_run", customerLabel: "Dump Runs", description: "Move approved debris or materials to a reviewed disposal destination.", businessPostable: true, scalerSelectable: true, requiresVehicle: true, supportsCrew: false, requiresOutreachConsent: false, category: "hauling", legacyAliases: ["dump_runs"]},
  {id: "yard_cleanup", customerLabel: "Yard / Cleanup Work", description: "Complete the currently supported local yard-cleanup workflow.", businessPostable: true, scalerSelectable: true, requiresVehicle: false, supportsCrew: false, requiresOutreachConsent: false, category: "local_labor", legacyAliases: ["Yard Cleanup", "yard_cleanup_work"]},
  {id: "yard_sign_installation", customerLabel: "Yard Sign Installation", description: "Install approved campaign signs in an assigned area.", businessPostable: true, scalerSelectable: true, requiresVehicle: true, supportsCrew: true, requiresOutreachConsent: false, category: "distribution", legacyAliases: []},
  {id: "door_to_door_outreach", customerLabel: "Door-to-Door Outreach", description: "Optional person-to-person outreach requiring explicit Business selection and Scaler consent.", businessPostable: false, scalerSelectable: false, requiresVehicle: false, supportsCrew: false, requiresOutreachConsent: true, category: "outreach", legacyAliases: ["door_to_door", "Neighborhood Canvassing", "neighborhood_canvassing"]},
  {id: "junk_removal", customerLabel: "Junk Removal", description: "Reserved until the Business posting workflow captures the required job details.", businessPostable: false, scalerSelectable: false, requiresVehicle: true, supportsCrew: false, requiresOutreachConsent: false, category: "hauling", legacyAliases: ["junkRemoval", "Junk Removal"]},
  {id: "hauling_material_transport", customerLabel: "Hauling / Material Transport", description: "Reserved until a dedicated Business posting and capability contract is reviewed.", businessPostable: false, scalerSelectable: false, requiresVehicle: true, supportsCrew: false, requiresOutreachConsent: false, category: "hauling", legacyAliases: ["hauling"]},
  {id: "general_local_labor", customerLabel: "General Local Labor", description: "Reserved until a bounded Business posting workflow is reviewed.", businessPostable: false, scalerSelectable: false, requiresVehicle: false, supportsCrew: false, requiresOutreachConsent: false, category: "local_labor", legacyAliases: ["short_local"]},
  {id: "event_marketing", customerLabel: "Event Marketing", description: "Reserved legacy campaign type; not selectable for new marketplace matching.", businessPostable: false, scalerSelectable: false, requiresVehicle: false, supportsCrew: true, requiresOutreachConsent: false, category: "marketing", legacyAliases: []},
]);

function normalized(value) { return String(value || "").trim().toLowerCase(); }
const byAlias = new Map();
for (const type of TYPES) {
  for (const value of [type.id, ...type.legacyAliases]) byAlias.set(normalized(value), type);
}
function resolve(value) { return byAlias.get(normalized(value)) || null; }
function canonicalId(value) { return resolve(value)?.id || null; }
function publicProjection() { return {version: VERSION, workTypes: TYPES.map((type) => ({...type}))}; }

module.exports = {VERSION, TYPES, resolve, canonicalId, publicProjection};
