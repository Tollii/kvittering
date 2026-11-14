# Maintenance pass

This runs when both halves already exist. Read the conventions doc first; it says what was decided and why, and those decisions stand unless they no longer fit the code.

## Where the sweep starts

Take the first date that exists:

1. The `Last swept` date, in the conventions doc or wherever the project records it.
2. The merge date of the last pull request this skill opened, found on the code host by its `observability/` branch name.
3. The date the tracing helper was added, which means reading everything written since setup:

   ```sh
   git log --diff-filter=A --format=%cs -- <tracing helper> | tail -1
   ```

Do not use the date the helper or its lint rule last changed. They change for unrelated reasons, and a sweep that starts there skips the code written before that change.

`scripts/survey.sh <date>` lists the source files changed since the start date.

## The pass

1. **Run the lint rules.** New untraced functions and stray `console` calls show up here.
2. **Check the rules themselves.** Read the files changed since the start date; do not only lint them. If you find an untraced async function or a scattered log that lint passed, the rule has a hole. Fix the rule as well as the code, or the same gap returns.
3. **Review what lint cannot judge**, in the changed files first and then more widely as time allows:
   - New handlers enrich the wide event with business context, not only the fields the middleware sets. Judge new logging against the `logging-best-practices` skill, read again for the pass, not against memory of it.
   - New kinds of work (a new job, consumer or webhook) have their own root span and their own event.
   - New outgoing calls carry trace context.
   - New fields follow the schema, and none of them holds personal data or secrets.
   - New feature flags are recorded on the event.
   - Opt-out comments still have reasons that hold.
   - If sampling was ever added, its thresholds and rate still make sense.
   - The telemetry dependencies are current and not deprecated.
4. **Open PRs only where something changed.** Keep the same split: tracing fixes on `observability/tracing-<date>`, logging fixes on `observability/wide-events-<date>`. Skip whichever is empty. Update `Last swept` in a PR you open.
5. **If everything is in order, open nothing.** Report what you checked and that it held.

## What the report says

- The start date used and how many files were read.
- Each gap found, and whether the fix was to the code, the lint rule, or both.
- Anything left for the user's judgment, such as an opt-out whose reason no longer holds.
