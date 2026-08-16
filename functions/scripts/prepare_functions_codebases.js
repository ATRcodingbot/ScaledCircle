"use strict";

const {spawnSync} = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function runNpmCi(cwd) {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd ci --ignore-scripts"], cwd);
    return;
  }
  run(npmCommand, ["ci", "--ignore-scripts"], cwd);
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

for (const directory of ["functions-platform", "functions-legacy", "functions-wallet"]) {
  if (directory === "functions-wallet") prunePackageLock(path.join(root, directory));
  runNpmCi(path.join(root, directory));
}

run(process.execPath, [path.join(__dirname, "verify_generated_codebases.js")], root);
console.log("Prepared deployment-ready Functions codebases from lockfiles.");
