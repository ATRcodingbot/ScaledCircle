#!/usr/bin/env node
"use strict";

const readline = require("node:readline/promises");
const process = require("node:process");
const {normalizeWaitlistEmail, waitlistResetPaths} = require("../functions/waitlist_identity");

const PRODUCTION_PROJECT_ID = "scaled-circle";
const DEFAULT_PROJECT_ID = "demo-scaledcircle";

function parseArguments(argv) {
  const options = {email: "", role: "", projectId: DEFAULT_PROJECT_ID, production: false, execute: false, confirmEmail: ""};
  const values = [...argv];
  if (values[0] && !values[0].startsWith("--")) options.email = values.shift();
  while (values.length) {
    const flag = values.shift();
    if (flag === "--role") options.role = values.shift() || "";
    else if (flag === "--project") options.projectId = values.shift() || "";
    else if (flag === "--confirm-email") options.confirmEmail = values.shift() || "";
    else if (flag === "--production") options.production = true;
    else if (flag === "--execute") options.execute = true;
    else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  return options;
}

function buildResetPlan(options) {
  const normalizedEmail = normalizeWaitlistEmail(options.email);
  if (!normalizedEmail) throw new Error("A test subscriber email is required.");
  const paths = waitlistResetPaths({role: options.role, email: normalizedEmail});
  const productionTarget = options.projectId === PRODUCTION_PROJECT_ID;
  if (options.production !== productionTarget) throw new Error(productionTarget ? "The scaled-circle project requires --production." : "--production may target only scaled-circle.");
  if (productionTarget && normalizeWaitlistEmail(options.confirmEmail) !== normalizedEmail) throw new Error("Production requires --confirm-email matching the test email.");
  if (!productionTarget && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Non-production reset requires FIRESTORE_EMULATOR_HOST.");
  return Object.freeze({projectId: options.projectId, normalizedEmail, role: options.role.trim().toLowerCase(), paths, execute: options.execute === true, production: productionTarget});
}

async function executeResetPlan(plan, {db, input = process.stdin, output = process.stdout}) {
  output.write(`Project: ${plan.projectId}\nSubscriber: ${plan.normalizedEmail} (${plan.role})\nExact documents in this reset plan:\n`);
  for (const path of plan.paths) output.write(`  - ${path}\n`);
  if (!plan.execute) {
    output.write("DRY RUN: no documents were deleted.\n");
    return {deleted: 0, dryRun: true};
  }
  const prompt = readline.createInterface({input, output});
  const expected = `DELETE ${plan.normalizedEmail}`;
  const answer = await prompt.question(`Type '${expected}' to delete only these documents: `);
  prompt.close();
  if (answer !== expected) throw new Error("Confirmation did not match; nothing was deleted.");
  const batch = db.batch();
  for (const path of plan.paths) batch.delete(db.doc(path));
  await batch.commit();
  output.write(`Deleted ${plan.paths.length} exact document paths.\n`);
  return {deleted: plan.paths.length, dryRun: false};
}

async function main() {
  const plan = buildResetPlan(parseArguments(process.argv.slice(2)));
  if (!plan.execute) {
    await executeResetPlan(plan, {db: null});
    return;
  }
  const {initializeApp} = require("../functions/node_modules/firebase-admin/app");
  const {getFirestore} = require("../functions/node_modules/firebase-admin/firestore");
  initializeApp({projectId: plan.projectId});
  await executeResetPlan(plan, {db: getFirestore()});
}

if (require.main === module) main().catch((error) => { console.error(`Reset refused: ${error.message}`); process.exitCode = 1; });

module.exports = {PRODUCTION_PROJECT_ID, DEFAULT_PROJECT_ID, parseArguments, buildResetPlan, executeResetPlan};
