# Project notes: Kvitto

These notes belong to the repository this copy of the skill is installed in. They are not part of the shared skill. When copying the skill to another repository or a shared collection, leave this file out, or replace it with that project's own notes.

Kvitto already has both halves, so the mode here is the maintenance pass.

- **Conventions doc.** The [Tracing section of the architecture doc](../../../docs/architecture.md#tracing) plays that role. Do not create `docs/observability.md`. The architecture doc explains decisions and does not track status, so the sweep date lives here and a maintenance PR updates this line: `Last swept: 2026-11-13`.
- **Backend decision, already made.** Backend telemetry stays in the Convex logs, because the free plan has no log streams and queries and mutations cannot make network requests. The app sends spans to PostHog. Do not reopen this without being asked.
- **Tracing helper.** [`traced`, `tracedFetch`, `annotate`, `count` and `annotateFailure`](../../../src/lib/tracing/index.ts), plus the builders in [`convex/serverFunctions.ts`](../../../convex/serverFunctions.ts) that give every backend function its root span.
- **Logger module.** [`convex/tracing.ts`](../../../convex/tracing.ts) writes the one `request.completed` wide event per function call, and the `trace.span` lines, through `console`, because the Convex logs are the backend. Handlers add fields with `annotate`, `count` and `annotateFailure` and write no lines of their own.
- **Lint rules.** `kvitto/traced-exports` in [`tools/lint-rules/traced-exports.cjs`](../../../tools/lint-rules/traced-exports.cjs), with `fetch` restricted as a global. For logging, `kvitto/structured-log` in [`tools/lint-rules/index.cjs`](../../../tools/lint-rules/index.cjs) applies to `convex/` and requires a literal event name; it does not ban `console`, and nothing bans it in `src/`. That is the current design and not a hole in a rule. If a sweep finds scattered logs, fix the code and report it; propose a stricter rule to the owner instead of adding one.
- **Wide-event rules.** The embedded [logging-best-practices](vendor/logging-best-practices/SKILL.md) skill is the authority on what a good event looks like. It is the repository's only copy; there is no separate `logging-best-practices` skill.
- **Pull requests.** Use [file-pr](../file-pr/SKILL.md), and the project's rule of one reviewable change per PR.
