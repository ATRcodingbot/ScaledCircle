"use strict";

// Build a reproducible narrow entrypoint from maintained cash-out source. Firebase
// discovers parameters before filtering --only, so unrelated secret declarations
// must be absent from this deployment artifact, not merely unused at runtime.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const root = path.resolve(__dirname, "../..");
const source = path.join(root, "functions");
const output = path.join(root, ".firebase/cashout-runtime");
const callableNames = ["getScalerCashoutV1", "setupScalerPayoutsV1", "requestScalerCashoutV1", "reconcileScalerCashoutV1"];
const names = process.argv.includes("--with-webhooks") ? [...callableNames,
  "scalerCashoutTestWebhookV1", "scalerCashoutTestConnectWebhookV1"] : callableNames;
const original = fs.readFileSync(path.join(source, "index.js"), "utf8");
const ast = parser.parse(original, {sourceType: "script"});
let program;
traverse(ast, {Program(p) { program = p; p.stop(); }});
const selected = new Set();
for (const statement of program.get("body")) {
  const node = statement.node;
  if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression") {
    const left = node.expression.left;
    if (left.type === "MemberExpression" && left.object.name === "exports" && names.includes(left.property.name)) selected.add(statement);
  }
  if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && node.expression.callee.name === "setGlobalOptions") selected.add(statement);
  if (node.type === "ExpressionStatement" && generate(node).code === "initializeApp();") selected.add(statement);
}
for (const statement of selected) {
  statement.traverse({ReferencedIdentifier(p) {
    const binding = p.scope.getBinding(p.node.name);
    if (!binding || binding.scope !== program.scope) return;
    const dependency = binding.path.getStatementParent();
    if (dependency?.parentPath === program) selected.add(dependency);
  }});
}
ast.program.body = program.get("body").filter(p => selected.has(p)).map(p => p.node);
const built = generate(ast, {comments: true}).code + "\n";
const actual = [...built.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map(match => match[1]).sort();
if (JSON.stringify(actual) !== JSON.stringify([...names].sort()) ||
    /defineSecret\("STRIPE_SECRET_KEY"\)|META_SOCIAL_APP_SECRET|X_SOCIAL_CLIENT_SECRET/.test(built)) {
  throw new Error("cashout_runtime_boundary_invalid");
}
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, "index.js"), built);
// Explicit staging-only deployment configuration. Kept disabled until both
// dedicated webhook endpoints and signatures have been certified.
fs.writeFileSync(path.join(output, ".env.scaledcircle-staging"),
  "SCALEDCIRCLE_ENV=staging\nSCALEDCIRCLE_CASHOUT_TEST_ENABLED=false\n");
const hashes = {};
const copy = (name) => {
  if (hashes[name]) return;
  if (!/^[a-z0-9_]+\.js$/.test(name)) throw new Error("cashout_dependency_invalid");
  const bytes = fs.readFileSync(path.join(source, name));
  hashes[name] = crypto.createHash("sha256").update(bytes).digest("hex");
  fs.writeFileSync(path.join(output, name), bytes);
  for (const match of bytes.toString().matchAll(/require\("\.\/([a-z0-9_]+)"\)/g)) copy(`${match[1]}.js`);
};
for (const match of built.matchAll(/require\("\.\/([a-z0-9_]+)"\)/g)) copy(`${match[1]}.js`);
for (const name of ["package.json", "package-lock.json"]) fs.copyFileSync(path.join(source, name), path.join(output, name));
if (!fs.existsSync(path.join(output, "node_modules"))) {
  fs.symlinkSync(path.join(source, "node_modules"), path.join(output, "node_modules"), "junction");
}
fs.writeFileSync(path.join(output, "build-manifest.json"), JSON.stringify({exports: names,
  sourceEntrySha256: crypto.createHash("sha256").update(original).digest("hex"),
  builtEntrySha256: crypto.createHash("sha256").update(built).digest("hex"), dependencies: hashes}, null, 2));
console.log(JSON.stringify({output, exports: names, dependencyCount: Object.keys(hashes).length}));
