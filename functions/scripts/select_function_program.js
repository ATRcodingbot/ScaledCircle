"use strict";
const traverse = require("@babel/traverse").default;
function exportedName(statement) {
  const expression = statement.type === "ExpressionStatement" && statement.expression;
  const left = expression?.type === "AssignmentExpression" && expression.left;
  if (left?.type !== "MemberExpression" || left.computed ||
      left.object?.type !== "Identifier" || left.object.name !== "exports" ||
      left.property?.type !== "Identifier") return null;
  return left.property.name;
}

function selectedProgram(ast, selectedExports) {
  const retained = new Set();
  const queued = [];
  let programPath;
  traverse(ast, {Program(path) { programPath = path; path.stop(); }});

  function retain(statementPath) {
    if (!statementPath || retained.has(statementPath.node)) return;
    retained.add(statementPath.node);
    queued.push(statementPath);
  }

  for (const statementPath of programPath.get("body")) {
    const name = exportedName(statementPath.node);
    if (name && selectedExports.has(name)) retain(statementPath);
    if (statementPath.isExpressionStatement()) {
      const callee = statementPath.node.expression?.callee;
      if (callee?.type === "Identifier" && ["initializeApp", "setGlobalOptions"].includes(callee.name)) {
        retain(statementPath);
      }
    }
  }

  while (queued.length) {
    const statementPath = queued.pop();
    statementPath.traverse({
      ReferencedIdentifier(identifierPath) {
        const binding = identifierPath.scope.getBinding(identifierPath.node.name);
        if (!binding || binding.scope.path !== programPath) return;
        retain(binding.path.getStatementParent());
      },
    });
  }

  ast.program.body = programPath.get("body")
    .filter((statementPath) => retained.has(statementPath.node))
    .map((statementPath) => statementPath.node);
  return ast;
}

module.exports = {exportedName, selectedProgram};
