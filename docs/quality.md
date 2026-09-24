# Code quality checks

Use Node.js 24 and `npm ci`. The checks require no server, account, or secrets.

| Command               | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `npm run check:fast`  | Formatting, TypeScript, Oxlint, repository rules, and Expo/SonarJS checks |
| `npm run check`       | Fast checks, custom lint-rule tests, and application tests                |
| `npm run check:ci`    | The same checks with application coverage reports                         |
| `npm run lint:fix`    | Apply available lint fixes; review the changes before committing          |
| `npm run lint:oxlint` | Native Oxlint correctness and test checks                                 |
| `npm run lint:policy` | All general anti-slop rules                                               |
| `npm run lint:eslint` | Expo, React, repository, and SonarJS checks                               |
| `npm run test:rules`  | Custom rule tests in ESLint and the actual Oxlint CLI                     |

`Code quality / Quality checks` runs on pull requests and pushes to `main`.
The TestFlight workflow runs `npm run check` before a new build. Set
`Quality checks` as a required status check in the GitHub branch rules to prevent
merges after a failed check. This repository change does not change branch rules.

Warnings and errors fail the lint commands. Generated clients, native build
output, agent assets, the retired `sveltemo` application, and vendored rule source
are excluded. Application and backend source have no findings baseline.
Coverage reports are written to `coverage/` and retained as CI artifacts for
14 days. Coverage is reported, not used as an arbitrary percentage gate. Test
business rules and important failures; do not add tests only to raise a number.

## Formatting

Prettier owns layout: two spaces, double quotes, semicolons, trailing commas,
parentheses around arrow parameters, LF line endings, and an 80-column target.
`.editorconfig` gives editors the same indentation and newline defaults.

Use `npm run format` to apply Prettier and the anti-slop spacing rule. That rule
separates logical statement groups without forcing blank lines between imports.
Use `npm run format:check` to check layout without changing files. The existing
lint check also checks statement spacing. `check:fast`, `check`, and `check:ci`
include the format check, so local work and pull requests use the same standard.
`lint:fix` ends with the formatter to keep automatic fixes consistent.

Keep the SonarJS conventions for parenthesized arrow parameters, concise arrow
bodies, camelCase/PascalCase function names, and simple template expressions.
Do not reorder properties by shorthand syntax or add mandatory file headers.
Formatting does not change string contents or persisted key ordering.

Generated code, external schemas and rules, native output, agent assets, and
archived plans are excluded. Do not reformat imported code to satisfy this policy.

## Repository policy

All 18 general rules from [anti-slop](https://github.com/dmmulroy/anti-slop) are
enabled. The source revision and licenses are retained under
`tools/oxlint/anti-slop`. The configuration enables new exported general rules
when that source is updated. Review each upstream update before committing it.
Effect-specific rules are not installed because the application does not use
Effect. The native `oxc/no-accumulating-spread` rule is also enabled.

Runtime `typeof` checks are prohibited. Parse external data at its boundary and
pass the resulting types to application code. Do not add runtime checks for
facts that the declared type already establishes.

Non-null assertions (`value!`) are prohibited outside tests. Parse a value once
where its presence is established and pass the narrower type on. For example,
`extractedReceipt` returns a receipt whose `data` is present, and `getOrInsert`
returns a memoized value without a second lookup. Tests may assert values that
the test itself has just established.

Exceptions must be local and explain the contract:

- Error deduplication checks the original object identity before parsing. This
  single `typeof` exception also handles objects without a prototype.
- Boundary parsers can accept `unknown`; they must validate it before returning.
- Native SDK and environment substitutions are permitted in existing integration
  tests. Domain tests should use real collaborators or narrow interfaces.
- SQL and generated transport adapters retain a small number of assertions with
  a `SAFETY:` explanation. Transport results are parsed before domain use.
- Cleanup assertions in test teardown are valid even though Oxlint does not
  recognize `afterEach` as a test block.

The repository rule `kvitto/no-undefined-record` rejects the built-in
`Record<string, undefined>`, including nested and parenthesized uses, and the
equivalent string index signature. Declare the actual properties instead. The
rule does not resolve indirect type aliases and does not confuse a locally
declared `Record` type with the TypeScript utility type. It has no automatic fix:
only the caller can define the intended contract.

## SonarJS instead of a server

The repository enables every non-deprecated rule exported by the installed
`eslint-plugin-sonarjs`, then applies the exceptions below. New rules are enabled
when the package is updated. TypeScript source is checked with project type
information through `tsconfig.eslint.json`; type-aware rules are not silently
skipped. There is no findings baseline.

The exceptions are deliberate and declared in `eslint.config.js`:

| Rules                                                                                      | Reason                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Cognitive/cyclomatic/expression complexity, nested control flow, file/function line limits | Counts do not establish separate responsibilities. Review domain and transaction boundaries instead of splitting functions to meet a number. |
| Duplicate strings, maximum union size                                                      | Repeated labels and validator literals do not always need constants; explicit unions preserve domain states.                                 |
| Nested conditional, selector parameter, mandatory final else, loop exit count              | Compact value selection, boolean inputs, optional branches, and early exits are used deliberately.                                           |
| File header, shorthand property grouping                                                   | No per-file copyright policy; group properties by meaning, not shorthand syntax.                                                             |
| Wildcard import, filename/class-name agreement                                             | SDK namespace imports and framework entry filenames are required conventions.                                                                |
| Undefined assignment                                                                       | Convex uses `undefined` to clear fields; local state also uses it for absence.                                                               |
| String comparison                                                                          | ISO dates and stable identifiers use lexical ordering.                                                                                       |
| Different-types comparison                                                                 | The rule reports valid comparisons between overlapping unions as always false. TypeScript checks incompatible comparisons.                   |
| Unused variables                                                                           | The TypeScript rule owns this check and supports rest destructuring that omits fields.                                                       |
| Require/define, in JavaScript configuration only                                           | Expo, Metro, and custom rule tooling use CommonJS.                                                                                           |
| Invariant returns, in Convex only                                                          | Successful commands intentionally return `null`.                                                                                             |

Function names permit camelCase and PascalCase React components. Arrow parameters
always have parentheses; short single-return bodies use expressions. Local
exceptions explain a rejected HTTP test fixture, package and credential regular
expressions, and the existing React test renderer. Other rules, including security
and regular-expression performance checks, remain enabled.

This is a local and PR check, not a SonarQube deployment. It does not provide the
SonarQube dashboard, full security analysis, or historical issue tracking.
[SonarQube Community Build analyzes the main branch](https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/analysis-overview).
A maintained server would add operational work without supplying the same PR
analysis offered by the paid editions. Start with these repeatable checks; add a
server if the team needs its reports.

Oxlint is part of Oxc. The project retains Expo's ESLint rules for React and native
application checks. TypeScript remains the type checker; this change does not
upgrade Expo's TypeScript version to satisfy a separate type-aware linter.

## Effect and other options

Effect provides typed errors, structured concurrency, and composable
[retry policies](https://effect.website/docs/v3/error-management/retrying).
Those features could help an external-service integration with several failure
and cancellation paths. Here, Convex workflows already own persisted retries and
completion, while domain decisions are pure functions and Zod/Convex validators
parse external input. Adding a second execution model now would increase the
number of contracts to maintain. No Effect dependency is added.

If an integration becomes difficult to manage, compare a small Effect version
with the existing code before adopting it more widely. Do not duplicate Convex
workflow retries with Effect retries.

Useful next steps are a required PR status check, secret scanning, and scheduled
dependency review. Consider unused-code detection only after configuring generated
references, scheduled functions, Expo routes, and installed-client contracts.
