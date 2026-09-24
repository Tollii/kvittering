# Kvitto

Household grocery receipts: Expo 57 / React Native (iOS first) and Convex.
Reports describe purchases, not consumption; unknown product links and
quantities stay unknown.

## Rules

- Choose the smallest design that keeps the required behavior. Keep domain logic
  pure, parse external data at its boundary, and give each rule one owner.
- Convex owns household data, authorization, and processing. Read live data
  through subscriptions; keep authorization, revision checks, and related
  writes in one transaction.
- Never lose unsaved drafts or queued images, and never break installed apps.
  Before deleting code, check generated references, scheduled functions,
  workflow callbacks, and older clients.
- Test observable results, not implementation details.

## Verify

- `npm run check:changed` after each change, `npm run check` before committing,
  `npm run check:ci` when changing tests or coverage.
- Give new behavior a check that fails without it; see
  [verification](docs/verification.md).
- After changing a Convex function signature, run `npm run contract:update`.
- Fix findings. No baselines, broad suppressions, skipped tests, or retries.

## Read when needed

- Design and tests: [principles](docs/principles.md). Data flow and state:
  [architecture](docs/architecture.md). Lint policy: [quality](docs/quality.md).
- Setup: [README](README.md), [development](docs/development.md).
- Expo: [Expo 57 docs](https://docs.expo.dev/versions/v57.0.0/),
  [native iOS](docs/native-ios.md). Convex:
  [guidelines](convex/_generated/ai/guidelines.md).
- Changes that reach installed apps: the
  [release-review skill](.agents/skills/release-review/SKILL.md) and
  [release policy](docs/releases.md). Never raise minimum versions
  automatically.
- Sentry: [observability](docs/observability.md), using the `sentry` CLI's
  saved OAuth login; the source-map token cannot read issues.
- Simplification work: [plan index](plans/README.md).
