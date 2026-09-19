# Kvitto

Kvitto helps a shared household understand its grocery purchases. Users capture or import receipts, review uncertain readings, and correct items and categories. Saved decisions reduce repeated manual work on later receipts.

Receipt extraction and classification turn images into purchase records. Kassalapp supplies product and store information when available. Product families and quantity normalization support comparisons across purchases. Reports show spending, prices, and quantities by period, category, store, and product. These figures describe purchases, not measured consumption; missing product links or quantities must remain visible as unknowns.

The application is built with Expo and React Native, with iOS as the primary platform. Convex owns authentication, persisted household data, server processing, and reactive reads. Device storage supports receipt capture, an upload queue, and selected cached data. The active application and backend are at the repository root.

## Responsibilities and contracts

- Prefer the smallest design that preserves required behavior. Name real responsibilities; avoid forwarding wrappers and speculative frameworks.
- Keep domain calculations and decisions pure. Separate them from database, network, storage, and UI operations; do not mutate their inputs.
- Make inputs and outputs explicit. Accept the smallest meaningful input instead of a complete receipt or application context. Use named parameters when arguments could be confused.
- Return results that distinguish meaningful outcomes. Split functions and modules by responsibility, not line count.
- Give each rule, default, and state value one authoritative owner. Keep comments aligned with that ownership.

## Types and parsing

- Parse external data at trust boundaries into types that establish the facts downstream code needs. Avoid repeated validation of facts already established.
- Model meaningful transitions, such as `string → UnverifiedEmail → VerifiedEmail`. A stronger type must be earned by the operation that proves its guarantees; parsing does not prove ownership or approval.
- Use semantic types and discriminated unions where they prevent real mistakes or invalid state combinations. Do not brand every primitive or introduce classes without a responsibility.
- Keep domain decisions independent of displayed text. Represent issues and evidence as typed data; derive user messages from them.
- Use optional fields for absence and `null` for a distinct domain state or explicit clearing operation. Define shared identifiers and defaults once; derive related types and parsers where practical.

## State and effects

- Derive values from their source instead of maintaining synchronized copies.
- Use effects for external synchronization. Put calculations in render or pure functions, and user-triggered work in event handlers.
- Give subscriptions, timers, persistence, and application lifecycle listeners an explicit owner and cleanup path.
- Keep editable drafts separate from persisted data. Incoming query updates must preserve unsaved changes and revision checks.
- Model asynchronous operation states explicitly when they permit different actions or data.

## Convex reads and writes

- Mutations perform writes and return `null`, an ID, or a small acknowledgement. Queries return persisted objects. This separation needs no command framework or separate database.
- Let existing Convex subscriptions deliver changes to the UI. Do not add polling, manual refetches, or cache invalidation for those reads. Background work can use focused read queries when it needs persisted results.
- Keep authorization, revision checks, and related writes in the appropriate transaction. Client state is not authoritative for these checks.
- Own server completion and retries on the backend. Opening a screen must not be required to finish server work.

## Data access and caching

- Read only the scope and fields the caller needs. Avoid loading complete household history in a root provider for screens that need summaries.
- Use indexes and pagination for growing collections. Background work needs bounded batches with continuation, not silent truncation.
- Prepare shared evidence once and batch independent work when practical.
- Use Convex subscriptions for live data. Persistent caches need a clear startup, offline, or external-provider purpose; live subscriptions need no freshness timer.
- Account for scope, source, and completeness in cache validity. A cached product summary is not a complete product record.
- Keep transport and caching behind small interfaces such as `useFeatureFlag(name)`. Callers should not manage freshness themselves.
- Keep tables separate when lifecycle, ownership, or retention differs. Table count alone does not justify merging them.

## Verification and project references

- Test domain rules, state transitions, transaction behavior, and meaningful failures. Avoid tests that mirror implementation or only prove deleted code stays absent.
- Before removing apparently unused code, check generated references, scheduled functions, workflow callbacks, and installed clients.
- Use `npm run check:fast` for quick feedback and `npm run check` before committing code changes. Use `npm run check:ci` when changing tests or coverage configuration. See [docs/quality.md](docs/quality.md) for the rule policy. Fix findings; do not add a baseline or broad rule suppression.
- For Expo or React Native changes, use the exact [Expo 57 documentation](https://docs.expo.dev/versions/v57.0.0/). For Convex changes, read [the generated guidelines](convex/_generated/ai/guidelines.md).
- Use [README.md](README.md) for setup, environment selection, and build commands. `npm run ios:build` builds and opens the native iOS application.
- For Sentry investigations, use the installed `sentry` CLI and its saved OAuth credentials. Follow [docs/observability.md](docs/observability.md); the source-map token in `.env.local` cannot read issues.
- Before publishing a native build, OTA update, or backend change that can affect installed clients, use [release-review](.agents/skills/release-review/SKILL.md) and [docs/releases.md](docs/releases.md). Never raise minimum supported versions automatically during a build or deployment.
- Use [plans/README.md](plans/README.md) when executing the simplification review. Keep individual findings and execution status there rather than expanding these instructions.
