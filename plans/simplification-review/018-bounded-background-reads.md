# Plan 018: Replace arbitrary history limits with complete bounded reads

> Executor instructions: This is proposed work. Read the complete plan, implement only after the operator selects it, and update plans/README.md when complete. Application code was not changed during the audit.

## Status

- Status: TODO
- Priority: P2
- Effort: M–L
- Change risk: Medium
- Finding confidence: High
- Depends on: 004, 012 (see plans/README.md for paths)
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- convex/processing.ts convex/digest.ts convex/corrections.ts convex/receipts.ts convex/schema.ts src/app/corrections.tsx src/lib/domain/budget.ts convex/receiptReads.ts convex/receipts.test.ts convex/corrections.test.ts convex/digest.test.ts src/lib/domain/budget.test.ts
git status --short
```

Compare the cited functions with current source. Expected changes from dependency packages can move code; stop if the finding is already fixed or its behavioral assumptions no longer hold.

## Why this matters

Duplicate detection compares only the latest 250 receipts by insertion order. Weekly summaries calculate date-based totals from the latest 300 receipts, and digest dispatch visits only the first 500 subscriptions. These limits bound work but can omit relevant data. Correction history/preview also stop at fixed limits, although they correctly expose truncation. No actual missing recipient or incorrect production summary was observed; these are source-proven coverage limits.

## Target design

Use the required purchase-date or identity candidate range for receipt reads, and cursor continuation for datasets that must be exhausted. Reuse the period-read contract introduced by plan012. Keep each database operation bounded. Correction preview can remain incremental, but the user must be able to continue beyond the initial window. Do not substitute an unbounded collect or a materialized-summary framework.

## Current state

- `convex/processing.ts:190`
- `convex/digest.ts:10`
- `convex/digest.ts:44`
- `convex/corrections.ts:74`
- `convex/corrections.ts:125`
- `convex/schema.ts:203`

### convex/processing.ts:190

```text
190:     ) {
191:       const others = await ctx.db
192:         .query("receipts")
193:         .withIndex("by_householdId", (q) =>
194:           q.eq("householdId", receipt.householdId),
```

### convex/digest.ts:10

```text
10: export const sendAll = internalMutation({
11:   args: {},
12:   returns: v.number(),
13:   handler: async (ctx) => {
14:     if (!(await featureEnabled(ctx, "spendingAnalysis"))) return 0;
```

### convex/digest.ts:44

```text
44:   handler: async (ctx, { householdId }) => {
45:     const household = await ctx.db.get("households", householdId);
46:     if (!household) return null;
47:     // Recent receipts are enough for a week and the running month.
48:     const receipts = await ctx.db
```

## Repository conventions

- Read AGENTS.md and the exact Expo 57 documentation before writing application code. Read Convex guidelines before changing backend functions.
- Keep existing TypeScript, Convex validators, TanStack Query, Vitest, and convex-test patterns. Use convex/catalog.test.ts and convex/receipts.test.ts as backend examples; src/lib/catalog/search.test.ts is a pure-test example.
- Preserve integer øre, receipt evidence, fresh/unlisted products, household isolation, approval learning rules, and release gates.
- Local unsent receipt files and upload progress must survive. No real provider, notification, or deployment calls during tests.
- Keep professional names and small domain operations. Do not add a new state library or generic data-access framework.

## Scope

- `convex/processing.ts`
- `convex/digest.ts`
- `convex/corrections.ts`
- `convex/receipts.ts`
- `convex/schema.ts`
- `src/app/corrections.tsx`
- `src/lib/domain/budget.ts`
- `convex/receiptReads.ts` (new if plan012 has not supplied an equivalent)
- `convex/receipts.test.ts`
- `convex/corrections.test.ts`
- `convex/digest.test.ts` (new)
- `src/lib/domain/budget.test.ts`

Generated Convex files may change only through normal tooling. Plan status files are in scope. Deployments, secrets, AGENTS.md, unrelated UI changes, and other packages are out of scope.

## Steps

### Step 1

Characterize the existing duplicate predicate and the exact date windows weeklyDigest/budget calculations consume. Add fixtures where a relevant receipt is older than the insertion-order window. Record present correction truncation and notification retry semantics before changing reads.

**Verify:** `npm test -- convex/receipts.test.ts convex/corrections.test.ts convex/digest.test.ts src/lib/domain/budget.test.ts` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 2

Replace duplicate candidate loading with a suitable household/date/evidence index range, then apply the existing exact predicate. Keep unknown evidence and current duplicate handling. If a range still exceeds one bounded operation, continue or report unresolved coverage; do not silently treat a truncated candidate set as proof that no duplicate exists.

**Verify:** `npm run typecheck` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 3

Reuse the selected-period read path from plan012 for digest inputs, including comparison periods required by the calculation. Follow cursors to completion in bounded work when needed. Keep CompleteReceiptPeriod scoped to its date/filter evidence and avoid creating a new aggregate table without a measured need.

**Verify:** `npm run typecheck` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 4

Page digest subscriptions with a run boundary and a cursor. Schedule continuation from the existing job/workflow mechanism so later recipients are reached. Keep each device once in the normal traversal and preserve existing delivery failure behavior. A per-batch household result map is sufficient; do not add a global cache. Handle subscriptions created/removed during the run deliberately.

**Verify:** `npm run typecheck` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 5

Add continuation to correction history and preview. Preserve apply's limit of 20 selected targets. Pagination must not skip remaining line matches when one receipt contains more targets than the display batch; page receipt groups or retain an explicit within-receipt continuation. Preserve stale-revision checks at apply time.

**Verify:** `npm run typecheck` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 6

Run focused tests across page boundaries, then the full checks. Review query ranges against their indexes and document remaining explicit limits. Do not claim a billing reduction from projected response fields alone.

**Verify:** `npm test -- convex/receipts.test.ts convex/corrections.test.ts convex/digest.test.ts src/lib/domain/budget.test.ts` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

## Test plan

- A duplicate candidate outside the former latest-250 window is still considered using the same exact identity rule.
- A receipt inserted long ago but belonging to the digest's required period contributes to the correct totals.
- More than 500 subscriptions are traversed without stopping at the first batch or duplicating a device during normal pagination.
- Correction entries and targets beyond the old windows can be reached; one receipt with many matches does not lose targets.
- A correction preview does not authorize a later stale-revision write.
- Missing date/evidence and incomplete coverage are explicit, and all reads remain household-scoped.

## Verification commands

```sh
npm test -- convex/receipts.test.ts convex/corrections.test.ts convex/digest.test.ts src/lib/domain/budget.test.ts
npm run typecheck
npm run lint
npm test
git diff --check
```

Expected: exit 0, all selected tests pass, no type/lint/diff errors. New test files are implementation work. The unchanged audit baseline passed typecheck, lint, and 148 tests across 31 files.

## Function contract acceptance

An index page is not a complete dataset. Return the native pagination metadata for ordinary pages. Only construct a complete-period or completed-scan result after the required cursor range is exhausted. A complete snapshot is tied to the relevant period/evidence; edits can invalidate derived approval or matching decisions.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Done criteria

- [ ] The former arbitrary latest-N limits no longer silently define complete summaries, duplicate coverage, or recipient coverage. Required datasets have a bounded continuation path, and correction truncation remains visible until the user continues.
- [ ] All listed commands pass and named edge cases have focused assertions.
- [ ] Native or controlled-trace checks are recorded separately from unit tests.
- [ ] git diff --name-only shows only in-scope changes.
- [ ] plans/README.md status is updated.

## Stop conditions

Do not expand duplicate matching to name/amount guesses, change report eligibility, weaken correction revision checks, or send real notifications during tests. Do not replace limits with unbounded collect. If completing a range needs a larger reporting system, keep it explicitly incomplete and report that constraint.

Stop if required work falls outside this package or verification continues to fail after a reasonable correction. Do not discard another contributor's work or weaken a test to continue.

## Git workflow

Use the operator's chosen checkout. If a new branch is requested, use refactor/bounded-background-reads. Match the repository's direct imperative commit titles. Do not commit, push, deploy, or publish without an explicit request.

## Maintenance

Keep the read/write distinction and completeness guarantee in the public contract. Review query scope when a consumer gains another period, filter, or evidence requirement. Record actual measurements before claiming cost savings.
