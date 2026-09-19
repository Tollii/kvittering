# Plan 008: Resolve purchased product identity once

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P2
- Effort: L
- Risk: High
- Confidence in finding: High for duplicate mechanism; medium for final schema design
- Depends on: plans/simplification-review/002-package-evidence.md, plans/simplification-review/006-receipt-write-policy.md
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'convex/products.ts' 'convex/productMatching.ts' 'convex/catalogLinks.ts' 'convex/catalogMatching.ts' 'convex/processing.ts' 'convex/receipts.ts' 'convex/schema.ts' 'src/lib/domain/receipt.ts' 'src/features/receipt-line-editor.tsx' 'src/app/receipt/[id].tsx' 'convex/products.test.ts' 'convex/catalog.test.ts' 'convex/catalogClassifier.test.ts' 'convex/receipts.test.ts' 'src/lib/domain/product-matching.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

Processing first matches or creates a household product. Catalog matching later searches only catalog-backed household rows and may insert another product row, replacing the line link. Product identity is then expressed as productId, productName, productKey, catalogProduct, and productMatchManual. productKey also means a category alias in some paths. The UI sends two overlapping change arrays.

## Target design

Use one ProductReference union: unresolved, explicitly separate, catalog identity, or household product identity, with explicit decision provenance. Retain household products for fresh/unlisted goods. Resolve saved manual choices, catalog candidates, and household candidates in one operation; create a new household product only when the selected outcome needs one. Families remain a separate cross-package grouping.

## Current state

Source references:
- `convex/processing.ts:87`
- `convex/processing.ts:252`
- `convex/catalogLinks.ts:17`
- `convex/catalogLinks.ts:28`
- `convex/schema.ts:155`
- `src/lib/domain/receipt.ts:39`
- `src/app/receipt/[id].tsx:354`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### convex/processing.ts:87

```text
87:       const matches = await step.runAction(internal.productMatching.match, {
88:         id: args.id,
89:         data: prepared,
90:       });
91:       stage = "finish";
```

### convex/processing.ts:252

```text
252:         if (decision?.kind === "new")
253:           productId = await createProduct(
254:             ctx,
255:             receipt.householdId,
256:             retailer,
```

### convex/catalogLinks.ts:17

```text
17:   const existing = await ctx.db
18:     .query("products")
19:     .withIndex("by_householdId_and_retailer_and_catalogKey", (q) =>
20:       q
21:         .eq("householdId", householdId)
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

- `convex/products.ts`
- `convex/productMatching.ts`
- `convex/catalogLinks.ts`
- `convex/catalogMatching.ts`
- `convex/processing.ts`
- `convex/receipts.ts`
- `convex/schema.ts`
- `src/lib/domain/receipt.ts`
- `src/features/receipt-line-editor.tsx`
- `src/app/receipt/[id].tsx`
- `convex/products.test.ts` (test; create only when specified)
- `convex/catalog.test.ts` (test; create only when specified)
- `convex/catalogClassifier.test.ts` (test; create only when specified)
- `convex/receipts.test.ts` (test; create only when specified)
- `src/lib/domain/product-matching.test.ts` (test; create only when specified)

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
| `npm test -- convex/products.test.ts convex/catalog.test.ts convex/catalogClassifier.test.ts convex/receipts.test.ts src/lib/domain/product-matching.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Inventory every current use of household product IDs, catalog snapshots, aliases, and manual separation. Characterize fresh/unlisted products and cross-store catalog identity in tests.

**Verify:** `npm test -- convex/products.test.ts convex/catalog.test.ts convex/catalogClassifier.test.ts convex/receipts.test.ts src/lib/domain/product-matching.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Define ProductReference and one product-change command union shared by UI and server. Rename the category-alias marker so it cannot be confused with catalog identity.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Choose direct catalog references as the default target. If existing consumers require household rows, adopt/enrich a compatible existing row rather than create a second identity. Keep this as an explicit design decision.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Consolidate the two selection passes and remove the obsolete change arrays/lookup branches after all consumers use the selected model. Preserve the existing Noul threshold and ambiguity checks.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- A new receipt line that later matches the catalog does not create two household identities.
- Fresh baguettes and explicit separate choices still work.
- Original/Zero and differing pack sizes remain distinct.
- Category memory, quantity families, price signals, and correction undo retain identity semantics.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] One identity decision determines one typed line reference. Catalog records are not mirrored as additional household identities without a documented need.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not delete products/productMappings merely to reduce table count. If direct catalog references would lose household-specific choices, retain a narrow household identity.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/product-identity-resolution`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Product commands must expose their input and output

correctProducts at convex/products.ts:198 and linkCatalogProduct at convex/catalogLinks.ts:8 both write database state and modify the ReceiptData/ReceiptLine argument. The Promise<void> shape leaves that output implicit. Introduce a ProductSelection command with separate catalog, household, new-household, and deliberately-separate alternatives. Resolve database facts in the mutation, compute a typed line change in a pure helper, and persist it. The mutation returns only an ID or small acknowledgement; a query supplies the persisted receipt/line. Do not expose a createNew boolean alongside a nullable productId, and do not let a supposedly pure helper write mappings. Preserve a single transaction for the link and remembered mapping.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

Treat this as a staged refactor. No broad rewrite or dual-write migration system is required for disposable development data; preserve retained local drafts if their payload changes.
