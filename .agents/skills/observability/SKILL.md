---
name: observability
description: Set up or maintain observability in a codebase with OpenTelemetry tracing plus wide-event logging, delivered as two pull requests. Use when asked to add tracing, replace scattered logs with one event per request, or check that existing observability still covers new code. Run it again later as a maintenance pass.
metadata:
  harness: [claude, codex]
  platform: [darwin, linux]
---

# Observability

Bring a codebase to the point where any request can be explained after the fact. Two things do that: distributed tracing through OpenTelemetry, and one wide event per unit of work in place of scattered log lines.

The work lands as two pull requests, tracing first and logging second, so each can be reviewed on its own. On a project that already has both, the skill runs as a maintenance pass: it covers code that arrived since the last run and checks that the logging is still good.

The examples are TypeScript. The rules are not tied to a language; elsewhere, use that language's idiom for the same idea (decorators, middleware, `defer`, context managers).

## Files in this skill

Read only what the current step needs.

| File | Read it when |
| --- | --- |
| [references/backend.md](references/backend.md) | Deciding where telemetry goes (full setup, or an adopted setup with no backend) |
| [references/tracing.md](references/tracing.md) | Building or fixing tracing (PR 1) |
| [references/wide-events.md](references/wide-events.md) | Building or fixing wide events (PR 2) |
| [references/maintenance.md](references/maintenance.md) | Both halves already exist |
| [references/sources.md](references/sources.md) | A rule needs its reasoning, or someone asks where it comes from |
| [assets/tracing-helper.ts](assets/tracing-helper.ts) | Writing the tracing helper and the request-context processor |
| [assets/wide-event-middleware.ts](assets/wide-event-middleware.ts) | Writing the event middleware, `enrich`, and the sampling decision |
| [assets/conventions-doc.md](assets/conventions-doc.md) | Creating or extending the project's conventions doc |
| [scripts/survey.sh](scripts/survey.sh) | Step 1, to collect the mechanical facts quickly |

The assets are starting points to adapt to the project's framework and naming, not files to copy unchanged.

## Step 1: find out where the project stands

Read before deciding anything. Run `bash <this skill's folder>/scripts/survey.sh` from the repository root for the facts a search can find (telemetry dependencies, `console.*` counts, inline spans, earlier runs), then read the code for the rest:

- **Stack.** Languages, runtimes (Node, Bun, Deno, edge workers, serverless, a managed backend), web framework, monorepo layout, and which packages are deployed services as opposed to libraries or clients.
- **Units of work.** HTTP routes, and everything else that starts work: queue consumers, scheduled jobs, webhooks, CLI commands.
- **Existing telemetry.** OpenTelemetry packages, vendor SDKs or agents (APM, error tracker, analytics), a logger library, how much `console.*` there is, and any env vars, infra config, CI secrets or docs that name a backend.
- **Identity.** What identifies the user and the tenant (org, workspace, business, account), where in a request they become known, and what the domain's main entities are.
- **Conventions.** Linter, test runner, branch and commit style, PR template, and any PR-filing skill or contributing guide in the repo.
- **Earlier runs of this skill.** A conventions doc (`docs/observability.md` by default), and branches or PRs named `observability/*`, open or merged.

## Step 2: pick the mode

| What you find | What to do |
| --- | --- |
| No tracing helper, no conventions doc | Full setup: steps 3, 4, 5 |
| Tracing exists (merged, or PR 1 open), no wide events | Resume at step 5 |
| Both exist | Maintenance pass: [references/maintenance.md](references/maintenance.md) |
| Observability someone built without this skill | Adopt it: write the conventions doc to describe what is there, then close the gaps against steps 4 and 5. Ask before replacing a library or a backend. |

Judge by the code, not only by the doc. A conventions doc with no tracing helper behind it means setup was never finished.

## Step 3: decide where telemetry goes

Follow [references/backend.md](references/backend.md). In short: the code stays vendor-neutral (OpenTelemetry SDK, OTLP exporter, standard `OTEL_*` env vars), an existing backend wins, otherwise ask one question with a recommendation, and if nobody answers go ahead with plain OTLP and say so at the top of PR 1.

## Step 4: PR 1, tracing

Branch `observability/tracing` from the default branch. Build what [references/tracing.md](references/tracing.md) lists: SDK setup in one module, one tracing helper applied where functions are defined, request context on every span, W3C propagation in and out, and a lint rule that fails the build on an untraced exported async function or an inline span. Prove it with in-memory-exporter tests before calling it done.

## Step 5: PR 2, wide events

Branch `observability/wide-events`. If PR 1 is still open, branch from it and set PR 1's branch as the base, so the diff shows only the logging work. If PR 1 is merged, branch from the default branch.

Build what [references/wide-events.md](references/wide-events.md) lists: one logger, middleware that emits exactly one event per unit of work in a `finally` block, one `enrich()` function that writes to the event and the root span, a written schema, privacy rules, sampling decided after the request ends, the replacement of existing log calls, and a lint rule against stray logging. Prove it with tests.

## Step 6: the conventions doc

PR 1 creates it from [assets/conventions-doc.md](assets/conventions-doc.md) and PR 2 extends it. It lives at `docs/observability.md`, or wherever the project keeps such docs. It is how the next person, and the next run of this skill, learns what was decided, so keep it short and keep it true.

## Rules that hold in every mode

- **Definitions, not call sites.** A function is traced by wrapping its definition. Inline spans drift, and no tool can tell which ones are missing.
- **Vendor-neutral code.** Changing backend is a config change. With no endpoint set, the app still runs.
- **One event per unit of work.** Handlers add fields; they do not write log lines.
- **Errors are never sampled away.**
- **Tests are the proof.** A clean typecheck does not show that telemetry works.
- **No setup that looks complete and emits nothing.** If part of the system cannot be instrumented, say so in the PR and in the conventions doc.
- **Earlier decisions stand** unless they no longer fit the code. The conventions doc records them.

## Pull requests and the final report

Follow the repository's own conventions for branches, commits and PR descriptions, including any PR skill or template it has. Never push to the default branch. If you cannot push or open PRs from where you are running, leave the branches committed locally and say exactly what is left to do. If an earlier PR from this skill is still open, add to it or report that it is waiting for review; do not open a competing one.

Each PR description covers what was added, how it was verified, what the reviewer needs to set (env vars, secrets), and anything skipped with the reason. PR 2 says that it is stacked on PR 1 when it is.

The final message to the user gives:

- The PR links.
- The backend decision, and whether it was found in the project, chosen by them, or defaulted.
- The env vars to set before telemetry flows.
- Anything that needs their judgment: opt-outs you were unsure about, fields you left out for privacy, parts of the system that could not be instrumented.

## In this repository

Kvitto already has both halves, so the mode here is the maintenance pass.

- **Conventions doc.** The [Tracing section of the architecture doc](../../../docs/architecture.md#tracing) plays that role. Do not create `docs/observability.md`, and do not add a `Last swept` line to the architecture doc; take the sweep's start date from the fallback in [references/maintenance.md](references/maintenance.md).
- **Backend decision, already made.** Backend telemetry stays in the Convex logs, because the free plan has no log streams and queries and mutations cannot make network requests. The app sends spans to PostHog. Do not reopen this without being asked.
- **Tracing helper.** [`traced`, `tracedFetch`, `annotate`, `count` and `annotateFailure`](../../../src/lib/tracing/index.ts), plus the builders in [`convex/serverFunctions.ts`](../../../convex/serverFunctions.ts) that give every backend function its root span and its `request.completed` wide event.
- **Lint rule.** `kvitto/traced-exports` in [`tools/lint-rules/traced-exports.cjs`](../../../tools/lint-rules/traced-exports.cjs), with `fetch` restricted as a global.
- **Wide-event rules.** The vendored [logging-best-practices](../logging-best-practices/SKILL.md) skill holds Boris Tane's rules with worked examples. This skill decides what to build and in which order; that one is the reference for what a good event looks like.
- **Pull requests.** Use [file-pr](../file-pr/SKILL.md), and the project's rule of one reviewable change per PR.

## Credit

The wide-event half of this skill applies the work of Boris Tane ([Logging Sucks](https://loggingsucks.com/)); the tracing half is general OpenTelemetry practice. The full list, and what each source is used for, is in [references/sources.md](references/sources.md). When a user asks why a rule exists, point them to the source rather than guessing.
