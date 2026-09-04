"use strict";

const {spawnSync} = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCache = path.join(root, "tmp", "npm-cache");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: {...process.env, npm_config_cache: npmCache},
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function runNpmCi(cwd, nativeInstall = false) {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c",
      nativeInstall ? "npm.cmd ci" : "npm.cmd ci --ignore-scripts"], cwd);
    return;
  }
  run(npmCommand, nativeInstall ? ["ci"] : ["ci", "--ignore-scripts"], cwd);
}

function prunePackageLock(cwd) {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "npm.cmd install --package-lock-only --ignore-scripts"], cwd);
    return;
  }
  run(npmCommand, ["install", "--package-lock-only", "--ignore-scripts"], cwd);
}

run(process.execPath, [path.join(__dirname, "generate_functions_codebases.js")], root);

for (const directory of [
  "functions-platform", "functions-legacy", "functions-wallet", "functions-artifact-email", "functions-job-alert-email",
  "functions-campaign-funding",
  "functions-assignment",
  "functions-discovery",
  "functions-job-room",
  "functions-completion",
  "functions-transactional-email",
  "functions-admin-ops",
  "functions-sales",
  "functions-legal",
  "functions-application",
  "functions-attribution",
  "functions-landing-page",
  "functions-creative-media",
  "functions-physical-marketing",
  "functions-business-profile",
]) {
  if (["functions-wallet", "functions-artifact-email", "functions-job-alert-email",
    "functions-campaign-funding", "functions-assignment", "functions-discovery",
    "functions-job-room",
    "functions-completion",
    "functions-transactional-email", "functions-admin-ops", "functions-sales",
    "functions-legal", "functions-application", "functions-attribution",
    "functions-landing-page", "functions-creative-media",
    "functions-physical-marketing", "functions-business-profile"].includes(directory)) {
    prunePackageLock(path.join(root, directory));
  }
  runNpmCi(path.join(root, directory),
    ["functions-creative-media", "functions-physical-marketing"].includes(directory));
}

run(process.execPath, [path.join(__dirname, "verify_generated_codebases.js")], root);
console.log("Prepared deployment-ready Functions codebases from lockfiles.");
