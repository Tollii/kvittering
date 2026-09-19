# Plan 017: Observe catalog completion without polling mutations

> Executor instructions: This is proposed work. Read the complete plan, implement only after the operator selects it, and update plans/README.md when complete. Application code was not changed during the audit.

## Status

- Status: DONE
- Priority: P2
- Effort: M
- Change risk: Medium
- Finding confidence: High
- Depends on: 003, 015 (see plans/README.md for paths)
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- src/features/catalog-queries.ts src/features/receipt-line-editor.tsx src/lib/catalog/model.ts src/lib/catalog/policy.ts convex/catalog.ts convex/catalogQueue.ts convex/catalog.test.ts src/lib/catalog/catalog.test.ts src/lib/catalog/search.test.ts src/lib/catalog-request-state.ts src/lib/catalog-request-state.test.ts
git status --short
```

Compare the cited functions with current source. Expected changes from dependency packages can move code; stop if the finding is already fixed or its behavioral assumptions no longer hold.

## Why this matters

Catalog search, product detail, and price hooks poll their mutation endpoints every two seconds while a request is pending. The shared request cache prevents another external Kassalapp request, but each poll still calls Convex, checks request/policy state, and can emit catalog.request_reused. A two-minute Retry-After delay can therefore generate about sixty polling calls for one lookup. This is an interval-based estimate, not a measured production trace. The household-product selector also changes remote query arguments on every keystroke.

## Why reactivity applies

Receipt list and detail queries already use Convex subscriptions. These catalog hooks instead repeat mutations through TanStack Query. A mutation starts work and returns one snapshot; a query subscription observes subsequent database writes. Backend workflow events already notify other backend steps, but do not create a client subscription.

Keep the responsibilities separate: explicit ensure/refresh mutation, bounded result query, and persisted terminal cache. Reactivity removes the timer and repeated ensure calls; it does not fetch external data or replace server retry scheduling. Use the existing shared request cache.

## Target design

Separate the command that ensures work exists from the read that observes its result. Ensure once for a normalized lookup or deliberate refresh; return only a lookup ID or small acknowledgement. Read pending and terminal results through a scoped Convex query; write the final result into the existing TanStack cache and dispose the pending subscription. Keep the successful-result TTLs, cached fallback, graceful 429 handling, and shared request table. Debounce normalized household-product terms using the existing catalog search behavior as a guide.

## Current state

- `src/features/catalog-queries.ts:43`
- `src/features/catalog-queries.ts:54`
- `src/features/catalog-queries.ts:67`
- `convex/catalogQueue.ts:59`
- `convex/catalog.ts:35`
- `src/features/receipt-line-editor.tsx:526`

### src/features/catalog-queries.ts:43

```text
43:     refetchInterval: (query) =>
44:       query.state.data?.status === "pending" ? 2000 : false,
45:   });
46: }
47: export function useCatalogProduct(key: string) {
```

### src/features/catalog-queries.ts:54

```text
54:     refetchInterval: (query) =>
55:       query.state.data?.status === "pending" ? 2000 : false,
56:   });
57: }
58: export function useCatalogPrices(key: string, enabled: boolean) {
```

### src/features/catalog-queries.ts:67

```text
67:     refetchInterval: (query) =>
68:       query.state.data?.status === "pending" ? 2000 : false,
69:   });
70: }
```

## Repository conventions

- Read AGENTS.md and the exact Expo 57 documentation before writing application code. Read Convex guidelines before changing backend functions.
- Keep existing TypeScript, Convex validators, TanStack Query, Vitest, and convex-test patterns. Use convex/catalog.test.ts and convex/receipts.test.ts as backend examples; src/lib/catalog/search.test.ts is a pure-test example.
- Preserve integer øre, receipt evidence, fresh/unlisted products, household isolation, approval learning rules, and release gates.
- Local unsent receipt files and upload progress must survive. No real provider, notification, or deployment calls during tests.
- Keep professional names and small domain operations. Do not add a new state library or generic data-access framework.

## Scope

- `src/features/catalog-queries.ts`
- `src/features/receipt-line-editor.tsx`
- `src/lib/catalog/model.ts`
- `src/lib/catalog/policy.ts`
- `convex/catalog.ts`
- `convex/catalogQueue.ts`
- `convex/catalog.test.ts`
- `src/lib/catalog/catalog.test.ts`
- `src/lib/catalog/search.test.ts`
- `src/lib/catalog-request-state.ts` (new if needed)
- `src/lib/catalog-request-state.test.ts` (new)

Generated Convex files may change only through normal tooling. Plan status files are in scope. Deployments, secrets, AGENTS.md, unrelated UI changes, and other packages are out of scope.

## Steps

### Step 1

Define a typed pending observation input and result. Prefer reconstructing the normalized request key from the original lookup arguments on the server. Product catalog results are shared, but store searches must retain receipt ownership checks. Do not expose the current internal request-read endpoint as an unrestricted public ID lookup.

**Verify:** `npm test -- convex/catalog.test.ts src/lib/catalog/catalog.test.ts src/lib/catalog/search.test.ts src/lib/catalog-request-state.test.ts` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 2

Add a read-only result query using the existing indexed catalogRequests entry. Keep membership, applicable client policy, and feature checks. Starting or refreshing work remains an explicit mutation; the query must not enqueue work.

**Verify:** `npm run typecheck` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 3

Update the hooks so the existing cache owns lookup freshness and the pending subscription owns completion observation. Dispose observation on key change, completion, account change, or unmount. Copy only the result for the matching lookup into the cache; do not let an old search replace the current term.

**Verify:** `npm run typecheck` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 4

Remove fixed two-second mutation polling. Preserve display of prior data during refresh and failure. An absent or expired entry may trigger a bounded ensure operation, not a render loop or query-initiated write. Keep Retry-After scheduling in the backend.

**Verify:** `npm run typecheck` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 5

Debounce the household-product selector's normalized remote search term. Preserve its empty-search recent-products list and immediate text entry. Do not add a debounce to purely local filtering.

**Verify:** `npm run typecheck` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

### Step 6

Run focused tests and the full checks. Inspect a controlled development trace with a delayed/429 catalog response: one ensure followed by observation, no repeated mutation loop, no raw query text in new diagnostics.

**Verify:** `npm test -- convex/catalog.test.ts src/lib/catalog/catalog.test.ts src/lib/catalog/search.test.ts src/lib/catalog-request-state.test.ts` must exit 0. New defect tests should first fail on the old path, then pass after the corresponding change. Do not leave a step without its verification result.

## Test plan

- A pending lookup does not call the ensure mutation every two seconds.
- Two consumers share the existing backend request; cached ready data avoids another ensure until the normal refresh condition.
- Delayed success updates the matching cache key only, including after a rapid search-term change.
- 429 preserves old data and honors the backend retry time without a foreground polling loop.
- Signing out/unmounting disposes observation, and a different household cannot observe receipt-owned store context.
- Typing in the household-product selector requests the settled normalized term while preserving empty search.

## Verification commands

```sh
npm test -- convex/catalog.test.ts src/lib/catalog/catalog.test.ts src/lib/catalog/search.test.ts src/lib/catalog-request-state.test.ts
npm run typecheck
npm run lint
npm test
git diff --check
```

Expected: exit 0, all selected tests pass, no type/lint/diff errors. New test files are implementation work. The unchanged audit baseline passed typecheck, lint, and 148 tests across 31 files.

## Function contract acceptance

A catalog lookup command may schedule work. A catalog observation query only reads. Give their inputs/results separate names and preserve pending, ready, and failed states with the fields each state needs. A typed catalog result does not prove a receipt-product match.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Done criteria

- [ ] Pending catalog work is observed through a scoped read contract instead of repeated mutation calls. Cached results and retry behavior remain correct, and the product selector no longer sends each keystroke.
- [ ] All listed commands pass and named edge cases have focused assertions.
- [ ] Native or controlled-trace checks are recorded separately from unit tests.
- [ ] git diff --name-only shows only in-scope changes.
- [ ] plans/README.md status is updated.

## Stop conditions

Do not remove authorization or client-policy enforcement to make a read query easier. Do not merge the catalog and policy QueryClients, replace TanStack Query, add a rate limiter, or create another request/cache table. If cache synchronization requires a new state-management layer, stop and simplify the design.

Stop if required work falls outside this package or verification continues to fail after a reasonable correction. Do not discard another contributor's work or weaken a test to continue.

## Git workflow

Use the operator's chosen checkout. If a new branch is requested, use refactor/catalog-request-observation. Match the repository's direct imperative commit titles. Do not commit, push, deploy, or publish without an explicit request.

## Maintenance

Keep the read/write distinction and completeness guarantee in the public contract. Review query scope when a consumer gains another period, filter, or evidence requirement. Record actual measurements before claiming cost savings.

## Implementation record

Added explicit ensure and scoped read-only observation contracts. New hooks have no polling timer and retain terminal data in TanStack Query; pending lookups subscribe until completion. Old mutation endpoints remain as installed-client adapters. Household searches use settled normalized input. All 189 tests pass, including no-write observation and receipt ownership checks. A controlled native 429 trace remains unverified.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, and `git diff --check` passed. No deployment was performed.
