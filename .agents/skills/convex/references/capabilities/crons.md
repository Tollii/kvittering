# Optional capability recipe

Read only for this requested capability. The examples below come from the original imported skill; package versions, service plans, CLI flags, and provider APIs must be checked against the installed version and current official documentation before use. Preserve existing app configuration instead of replacing whole files. Environment, deployment, DNS, and paid operations must be within the user's authorized scope; use the repository backend-operations guide.

# Add scheduled jobs (crons)

Define recurring jobs in convex/crons.ts targeting internal functions, with sane intervals and idempotent handlers.

## Workflow

1. Create convex/crons.ts with cronJobs().
2. Schedule internal functions (never public api.*) at the right interval.
3. Make handlers idempotent (safe to re-run); keep each run small.
4. Verify the job appears in the dashboard schedule.

## Rules

- Schedule internal.* functions, never api.*.
- Keep cron handlers small + idempotent.
- Don't poll tight intervals for things a subscription can push.
