# Plan 012: Load receipt data where it is needed

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: DONE
- Priority: P2
- Effort: M
- Risk: Medium
- Confidence in finding: High
- Depends on: plans/simplification-review/004-purchase-projection.md, plans/simplification-review/007-server-owned-analysis.md
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/features/session.tsx' 'src/app/(tabs)/history.tsx' 'src/app/(tabs)/inbox.tsx' 'src/app/(tabs)/spending.tsx' 'src/app/analysis.tsx' 'src/app/receipt/[id].tsx' 'convex/receipts.ts' 'src/features/receipt-queries.ts' 'convex/schema.ts' 'convex/receipts.test.ts' 'convex/auth.test.ts' 'src/lib/domain/insights.test.ts' 'src/lib/domain/spending-analysis.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

The root household provider automatically exhausts pagination in pages of 100 and keeps full receipt documents in every screen’s context. Detail also loads up to ten extraction snapshots, but the editor never reads its readings prop. A developer must understand whole-history readiness before working on the camera or a single receipt.

## Target design

Keep session context focused on identity and household. Scope inbox/history queries to their screens; scope spending data to selected periods and keep explicit completeness indicators. Use separate detail and diagnostic reads. Do not add precomputed totals tables before a measured need.

## Current state

Source references:
- `src/features/session.tsx:155`
- `src/features/session.tsx:197`
- `convex/receipts.ts:25`
- `convex/receipts.ts:39`
- `src/app/receipt/[id].tsx:130`
- `src/app/(tabs)/spending.tsx:45`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/features/session.tsx:155

```text
155:     { initialNumItems: 100 },
156:   );
157:   const queueSnapshot = useSyncExternalStore(
158:     subscribeStorage,
159:     () =>
```

### src/features/session.tsx:197

```text
197:   useEffect(() => {
198:     if (status === "CanLoadMore") loadMore(100);
199:   }, [status, loadMore]);
200:   const householdId = household?.id;
201:   const synchronize = useCallback(
```

### convex/receipts.ts:25

```text
25: export const list = query({
26:   args: { paginationOpts: paginationOptsValidator },
27:   returns: paginationResultValidator(schema.doc("receipts")),
28:   handler: async (ctx, args) => {
29:     const member = await requireMember(ctx);
```

## Repository conventions and product constraints

- This is an Expo Router / React Native app with a Convex backend, TypeScript, Zod, Vitest, and convex-test.
- Read AGENTS.md and https://docs.expo.dev/versions/v57.0.0/ before writing application code. Match existing naming, two-space TypeScript formatting, and the `@/` source alias.
- Use professional, direct names. Keep behavior in its owning layer. Do not introduce a generic form, repository, workflow, or reporting framework.
- Use `src/lib/domain/receipt-review.test.ts` for pure domain test style and `convex/receipts.test.ts` for authenticated backend test style. Use `src/lib/upload-queue.test.ts` for narrow queue collaborators.
- Receipt money is integer øre. Preserve receipt text as evidence. Classification, catalog identity, and purchased quantity are different decisions.
- Fresh or unlisted grocery products must remain valid. Explicit user choices, household isolation, and intentional product separation must survive.
- Category learning comes from human approval. Automatic approval does not teach category memory. Preserve existing approval thresholds.
- Development data is disposable, but local unsent receipt files and upload progress are not. Do not add a historical backfill unless this package needs one.
- Follow docs/releases.md and docs/observability.md when those concerns are touched. Do not emit receipt contents or credentials into new diagnostics.

## Scope

Only these implementation and test files are in scope. Entries marked new are proposed files. Existing tests may be extended, but do not create empty files merely to satisfy a test filter.

- `src/features/session.tsx`
- `src/app/(tabs)/history.tsx`
- `src/app/(tabs)/inbox.tsx`
- `src/app/(tabs)/spending.tsx`
- `src/app/analysis.tsx`
- `src/app/receipt/[id].tsx`
- `convex/receipts.ts`
- `src/features/receipt-queries.ts` (new)
- `convex/schema.ts`
- `convex/receipts.test.ts` (test; create only when specified)
- `convex/auth.test.ts` (test; create only when specified)
- `src/lib/domain/insights.test.ts` (test; create only when specified)
- `src/lib/domain/spending-analysis.test.ts` (test; create only when specified)

Convex generated files may change only as the output of the normal code-generation workflow when required. Never edit their contents by hand. Plan status files are also in scope.

Out of scope:
- Other packages in this review unless named as a dependency.
- Unrelated visual changes, provider/model changes, new features, broad dependency upgrades, and unrelated schema cleanup.
- Deployments, OTA publication, builds for distribution, secret changes, or changes to AGENTS.md.

## Commands and expected results

The following baseline commands passed at the audited commit: `npm run typecheck`, `npm run lint`, and `npm test` (148 tests in 31 files).
Focused commands below are the implementation gates; new test files must first contain the cases specified in this plan.

| Command | Expected result |
| --- | --- |
| `npm test -- convex/receipts.test.ts convex/auth.test.ts src/lib/domain/insights.test.ts src/lib/domain/spending-analysis.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

List the data each screen actually needs: capture queue, inbox statuses, paginated history, selected spending periods, recent categories, and product price history.

**Verify:** `npm test -- convex/receipts.test.ts convex/auth.test.ts src/lib/domain/insights.test.ts src/lib/domain/spending-analysis.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Add typed bounded query projections and explicit period/status indexes only where the selected query requires them. Keep receipt detail independently addressable.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Move history pagination and report fetching out of HouseholdProvider. Make the history screen load more on user navigation; keep reports visibly incomplete until their selected dataset is complete.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Remove the unused extraction payload from ordinary detail responses. Preserve extractions as diagnostic/audit data and add a separate read only for an actual consumer.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Camera startup does not request all receipt history.
- History still reaches every receipt through pagination.
- Month/week comparisons and price baselines load the complete intended range, including purchases outside the visible page.
- Malformed, deleted, and foreign-household receipt IDs still return the current safe response.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] The session provider does not automatically exhaust receipt pagination. Ordinary detail does not fetch unused extraction history. No report silently calculates from a partial visible page.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not cap history to the first100 and call it complete. Preserve price-history and recent-category requirements when narrowing reads.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/receipt-read-boundaries`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Make read completeness part of the contract

Name the data shape each consumer requests and the completeness guarantee it receives. A fully loaded report period and a paginated history screen are different results. Narrow derived calculations to the fields they need; avoid spreading a full household/session object as their input. Preserve reactive reads and account/household authorization.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Read-scope acceptance

### Bounded pages and complete reports are different contracts

History should load a small first page and continue only on user demand. Opening Capture must not drain household history. Give summary rows a narrow response type; keep original OCR text, catalog decisions, and full analysis out of ordinary list responses. This reduces network payload, not necessarily bytes read from each stored receipt. Add only the household/status/purchase-date index needed by the actual read. Scope periods and comparison windows in the query, and construct a complete-period result only after the requested range is exhausted. Tabs may stay mounted, so move queries behind an explicit active/needed condition where suitable. Preserve global history search across all intended records: filtering only a loaded page, or replacing current substring matching with different token-search behavior, is not equivalent. Keep the full receipt editor and optional image/extraction evidence separately addressable. Plan018 reuses this read contract for background work.

Required check: With synthetic history spanning several pages, Capture requests no history pages, History initially requests one, an older imported receipt still appears in its selected period, and complete totals never use a partial page.

## Maintenance notes

New screens declare their data requirements instead of extending a global SessionData object.

## Implementation record

Removed receipt history from session context. Focused screens own summary pagination, complete period reads, global substring search, and explicit product/price history reads. Added household/date and household/status indexes. Detail no longer reads extraction history. Updated the editor, tab badge, and catalog sheet as necessary dependent consumers beyond the original file list. Reports wait for complete pages; recent categories use an explicit latest-50 scope. Multi-page tests include an older imported receipt. All 190 tests pass. Native tab navigation remains unverified.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, and `git diff --check` passed. No deployment was performed.
