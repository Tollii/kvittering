# Verification

A green `CI result` should mean the change can merge. This guide describes the
checks behind that result, how to run them yourself, and how to add a check
when you add behavior. It applies to people and agents alike.

## Run the checks

| When                          | Command                                         | Time      |
| ----------------------------- | ----------------------------------------------- | --------- |
| After each change             | `npm run check:changed`                         | 1 minute  |
| Before committing             | `npm run check`                                 | 3 minutes |
| After changing tests or setup | `npm run check:ci`                              | 4 minutes |
| After changing a flow, on Mac | `npm run e2e:ios`                               | 30 min    |
| Review areas for this branch  | `node tools/presubmit.mts`                      | seconds   |
| Coverage of changed lines     | `node tools/diff-coverage.mts` after `check:ci` | seconds   |

`check:changed` checks the files changed since `main`, including uncommitted
and untracked files, including deletions: formatting, types, lint, unused code, tests related to
the changed files, the backend contract, lint-rule tests, and documentation
references. It prints output only for failing steps.

In Claude Code, the project hooks install dependencies at the start of a cloud
session and run `check:changed` when the agent stops. A failure keeps the agent
working with the findings; a passing tree is remembered and not checked again.
Other agents should run the same command before reporting a change as done.
If no main branch is available, fetch `origin/main` before running change checks.
Deleting a file still runs the type, unused-code, and documentation checks.

Cloud agent sessions cannot start a local Convex backend or an iOS Simulator.
Start the end-to-end workflow instead: run the `End-to-end` workflow with
`workflow_dispatch` on the branch, or add the `e2e` label to the pull request,
then read the job summary and the `e2e-ios` artifact with its screenshots.

## What CI checks

`Code quality` runs on pull requests, merge queue groups, and pushes to `main`.
`CI result` passes only when every required job passes or is skipped:

| Job                           | Proves                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Quality checks                | Formatting, types, lint, documentation references, rule tests, application and component tests                                  |
| App bundle and generated code | The iOS JavaScript bundle builds, Expo SDK packages match, and the generated catalog client is current                          |
| Backend contract              | No public function, queued internal argument, stored workflow result, or HTTP route breaks for installed apps or scheduled work |
| Native fingerprint            | Reports whether the native runtime changed, which decides between a TestFlight build and an OTA update                          |
| Workflow and secret checks    | actionlint, zizmor, and gitleaks over the full history                                                                          |
| Dependency review             | No new dependency with a high-severity advisory (once the repository is public)                                                 |

The `Change areas` job summary lists the review checklist for each area the
change touches, from [`tools/presubmit.mts`](../tools/presubmit.mts). Pull
requests also get two reports that do not block merging: changed lines that no
test executed, and a mutation report for changed domain rules.

`End-to-end` runs the Maestro flows in `.maestro/` on the iOS Simulator
against a local Convex backend with the mock receipt provider. The simulator
uses iOS 27.0 and Xcode 27.0 on GitHub's `xcode-27` preview runner. The build
cache includes the native fingerprint, Xcode build, architecture, and simulator
runtime; a JavaScript-only change reuses it. The script creates or reuses the
dedicated `Kvitto End-to-End` simulator and fails if the requested runtime is
unavailable. While
the repository is private, it runs for changed flows, the `e2e` label, or a
manual dispatch. Once public, it also runs for native changes and nightly.

The test script disables password autofill on its selected simulator before
launching the app. The system's strong-password sheet can otherwise intercept
Maestro input. The app keeps its secure field and password-autofill settings.
The sign-up flow enters the complete test password in one command and verifies
that registration and household creation succeed.

For local flow changes after a successful native build, reuse that build:

```sh
E2E_APP_CACHE=build/derived/Build/Products/Release-iphonesimulator/kvitto.app npm run e2e:ios
```

This replaces the JavaScript bundle and reruns the flows. Use the normal
`npm run e2e:ios` command to rebuild after native dependencies or settings change.
Use `E2E_DEVICE` to select another dedicated test simulator. The sign-up flow
clears app data and the simulator keychain so earlier sessions cannot sign in.
The local database and authentication secret are retained between runs. Changing
that secret makes existing encrypted signing keys unreadable.

Tests run in random order. A failure prints the seed; reproduce it with
`npx vitest run --sequence.seed=<seed>`. A test that fails only in some orders
depends on state from another test: fix the test, never retry it.

## Add a check for new behavior

Choose the lowest level that can observe the behavior. Each level runs faster
and fails more precisely than the next.

1. **Domain rule** in `src/lib/domain` or `src/lib/catalog`: a Vitest unit test
   beside the module. Pure functions need no mocks.
2. **Backend behavior**: a `convex-test` test in `convex/`, calling the real
   query, mutation, or action with an authenticated household. Cover
   authorization and the important failure, not only the success path.
3. **Backend contract**: automatic. After changing a function signature, run
   `npm run contract:update` and commit `convex/contract.json`. The review diff
   shows exactly which functions changed.
4. **Component behavior**: a Jest test named `*.test.tsx` beside the component,
   using React Native Testing Library. Query by the label or text a person
   sees, act as they would, and assert what they see or what the component
   reports. See `src/components/money-field.test.tsx`.
5. **A flow across screens, native modules, and the backend**: a Maestro flow
   in `.maestro/`. Keep flows few and focused on journeys whose failure would
   lose data or block people, such as signing in, capturing, and saving.
   Root flows start empty; keep `.maestro/sign-up.yaml` there. To use seeded
   data, put a flow in `.maestro/<fixture>/` and its data in
   `tools/e2e/fixtures/<fixture>/fixture.json`. Run `npm run e2e:ios` as usual.
   The runner clears the anonymous local deployment before each flow, creates
   the fixture account through email sign-up, and imports tables with the
   Convex CLI. Each flow must use `launchApp` with `clearState: true`.
   Sign in with `${E2E_EMAIL}` and `${E2E_PASSWORD}` supplied by the runner.
   A fixture has `tables` and one `account` (name, email, password of at least
   12 characters). Use `includes: ["household"]` to reuse the base household;
   included table rows are appended. Supply exactly one household. Use
   `${HOUSEHOLD_ID}` and `${USER_IDENTITY}` as complete field values for app
   references. `${USER_IDENTITY}` combines the auth issuer and user ID, as
   Kvitto requires; `${USER_ID}` is the raw Better Auth ID.
   Keep receipt amounts in øre and unknown product data null. The
   `reviewed-receipts` fixture is an example with three reviewed receipts.
   `npm run check` validates every fixture against the real table validators.
   Per-flow seed logs, reports, and screenshots are in `build/e2e/flows/`.
6. **A repository-wide rule**: a lint rule in `tools/eslint`, with valid and
   invalid cases in `tools/eslint/rules.test.cjs`. Its message must say how to
   fix the finding. Prefer this to a sentence in a document that asks people to
   remember something.

## Prove the check can fail

Before relying on a new test, break the behavior it protects (revert the
change, or alter one condition) and watch the test fail with a message that
names the problem. Then restore the behavior. A test that still passes proves
nothing. For domain rules, `npm run test:mutation -- --mutate <file>` does this
systematically; each surviving mutant is a change no test notices.

Test observable results and required effects, as described in the
[design principles](principles.md). Do not add a test only to raise coverage or
to confirm that code was deleted.

## Maintain the checks

- A failing check means the code or the contract is wrong. Fix the code, or
  change the contract deliberately and say why in the pull request. Do not
  weaken, skip, or retry a check to get a green result.
- A breaking contract change needs the `release-review` skill and the
  `breaking-contract` label. Prefer adding a new function and keeping the old
  one until the oldest supported client no longer calls it.
- When a check's message was unclear, improve the message in the same change.
- When a review finds a class of mistake, add the check that would have found
  it: a test, a lint rule, or an entry in `tools/presubmit.mts`.
- Keep documentation references current; `npm run lint:docs` rejects links to
  missing files and headings and unknown `npm run` scripts.

## Repository settings

These GitHub settings make the checks binding. They are not stored in the
repository:

- A branch ruleset for `main` that requires the `CI result` status check and
  pull requests before merging.
- The merge queue for `main`, so each change is tested with the changes merged
  before it. The quality workflow already runs on `merge_group`.
- The `breaking-contract` and `e2e` labels.
