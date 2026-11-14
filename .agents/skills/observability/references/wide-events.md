# PR 2: wide events

Branch: `observability/wide-events`. If PR 1 is still open, branch from it and set PR 1's branch as the base, so the diff shows only the logging work. If PR 1 is merged, branch from the default branch.

## Who decides what

The logging rules are not this skill's. They belong to Boris Tane's `logging-best-practices` skill, embedded here exactly as he wrote it. This file does not restate, summarize or adjust them. It covers only what his skill cannot know: how the event ties to the tracing from PR 1, how the work is enforced and proven, and how it ships.

If anything in this skill seems to disagree with one of his rules, his rule wins, with one exception: the rule below about what stays out of an event. Say so in the final report, so this skill can be corrected.

## Step 1: read all of his skill

A verbatim copy travels with this skill, in [vendor/logging-best-practices](../vendor/logging-best-practices/SKILL.md), so there is nothing to install. Read it in full before writing any logging code: its `SKILL.md`, then every file under `rules/`:

- [wide-events.md](../vendor/logging-best-practices/rules/wide-events.md): the pattern, request correlation, emitting in `finally`.
- [context.md](../vendor/logging-best-practices/rules/context.md): cardinality, business context, environment fields.
- [structure.md](../vendor/logging-best-practices/rules/structure.md): single logger, middleware, JSON, levels.
- [pitfalls.md](../vendor/logging-best-practices/rules/pitfalls.md): the common mistakes.

Do not edit that folder. [UPSTREAM.md](../vendor/logging-best-practices/UPSTREAM.md) records where it comes from and how to update it.

## Step 2: build the logging his skill describes

Apply his skill to every unit of work the survey found. What an event contains, how it is structured, the logger, the levels and the middleware are all decided there.

One clarification for this workflow: PR 1 gave every unit of work a root span, not only HTTP requests. Each of them gets its event too: a job run, a consumed message, a webhook, a CLI command.

## Step 3: tie the event to the trace

This is the part his skill leaves open, because it does not assume tracing exists. [assets/wide-event-middleware.md](../assets/wide-event-middleware.md) shows the few lines involved.

- **Trace and span ids on the event.** The event carries the trace id and span id of the unit of work's root span, so an event leads to its trace and back.
- **One `enrich()` for handlers.** It writes each field to the wide event his middleware created, never to a second object, and to the root span, so the two always agree and nobody maintains two sets of fields. The event keeps the shape his rules give the fields, nested objects included; the span gets the same fields flattened to dotted keys, because a span attribute cannot hold an object. The middleware keeps a reference to the root span, because handlers call `enrich()` from inside traced helpers, where the active span is a child.
- **The request context is on the event too.** The values PR 1 puts on every span (request id, user id, tenant id, route, entity ids) also appear on the event. Name and shape them there as his rules say, not as the span does; the conventions doc records which event field matches which span attribute.

## Step 4: replace what is there, and keep it replaced

Go through every existing `console.*` and logger call and bring it under his rules. Then add a lint rule in the project's linter, so the work does not erode: outside the logger module, `console.*` and any logger other than the shared one are errors. This mirrors the tracing rule from PR 1.

## One addition that is not from his skill

His skill does not cover what must stay out of an event, and this skill does not leave that open. Record ids, not personal data. Keep passwords, tokens, auth headers, payment details and request or response bodies out of events. Prefer a user id to an email address. Where a field is useful but sensitive, leave it out and note the decision in the conventions doc.

This rule is the skill owner's, not Boris Tane's. Where his examples log something this rule excludes, this rule wins.

## Sampling

Keep every event. His skill does not sample, and most projects do not have the volume to need it. If volume ever forces the question, follow the tail-sampling rules in [Logging Sucks](https://loggingsucks.com/) and write the decision into the conventions doc.

## Prove it works

Tests show that:

- A successful unit of work emits exactly one event.
- One that throws still emits exactly one event, with its error recorded.
- The event carries the trace id of the root span.
- A field added through `enrich()` appears on both the event and the root span.

Then run lint, typecheck and the test suite.

## Done when

- [ ] The lint rule runs in CI and reports nothing.
- [ ] The four tests above pass.
- [ ] The conventions doc holds the event's schema and the fields left out for privacy.
- [ ] The PR description says whether it is stacked on PR 1.
