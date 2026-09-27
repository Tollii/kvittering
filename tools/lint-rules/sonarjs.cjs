/**
 * Splits the sonarjs rules between Oxlint and ESLint. Oxlint runs sonarjs as
 * a JavaScript plugin, which gets no TypeScript program, so ESLint runs the
 * rules that need one. New upstream rules are enabled when the plugin updates.
 */
const sonarjs = require("eslint-plugin-sonarjs");

const off = {
  // The project has no per-file copyright header convention.
  "file-header": "off",
  "shorthand-property-grouping": "off",
  // Literal labels and validator values do not need shared constants merely because they repeat.
  "no-duplicate-string": "off",
  // These limits measure syntax or size rather than a module's responsibility.
  "cyclomatic-complexity": "off",
  "expression-complexity": "off",
  "nested-control-flow": "off",
  "max-lines": "off",
  "max-lines-per-function": "off",
  // Named unions, early exits, optional branches, and compact multi-way values are deliberate.
  "max-union-size": "off",
  "too-many-break-or-continue-in-loop": "off",
  "elseif-without-else": "off",
  "no-nested-conditional": "off",
  // Undefined clears Convex fields and represents absent local state.
  "no-undefined-assignment": "off",
  // SDK namespace imports and PascalCase React components are standard here.
  "no-wildcard-import": "off",
  // ISO dates and stable identifiers use lexical ordering.
  "strings-comparison": "off",
  // TypeScript handles type compatibility; Sonar reports overlapping unions as disjoint.
  "different-types-comparison": "off",
  // The TypeScript rule supports intentional omission through rest destructuring.
  "no-unused-vars": "off",
  // Expo and Convex require specific entry filenames.
  "file-name-differ-from-class": "off",
};

// Oxlint implements these rules natively, with type information where they need it.
const native = new Set([
  "deprecation", // typescript/no-deprecated
  "no-array-delete", // typescript/no-array-delete
  "no-for-in-iterable", // typescript/no-for-in-array
  "prefer-regexp-exec", // typescript/prefer-regexp-exec
  "no-alphabetical-sort", // typescript/require-array-sort-compare
  "unused-import", // no-unused-vars
  "no-empty-character-class",
  "no-invalid-regexp",
  "no-misleading-character-class",
  "no-control-regex",
  "no-regex-spaces",
]);

const configured = {
  // Match the formatter: parenthesized parameters and concise single-return arrow bodies.
  "arrow-function-convention": [
    "error",
    { requireParameterParentheses: true, requireBodyBraces: false },
  ],
  // Nesting and breaks in linear flow make a function hard to follow; this
  // is not a size limit. Split a function along its steps, not arbitrarily.
  "cognitive-complexity": ["error", 15],
  "function-name": ["error", { format: "^[_a-zA-Z][a-zA-Z0-9]*$" }],
};

/**
 * True when a rule reads the TypeScript program or the typescript-eslint scope
 * manager, which resolves path aliases and library types such as `Record`.
 */
function needsProgram(name, rule) {
  return (
    rule.meta.docs?.requiresTypeChecking === true ||
    name === "no-implicit-dependencies" ||
    name === "no-reference-error"
  );
}

/** The sonarjs rule settings for one linter, keyed by their `sonarjs/` names. */
function sonarjsRules(linter) {
  const rules = {};

  for (const [name, rule] of Object.entries(sonarjs.rules)) {
    if (rule.meta.deprecated || native.has(name) || name in off) continue;

    if (needsProgram(name, rule) !== (linter === "eslint")) continue;

    rules[`sonarjs/${name}`] = configured[name] ?? "error";
  }

  return rules;
}

module.exports = { sonarjsRules };
