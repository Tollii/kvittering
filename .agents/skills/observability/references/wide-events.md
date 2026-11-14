# PR 2: wide events

Branch: `observability/wide-events`. If PR 1 is still open, branch from it and set PR 1's branch as the base, so the diff shows only the logging work. If PR 1 is merged, branch from the default branch.

This file applies Boris Tane's writing on wide events; see [sources.md](sources.md). If you can fetch it, read [Logging Sucks](https://loggingsucks.com/) before starting. The summary here is enough to work from if the page is unreachable.

Where the repository vendors his `logging-best-practices` skill, as this one does, its rule files hold the worked examples and this file does not repeat them:

- [wide-events.md](../../logging-best-practices/rules/wide-events.md): the pattern, request correlation, emitting in `finally`.
- [context.md](../../logging-best-practices/rules/context.md): cardinality, business context, environment fields.
- [structure.md](../../logging-best-practices/rules/structure.md): single logger, middleware, JSON, levels.
- [pitfalls.md](../../logging-best-practices/rules/pitfalls.md): the common mistakes.

Its examples show the pattern, not a schema. Where their field names differ from the project's written schema, the project's schema wins.

## The idea

Log lines describe what the code was doing. What you need during an incident is what happened to a request, in a form you can query. So each unit of work emits exactly one event with everything known about it: who, what, how long, which deploy, what went wrong. Twenty lines scattered through a handler become twenty fields on one event.

## What to build

### 1. One logger

Configured once and imported everywhere, writing single-line JSON. Two levels are enough: `info` for wide events and `error` for failures that need a person.

### 2. Middleware that owns the event's lifecycle

It creates the event when the request starts, puts it in request context, and emits it once in a `finally` block, so it fires on success and on failure alike. Start from [assets/wide-event-middleware.md](../assets/wide-event-middleware.md).

### 3. Handlers only add business context

Give them one `enrich()` function. It writes each field to the wide event and to the root span, so the trace and the event always agree and nobody maintains two sets of fields.

### 4. The same for every other unit of work

One event per job run, per consumed message, per webhook, per CLI command.

### 5. Fields

Aim for wide. Fifty fields is normal.

| Group | Fields |
| --- | --- |
| Request | timestamp, request id, trace id, span id, method, route pattern, status code, duration, outcome |
| Deployment | service, version, commit, deployment id, environment, region, instance |
| Who | user id, tenant id, plan or tier, and anything that changes how urgent a failure is |
| What | ids, counts and amounts for the domain entities the request touched; latency and attempt number for each external provider called |
| Errors | type, code, message, whether it can be retried, and the provider's own error code |
| Flags | feature flags that were active for the request |

### 6. Naming

One schema for the whole project, written down in the conventions doc. Use OpenTelemetry semantic-convention names where they exist and one project prefix for business fields. The same thing has the same name in every service; `user_id` in one place and `userId` in another makes cross-service queries fail quietly.

### 7. Privacy

Record ids, not personal data. Keep passwords, tokens, auth headers, payment details and request or response bodies out of events. Prefer a user id to an email address. Where a field is useful but sensitive, leave it out and note the decision in the conventions doc.

### 8. Sampling, decided after the request ends

Write `shouldKeep` so that it:

- always keeps errors;
- always keeps requests slower than a threshold (start near the p99);
- always keeps flagged cases: important tenants, internal test accounts, requests under a feature flag being rolled out;
- keeps a configurable share of the rest, defaulting to 100%.

Sampling is a cost control, and most projects do not have the volume to need it yet. The point of building it now is that when volume grows, the cut is one config value and never drops an error.

Leave trace sampling at its default. If trace volume ever needs tail sampling, that belongs in a collector, and the conventions doc should say so.

### 9. Replace what is there

Go through every existing `console.*` and logger call:

| The call | What happens to it |
| --- | --- |
| Inside a unit of work, carrying data | Becomes a field on the event; the line is deleted |
| A message with no data in it | Deleted |
| Startup and shutdown lines outside any request | Can stay, as structured logs through the one logger |

### 10. A lint rule

`console.*` and any logger other than the shared one are errors outside the logger module.

## Prove it works

Tests show that:

- A successful request emits exactly one event.
- A request that throws still emits exactly one event, with the error fields set.
- The event carries the trace id of the request's root span.
- An error is kept even with the sample rate at zero.

Then run lint, typecheck and the test suite.

## Done when

- [ ] The lint rule runs in CI and reports nothing.
- [ ] The four tests above pass.
- [ ] The conventions doc holds the schema, the sampling rules and thresholds, and the fields left out for privacy.
- [ ] The PR description says whether it is stacked on PR 1.
