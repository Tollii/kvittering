# Code quality checks

Use Node.js 24 and `npm ci`. The checks require no server, account, or secrets.

| Command                 | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `npm run check:fast`    | Formatting, TypeScript, Oxlint, repository rules, and Expo/SonarJS checks |
| `npm run check`         | Fast checks, custom lint-rule tests, and application tests                |
| `npm run check:ci`      | The same checks with application coverage reports                         |
| `npm run lint:fix`      | Apply available lint fixes; review the changes before committing          |
| `npm run lint:oxlint`   | Native Oxlint correctness and test checks                                 |
| `npm run lint:policy`   | All general anti-slop rules                                               |
| `npm run lint:eslint`   | Expo, React, type-aware TypeScript, repository, and SonarJS checks        |
| `npm run lint:unused`   | Unused files, dependencies, and exports (knip)                            |
| `npm run test:rules`    | Custom rule tests in ESLint and the actual Oxlint CLI                     |
| `npm run test:mutation` | On-demand mutation report for domain rules (Stryker)                      |

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

The repository rule `kvitto/no-effect-fetch` rejects `fetch` and
`XMLHttpRequest` inside `useEffect`, `useLayoutEffect`, and
`useInsertionEffect` callbacks, including helpers declared inside them. Load
server data through a Convex subscription or a TanStack query, which own
caching, deduplication, cancellation, and the order of responses. Both
repository rules run in ESLint and Oxlint.

Further repository rules, in `tools/eslint/index.cjs`, run in ESLint:

| Rule                            | Scope                | Rejects                                                                                                                             |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `kvitto/no-leaked-render`       | TypeScript           | `a && <View/>` when `a` can be `0`, `NaN`, or `""`; React Native crashes when such a value renders outside `<Text>`. Uses types.    |
| `kvitto/no-ore-arithmetic`      | TypeScript           | `+ - * / %`, compound assignment, and negation on `Ore` amounts outside `ore.ts`. Uses types.                                       |
| `kvitto/no-calendar-string-ops` | TypeScript           | String methods and template interpolation on `CalendarDate` and `CalendarMonth` outside `calendar.ts`. Uses types.                  |
| `kvitto/no-inline-literal-set`  | Application, backend | `["a", "b"].includes(x)`. Name the rule as a predicate beside its type, or a module-level `Set`.                                    |
| `kvitto/convex-function-access` | Backend              | A public `query`, `mutation`, or `action` without an access check, unless a preceding `// Access:` comment states why it is public. |
| `kvitto/no-db-query-filter`     | Backend              | `.filter()` on a database query. Select with an index range.                                                                        |
| `kvitto/no-unbounded-collect`   | Backend              | `.collect()` on a database query. Use `.take(n)`, `.first()`, `.unique()`, or pagination.                                           |

React rules also reject index keys, useless fragments, components defined
during render (render props passed to navigation options are allowed), and
deprecated APIs. `sonarjs/no-selector-parameter` reports a boolean argument
that chooses between two behaviors; give each behavior its own function, or
pass a named state such as `CaptureAvailability`.

## Import direction

Dependencies point inward. `src/app`, `src/features`, and `src/components` use
`src/lib`; `src/lib` and `convex` never import them (`import/no-restricted-paths`,
tests excepted). Domain and catalog modules under `src/lib/domain` and
`src/lib/catalog` do not import React, React Native, Expo, or UI modules, so the
backend and tests run them unchanged. `import/no-cycle` rejects dependency
cycles.

## Money

Amounts are `Ore`, a whole number of øre branded at compile time. The `Ore`
object is the only way to create or combine them: `Ore.of`, `fromKroner`,
`parse`, `parseAmount`, `add`, `subtract`, `negate`, `abs`, `sum`, `min`, `max`,
`median`, `scale`, `divide`, `round`, `ratio`, `per`, `toKroner`, `compare`,
`format`, `formatInput`, and `formatWholeKroner`. Stored documents and client
data keep plain numbers; `oreValidator` brands Convex fields without changing
them. Unit prices are rates in fractional øre per unit, so they are plain
numbers named `…UnitPrice`, not amounts.

## Dates and categories

Calendar days are `CalendarDate` ("YYYY-MM-DD") and months are `CalendarMonth`
("YYYY-MM"), branded strings without a time zone. Their companion objects parse,
read parts, shift, clamp, compare, and format them; `CalendarDate.today()` is
the date in Oslo. Stored purchase dates stay strings; `calendarDateValidator`
brands them, and receipt writes parse them. Report period bounds use
`CalendarDate.parseBound`, because installed clients end every month on day 31.
Tests build dates with `date("2026-09-18")` and `month("2026-09")`.

`CategoryId` is the closed set of category leaves. Stored ids stay strings,
because they may predate merged or renamed categories. Parse them with
`parseCategoryId`, `isCategoryId`, or `isDecidedCategory`, and read names with
`category(id)` or `categoryOf(stored)`. Functions that decide a category take a
`CategoryId`.

## Type safety

`any` is not permitted. `@typescript-eslint/no-explicit-any` rejects written
`any`, and the type-aware `no-unsafe-*` rules reject `any` that arrives from
`JSON.parse`, library declarations, or test mocks when it is assigned, called,
returned, passed on, or read. Parse such values at their boundary with the
owner's schema: a Convex validator, a Zod schema, or a named parser. Values may
still pass as `unknown` to such a parser.

The same configuration rejects floating and misused promises, awaiting
non-promises, throwing or rejecting with non-errors, unnecessary assertions,
non-exhaustive `switch` statements over unions, and `@ts-ignore`.
`@ts-expect-error` requires a description.

`noUncheckedIndexedAccess` types array and record reads as possibly
`undefined`. Pair parallel values in one object instead of reading two arrays
by position, and name the one-element and non-empty cases with `soleElement`
and `nonEmpty`. Tests read required elements with `present(value)`, which
fails with a clear message. With index reads typed honestly,
`no-unnecessary-condition` rejects guards the types already rule out.

`no-non-null-assertion` rejects `!` outside tests. Parse absent values once at
a boundary, such as `extractedReceipt`, instead of asserting them present.

## File length

`max-lines` rejects files with more than 750 lines of code, not counting blank
lines and comments. A file of that size usually contains several
responsibilities. Split it along those responsibilities rather than moving
arbitrary blocks. Function length and complexity counts remain disabled; see
the table below.

## SonarJS instead of a server

The repository enables every non-deprecated rule exported by the installed
`eslint-plugin-sonarjs`, then applies the exceptions below. New rules are enabled
when the package is updated. TypeScript source is checked with project type
information through `tsconfig.eslint.json`; type-aware rules are not silently
skipped. There is no findings baseline.

The exceptions are deliberate and declared in `eslint.config.js`:

| Rules                                                                                              | Reason                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cognitive/cyclomatic/expression complexity, nested control flow, SonarJS file/function line limits | Counts do not establish separate responsibilities. Review domain and transaction boundaries instead of splitting functions to meet a number. The core `max-lines` rule above sets the file limit. |
| Duplicate strings, maximum union size                                                              | Repeated labels and validator literals do not always need constants; explicit unions preserve domain states.                                                                                      |
| Nested conditional, mandatory final else, loop exit count                                          | Compact value selection, optional branches, and early exits are used deliberately.                                                                                                                |
| File header, shorthand property grouping                                                           | No per-file copyright policy; group properties by meaning, not shorthand syntax.                                                                                                                  |
| Wildcard import, filename/class-name agreement                                                     | SDK namespace imports and framework entry filenames are required conventions.                                                                                                                     |
| Undefined assignment                                                                               | Convex uses `undefined` to clear fields; local state also uses it for absence.                                                                                                                    |
| String comparison                                                                                  | ISO dates and stable identifiers use lexical ordering.                                                                                                                                            |
| Different-types comparison                                                                         | The rule reports valid comparisons between overlapping unions as always false. TypeScript checks incompatible comparisons.                                                                        |
| Unused variables                                                                                   | The TypeScript rule owns this check and supports rest destructuring that omits fields.                                                                                                            |
| Require/define, in JavaScript configuration only                                                   | Expo, Metro, and custom rule tooling use CommonJS.                                                                                                                                                |
| Invariant returns, in Convex only                                                                  | Successful commands intentionally return `null`.                                                                                                                                                  |

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

## Unused code, dependencies, and mutation testing

`npm run lint:unused` runs knip over application, backend, and tooling code.
`knip.jsonc` names entries that are loaded by path and dependencies required
without an import. Before removing a reported export, check generated Convex
references, scheduled functions, workflow callbacks, and installed clients.

Dependabot proposes weekly npm updates and monthly GitHub Actions updates. Expo,
React, and React Native minor and major versions are excluded; upgrade the SDK
with `npx expo install --fix` and review it with the release policy.

`npm run test:mutation` changes domain rules one at a time and reports which
changes no test notices. Pass `-- --mutate src/lib/domain/<module>.ts` for one
module. The HTML report is written to `coverage/mutation/`. It uses the command
runner and `vitest.mutation.config.mts`, a node-environment copy of the domain
tests. It is a review aid, not a CI gate or percentage target.

A required PR status check and secret scanning remain useful next steps.
