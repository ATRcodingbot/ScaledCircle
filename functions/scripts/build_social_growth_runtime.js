"use strict";

// Build a reproducible narrow entrypoint from maintained Social source. Firebase
// discovers parameters before filtering --only, so unrelated secret declarations
// must be absent from this deployment artifact, not merely unused at runtime.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const root = path.resolve(__dirname, "../..");
const source = path.join(root, "functions-social-operations");
const output = path.join(root, ".firebase/social-growth-runtime");
const names = ["createSocialGrowthCycleV1", "approveSocialGrowthWeekV1", "getSocialGrowthCycleV1",
  "setSocialGrowthPublishingStateV1", "runSocialGrowthPublisherV1", "reconcileSocialGrowthPublicationV1"];
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
  if (node.type === "IfStatement" && generate(node).code === "if (getApps().length === 0) initializeApp();") selected.add(statement);
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
    /META_SOCIAL_APP_SECRET|YOUTUBE_SOCIAL_CLIENT_SECRET|x_first_publish/.test(built)) {
  throw new Error("social_growth_runtime_boundary_invalid");
}
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, "index.js"), built);
const hashes = {};
const copy = (name) => {
  if (hashes[name]) return;
  if (!/^[a-z0-9_]+\.js$/.test(name)) throw new Error("social_growth_dependency_invalid");
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
