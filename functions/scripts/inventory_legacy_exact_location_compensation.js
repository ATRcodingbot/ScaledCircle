"use strict";

const {execFileSync} = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");
const migration = require("../exact_location_compensation_migration");

const ALLOWED_PROJECTS = new Set(["scaledcircle-staging", "scaled-circle"]);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function decode(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("geoPointValue" in value) return "[REDACTED_GEOPOINT]";
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(
    Object.entries(value.mapValue.fields || {}).map(([key, field]) => [key, decode(field)]),
  );
  return null;
}

function document(row) {
  if (!row?.document) return null;
  return {
    id: row.document.name.split("/").pop(),
    path: row.document.name.split("/documents/")[1],
    ...Object.fromEntries(Object.entries(row.document.fields || {})
      .map(([key, value]) => [key, decode(value)])),
  };
}

async function query(projectId, collectionId, allDescendants = false) {
  const windowsGcloud = path.join(process.env.LOCALAPPDATA || "", "Google", "Cloud SDK",
    "google-cloud-sdk", "bin", "gcloud.ps1");
  const command = process.platform === "win32" ? "powershell.exe" : "gcloud";
  const args = process.platform === "win32" ?
    ["-NoProfile", "-File", windowsGcloud, "auth", "print-access-token"] :
    ["auth", "print-access-token"];
  const token = execFileSync(command, args, {
    encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!token) throw new Error("gcloud_access_credential_unavailable");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const response = await fetch(url, {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
    body: JSON.stringify({structuredQuery: {
      from: [{collectionId, allDescendants}],
      limit: 10000,
    }}),
  });
  if (!response.ok) throw new Error(`firestore_read_failed_${collectionId}_${response.status}`);
  return (await response.json()).map(document).filter(Boolean);
}

function hashRef(campaignId, scalerId) {
  return crypto.createHash("sha256").update(`${campaignId}\n${scalerId}`).digest("hex").slice(0, 16);
}

async function main() {
  const projectId = argument("--project");
  if (!ALLOWED_PROJECTS.has(projectId)) throw new Error("inventory_project_not_allowlisted");
  const [locations, campaigns, contracts, completions, applications, transfers,
    walletTransactions, payments] = await Promise.all([
    query(projectId, "campaignLocations"), query(projectId, "campaigns"),
    query(projectId, "assignmentCompensations"), query(projectId, "campaignCompletions"),
    query(projectId, "applications", true), query(projectId, "scalerTransfers"),
    query(projectId, "walletTransactions"), query(projectId, "campaignPayments"),
  ]);
  const campaignById = new Map(campaigns.map((item) => [item.id, item]));
  const applicationByPath = new Map(applications.map((item) => [item.path, item]));
  const groups = new Map();
  for (const location of locations) {
    if (!location.campaignId || !location.businessId || !location.assignedScalerId) continue;
    const key = `${location.campaignId}\n${location.assignedScalerId}`;
    if (!groups.has(key)) groups.set(key, {
      campaignId: location.campaignId, businessId: location.businessId,
      scalerId: location.assignedScalerId, applicationId: location.assignedApplicationId,
      assignedAt: location.assignedAt, locationIds: [], states: [],
    });
    groups.get(key).locationIds.push(location.id);
    groups.get(key).states.push(String(location.status || "unknown"));
  }
  const results = [];
  for (const assignment of groups.values()) {
    const applicationPath = assignment.applicationId ?
      `campaigns/${assignment.campaignId}/applications/${assignment.applicationId}` : "";
    const application = applicationByPath.get(applicationPath) || {};
    const matchingContracts = contracts.filter((contract) =>
      contract.campaignId === assignment.campaignId && contract.scalerId === assignment.scalerId);
    const matchingCompletions = completions.filter((completion) =>
      completion.campaignId === assignment.campaignId && completion.scalerId === assignment.scalerId);
    const matchingTransfers = transfers.filter((transfer) =>
      transfer.campaignId === assignment.campaignId && transfer.scalerId === assignment.scalerId);
    const matchingWallet = walletTransactions.filter((entry) =>
      entry.campaignId === assignment.campaignId && entry.scalerId === assignment.scalerId);
    const funding = payments.filter((payment) => payment.campaignId === assignment.campaignId);
    const classification = migration.classifyLegacyAssignment({
      assignment, application, existingContract: matchingContracts[0] || null,
      earningCount: matchingTransfers.length, walletEffectCount: matchingWallet.length,
    });
    if (!classification.affected) continue;
    const completed = assignment.states.some((state) => ["completed", "approved"].includes(state)) ||
      matchingCompletions.some((item) => ["approved", "completed"].includes(item.status));
    results.push({
      ref: hashRef(assignment.campaignId, assignment.scalerId),
      campaignId: assignment.campaignId,
      category: classification.category,
      reason: classification.reason,
      state: completed ? "completed" : "incomplete",
      locationStates: assignment.states,
      earningExists: matchingTransfers.length > 0,
      walletEffectExists: matchingWallet.length > 0,
      acceptedAssignmentEconomics: Boolean(application.acceptedCompensation),
      fundingEvidence: funding.some((item) => item.status === "funded"),
      currentMutableCampaignCompensation: Number.isFinite(campaignById.get(assignment.campaignId)?.basePay),
      deterministicEvidence: classification.category === migration.CATEGORIES.migratable,
    });
  }
  const count = (predicate) => results.filter(predicate).length;
  const stateBreakdown = {};
  for (const result of results) stateBreakdown[result.state] = (stateBreakdown[result.state] || 0) + 1;
  const categoryCounts = Object.fromEntries(Object.values(migration.CATEGORIES)
    .map((category) => [category, count((item) => item.category === category)]));
  const reviewPacket = results.filter((item) => item.category === migration.CATEGORIES.review)
    .map((item) => ({assignmentRef: item.ref, knownEvidence: {
      acceptedAssignment: true, funding: item.fundingEvidence,
      currentCampaignCompensationOnly: item.currentMutableCampaignCompensation,
    }, missingEvidence: ["immutable accepted base/bonus/currency authority"],
    proposedOptions: ["Business attestation plus Scaler acknowledgment", "remain non-payable"],
    auditRequired: true}));
  console.log(JSON.stringify({
    projectId,
    affectedAssignments: results.length,
    affectedCampaigns: new Set(results.map((item) => item.campaignId)).size,
    stateBreakdown,
    completed: count((item) => item.state === "completed"),
    incomplete: count((item) => item.state === "incomplete"),
    withEarning: count((item) => item.earningExists),
    withWalletEffect: count((item) => item.walletEffectExists),
    withAcceptedAssignmentEconomics: count((item) => item.acceptedAssignmentEconomics),
    withFundingEvidence: count((item) => item.fundingEvidence),
    currentMutableCompensationOnly: count((item) =>
      item.currentMutableCampaignCompensation && !item.acceptedAssignmentEconomics),
    deterministicEvidenceSufficient: count((item) => item.deterministicEvidence),
    categories: categoryCounts,
    reviewPacket,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({error: String(error.message || error)}));
  process.exitCode = 1;
});
