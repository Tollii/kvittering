# Code quality checks

Use Node.js 24 and `npm ci`. The checks require no server, account, or secrets.

| Command               | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `npm run check:fast`  | TypeScript, Oxlint, repository rules, and Expo/SonarJS ESLint checks |
| `npm run check`       | Fast checks, custom lint-rule tests, and application tests           |
| `npm run check:ci`    | The same checks with application coverage reports                    |
| `npm run lint:fix`    | Apply available lint fixes; review the changes before committing     |
| `npm run lint:oxlint` | Native Oxlint correctness and test checks                            |
| `npm run lint:policy` | All general anti-slop rules                                          |
| `npm run lint:eslint` | Expo, React, repository, and selected SonarJS checks                 |
| `npm run test:rules`  | Custom rule tests in ESLint and the actual Oxlint CLI                |

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

The repository uses the free `eslint-plugin-sonarjs` package with six focused
checks: duplicated branches, overwritten elements, identical expressions,
ignored returns, invariant returns, and use of empty return values. Invariant
return checks are disabled for Convex functions because successful mutations
intentionally return `null`.

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
