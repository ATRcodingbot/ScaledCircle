"use strict";
// Server-owned job type, never a caller-selected photo exemption.
function prohibitsResidentialPhotos(campaign) {
  const value = String(campaign?.campaignType || campaign?.type || "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
  return new Set(["neighborhoodcanvassing", "canvassing", "flyerdistribution",
    "flyer", "doorhanger", "doorhangers", "doorhangerdistribution"]).has(value);
}
module.exports = {prohibitsResidentialPhotos};
