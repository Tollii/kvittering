# Kvitto

Kvitto helps households capture receipts and understand grocery purchases. It uses Expo/React Native, primarily on iOS, and Convex. Reports describe purchases, not consumption; missing product links and quantities must remain unknown.

## Working rules

- Prefer the smallest design that preserves required behavior. Keep domain decisions pure, parse external data into useful types, and give each rule and state one owner.
- Convex owns persisted household data, authorization, and server processing. Use subscriptions for live reads; keep authorization, revision checks, and related writes in one transaction.
- Preserve unsaved drafts, queued images, and installed-client contracts. Before deleting apparently unused code, check generated references, scheduled functions, workflow callbacks, and older clients.
- Test observable results and required effects. Avoid tautological tests, implementation assertions, and tests that only detect code changes or confirm deletion.

## Verification

Run `npm run check:changed` after each change, `npm run check` before committing code changes, and `npm run check:ci` when changing tests or coverage configuration. Fix findings without baselines, broad suppressions, skips, or retries. For documentation-only changes, `npm run check:changed` checks formatting and links. When adding behavior, add the check that proves it and show that it fails without the change; see [verification](docs/verification.md). After changing a Convex function signature, run `npm run contract:update`. See [quality checks](docs/quality.md).

## Read for the task

Load the relevant reference when the task needs it. These files are not a required reading sequence.

- Domain modeling, responsibility boundaries, or test strategy: [Design principles](docs/principles.md).
- Ownership, data flow, state, or caching: [Architecture](docs/architecture.md).
- Setup, environments, or build commands: [README](README.md). `npm run ios:build` builds and opens the native app.
- Expo or React Native changes: use the exact [Expo 57 documentation](https://docs.expo.dev/versions/v57.0.0/); see [native integrations](docs/native-ios.md).
- Convex changes: read the [generated guidelines](convex/_generated/ai/guidelines.md).
- Native, OTA, or backend release affecting installed clients: use [release-review](.agents/skills/release-review/SKILL.md) and [release policy](docs/releases.md). Never raise minimum supported versions automatically.
- Sentry investigation: follow [observability](docs/observability.md), using the installed `sentry` CLI and saved OAuth credentials. The source-map token cannot read issues.
- Simplification review: use the [plan index](plans/README.md); keep findings and execution status there.

Keep this file short. Put design rationale in principles, current system contracts in architecture, and specific procedures in their existing guide or skill. Update the relevant document when its contract changes.
