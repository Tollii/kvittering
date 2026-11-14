# PR 2: wide events

Branch: `observability/wide-events`. If PR 1 is still open, branch from it and set PR 1's branch as the base, so the diff shows only the logging work. If PR 1 is merged, branch from the default branch.

## Who decides what

The logging rules are not this skill's. They belong to Boris Tane's `logging-best-practices` skill, used as he wrote it. This file does not restate, summarize or adjust them. It covers only what his skill cannot know: how the event ties to the tracing from PR 1, how the work is enforced and proven, and how it ships.

If anything in this skill seems to disagree with one of his rules, his rule wins, with one exception: the rule below about what stays out of an event. Say so in the final report, so this skill can be corrected.

## Step 1: get his skill and read all of it

1. **Find it.** Look for a `logging-best-practices` folder among the repository's agent skills. In this repository it is at [`.agents/skills/logging-best-practices`](../../logging-best-practices/SKILL.md).
2. **Install it if it is missing.** From the repository root:

   ```sh
   npx add-skill boristane/agent-skills --skill "logging-best-practices"
   ```

   Choose a project-local install if the command asks, and check that the folder landed inside the repository, next to its other agent skills, before going on. Commit the installed files in PR 2 as they arrive. Do not edit them; a changed copy can no longer be updated from upstream by running the command again.
3. **Read it in full before writing any logging code:** its `SKILL.md`, then every file under `rules/` ([wide-events](../../logging-best-practices/rules/wide-events.md), [context](../../logging-best-practices/rules/context.md), [structure](../../logging-best-practices/rules/structure.md), [pitfalls](../../logging-best-practices/rules/pitfalls.md)). Its frontmatter turns off automatic loading, so nothing reads it unless you do.
4. **If it cannot be installed**, for example with no network, read [Logging Sucks](https://loggingsucks.com/), which is where the rules come from. If neither can be reached, stop before the logging work and report that, instead of writing the rules from memory.

## Step 2: build the logging his skill describes

Apply his skill to every unit of work the survey found. What an event contains, how it is structured, the logger, the levels and the middleware are all decided there.

One clarification for this workflow: PR 1 gave every unit of work a root span, not only HTTP requests. Each of them gets its event too: a job run, a consumed message, a webhook, a CLI command.

## Step 3: tie the event to the trace

This is the part his skill leaves open, because it does not assume tracing exists. [assets/wide-event-middleware.md](../assets/wide-event-middleware.md) shows the few lines involved.

- **Trace and span ids on the event.** The event carries the trace id and span id of the unit of work's root span, so an event leads to its trace and back.
- **One `enrich()` for handlers.** It writes each field to the wide event his middleware created, never to a second object, and to the root span, so the two always agree and nobody maintains two sets of fields. The event keeps the shape his rules give the fields, nested objects included; the span gets the same fields flattened to dotted keys, because a span attribute cannot hold an object. The middleware keeps a reference to the root span, because handlers call `enrich()` from inside traced helpers, where the active span is a child.
- **The same names as the request context.** The fields PR 1 puts on every span (request id, user id, tenant id, route, entity ids) appear on the event under the same names.

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

- [ ] `logging-best-practices` is in the repository, unmodified, or the PR says why it is not and that Logging Sucks was used instead.
- [ ] The lint rule runs in CI and reports nothing.
- [ ] The four tests above pass.
- [ ] The conventions doc holds the event's schema and the fields left out for privacy.
- [ ] The PR description says whether it is stacked on PR 1.
