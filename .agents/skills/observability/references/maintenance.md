# Maintenance pass

This runs when both halves already exist. Read the conventions doc first; it says what was decided and why, and those decisions stand unless they no longer fit the code.

## Where the sweep starts

Use the `Last swept` date in the conventions doc. If the doc has none, fall back to the date of the last merged change to the tracing helper or its lint rule:

```sh
git log -1 --format=%cs -- <tracing helper> <lint rule>
```

`scripts/survey.sh <date>` lists the source files changed since then.

## The pass

1. **Run the lint rules.** New untraced functions and stray `console` calls show up here.
2. **Check the rules themselves.** Read the files changed since the start date; do not only lint them. If you find an untraced async function or a scattered log that lint passed, the rule has a hole. Fix the rule as well as the code, or the same gap returns.
3. **Review what lint cannot judge**, in the changed files first and then more widely as time allows:
   - New handlers enrich the wide event with business context, not only the fields the middleware sets.
   - New kinds of work (a new job, consumer or webhook) have their own root span and their own event.
   - New outgoing calls carry trace context.
   - New fields follow the schema, and none of them holds personal data or secrets.
   - New feature flags are recorded on the event.
   - Opt-out comments still have reasons that hold.
   - Thresholds and the sample rate still make sense.
   - The telemetry dependencies are current and not deprecated.
4. **Open PRs only where something changed.** Keep the same split: tracing fixes on `observability/tracing-<date>`, logging fixes on `observability/wide-events-<date>`. Skip whichever is empty. Update `Last swept` in a PR you open, where the conventions doc keeps one.
5. **If everything is in order, open nothing.** Report what you checked and that it held.

If an earlier PR from this skill is still open, do not open a competing one. Add to it, or report that it is waiting for review.

## What the report says

- The start date used and how many files were read.
- Each gap found, and whether the fix was to the code, the lint rule, or both.
- Anything left for the user's judgment, such as an opt-out whose reason no longer holds.
