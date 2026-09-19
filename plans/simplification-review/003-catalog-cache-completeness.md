# Plan 003: Distinguish a catalog summary from fetched details

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: DONE
- Priority: P1
- Effort: S–M
- Risk: Low–medium
- Confidence in finding: High
- Depends on: None
- Category: correctness and architecture
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'convex/schema.ts' 'convex/catalog.ts' 'convex/catalogQueue.ts' 'convex/catalog.test.ts' 'src/features/catalog-queries.ts' 'src/lib/catalog/catalog.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

catalogProducts has one fetchedAt for search summaries and detail responses. A fresh search result therefore satisfies the 30-day detail freshness check. Opening that product can skip the details endpoint even though detail data was never fetched. A comment promises to preserve richer details, but the model cannot tell which rows contain them.

## Target design

Keep catalogProducts. Add explicit detail freshness, for example detailsFetchedAt?: number, alongside summary freshness. Define one merge rule: summaries can fill identity gaps but cannot mark details fresh or erase richer values. A detail request can validly return empty nutrition; completeness refers to the request performed, not populated fields.

## Current state

Source references:
- `convex/schema.ts:134`
- `convex/catalogQueue.ts:185`
- `convex/catalogQueue.ts:204`
- `convex/catalog.ts:107`
- `src/lib/catalog/policy.ts:6`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### convex/schema.ts:134

```text
134:   catalogProducts: defineTable({
135:     key: v.string(),
136:     product: catalogProductValidator,
137:     fetchedAt: v.number(),
138:   }).index("by_key", ["key"]),
```

### convex/catalogQueue.ts:185

```text
185:       // Search results do not replace recently fetched details with a poorer record.
186:       if (
187:         existing &&
188:         request.request.kind !== "details" &&
189:         existing.fetchedAt + catalogDetailsTtl > now
```

### convex/catalogQueue.ts:204

```text
204:       const value = { key: product.key, product, fetchedAt: now };
205:       if (existing)
206:         await ctx.db.replace("catalogProducts", existing._id, value);
207:       else await ctx.db.insert("catalogProducts", value);
208:     }
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

- `convex/schema.ts`
- `convex/catalog.ts`
- `convex/catalogQueue.ts`
- `convex/catalog.test.ts`
- `src/features/catalog-queries.ts`
- `src/lib/catalog/catalog.test.ts` (test; create only when specified)

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
| `npm test -- convex/catalog.test.ts src/lib/catalog/catalog.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Add a convex-test case: store a search summary, open product details, and assert a details request is scheduled.

**Verify:** `npm test -- convex/catalog.test.ts src/lib/catalog/catalog.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Introduce explicit detail freshness and a small canonical merge function. Update succeed so only kind=details advances it.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Keep existing data visible while refreshing and on failure. Use short retry freshness for failed product-detail queries, consistent with search behavior.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Regenerate Convex types using the project workflow only when implementation is authorized; do not manually edit generated files. No broad historical backfill is needed for disposable development data.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Search summary triggers one shared detail request.
- A recent detail response prevents repeated detail calls.
- A later search cannot erase nutrition or claim renewed detail freshness.
- An empty successful detail response is cached; 429 retains prior data and retry behavior.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] Only an actual details response can make detail data fresh. Existing shared requests and the 30-day successful detail TTL remain.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not infer completeness from non-empty ingredient or nutrition fields. Do not add another cache table or client cache library.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/catalog-cache-completeness`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Cache freshness is an explicit input

Make the merge a pure operation over the previous cache entry, a discriminated summary/detail response, and fetchedAt. Its return type is the complete next cache entry. Do not read Date.now() inside the merge or infer detail completeness from populated fields. Fetching and database writes stay in the queue handler.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

When a new catalog endpoint is added, specify which fields and freshness state it owns.

## Implementation record

Added optional detail-fetch time, a pure canonical merge, and short error freshness in the product-detail hook. Only a detail response advances detail freshness. Summary merges preserve richer values even after expiry. A successful detail response with empty nutrition remains complete. Existing data remains available during retries.

Verification: reproduced summary-as-detail freshness failure, then passed typecheck, lint, all 162 tests, and diff checks. Generated types derive directly from the schema; no generated edit or deployment was needed. No live provider calls were made.
