"use strict";

const {spawnSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const packageDirectories = [
  "functions-platform", "functions-legacy", "functions-wallet",
  "functions-artifact-email", "functions-job-alert-email",
  "functions-campaign-funding", "functions-assignment", "functions-discovery",
  "functions-job-room",
  "functions-transactional-email",
  "functions-admin-ops",
  "functions-sales",
  "functions-legal",
];

function runNpmCi(cwd) {
  const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
  const args = process.platform === "win32" ?
    ["/d", "/s", "/c", "npm.cmd ci --ignore-scripts"] :
    ["ci", "--ignore-scripts"];
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`npm ci failed for ${path.basename(cwd)}`);
  }
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scaledcircle-functions-ci-"));
try {
  for (const directory of packageDirectories) {
    const source = path.join(root, directory);
    const destination = path.join(temporaryRoot, directory);
    fs.mkdirSync(destination, {recursive: true});
    for (const file of ["package.json", "package-lock.json"]) {
      fs.copyFileSync(path.join(source, file), path.join(destination, file));
    }
    runNpmCi(destination);
    console.log(`PASS ${directory}`);
  }
} finally {
  fs.rmSync(temporaryRoot, {recursive: true, force: true});
}

console.log(`Verified clean npm ci installability for ${packageDirectories.length} generated Functions packages.`);
