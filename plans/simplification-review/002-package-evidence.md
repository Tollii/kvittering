# Plan 002: Parse package evidence once

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: DONE
- Priority: P1
- Effort: M
- Risk: Medium
- Confidence in finding: High
- Depends on: None
- Category: correctness and architecture
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/lib/domain/product-evidence.ts' 'src/lib/domain/product-matching.ts' 'src/lib/domain/purchase-quantities.ts' 'src/lib/domain/product-families.ts' 'src/lib/catalog/matching.ts' 'src/lib/catalog/search.ts' 'convex/kassalapp/normalize.ts' 'src/lib/domain/product-matching.test.ts' 'src/lib/domain/purchase-quantities.test.ts' 'src/lib/catalog/catalog.test.ts' 'src/lib/catalog/search.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

Identity matching, catalog matching, quantity inference, and family naming each parse sizes and packs. Local reproduction confirmed that 50 cl and 500 ml are rejected as different by household matching but accepted by catalog matching. The quantity conflict guard retains catalog evidence for receipt 10BX versus catalog 15BX because it does not recognize BX.

## Target design

Introduce ParsedProductEvidence containing normalized measures, explicit pack counts, variant evidence, and source provenance. Reuse the existing g/ml conversion rules. Parsing must retain ambiguity. Compatibility, ranking, family naming, and purchased-quantity interpretation remain separate policies that consume the same evidence.

## Current state

Source references:
- `src/lib/domain/product-matching.ts:21`
- `src/lib/catalog/matching.ts:13`
- `src/lib/domain/purchase-quantities.ts:9`
- `src/lib/domain/purchase-quantities.ts:25`
- `src/lib/domain/product-families.ts:57`
- `convex/kassalapp/normalize.ts:57`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/lib/domain/product-matching.ts:21

```text
21: function size(item: ProductEvidence) {
22:   if (item.packageSize === null || !item.packageUnit) return null;
23:   const unit = matchingKey(item.packageUnit);
24:   return {
25:     value: item.packageSize * (unit === "kg" || unit === "l" ? 1000 : 1),
```

### src/lib/catalog/matching.ts:13

```text
13:   const size = productSearch(line.name).match(
14:     /\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i,
15:   );
16:   const isWeightOrVolume = /^(kg|g|ml|cl|l)$/i.test(line.packageUnit ?? "");
17:   const amount = isWeightOrVolume
```

### src/lib/domain/purchase-quantities.ts:9

```text
9: export function measure(amount: number, unit: string | null): Measure | null {
10:   const units: Record<string, ["g" | "ml", number]> = {
11:     g: ["g", 1],
12:     kg: ["g", 1000],
13:     ml: ["ml", 1],
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

- `src/lib/domain/product-evidence.ts` (new)
- `src/lib/domain/product-matching.ts`
- `src/lib/domain/purchase-quantities.ts`
- `src/lib/domain/product-families.ts`
- `src/lib/catalog/matching.ts`
- `src/lib/catalog/search.ts`
- `convex/kassalapp/normalize.ts`
- `src/lib/domain/product-matching.test.ts` (test; create only when specified)
- `src/lib/domain/purchase-quantities.test.ts` (test; create only when specified)
- `src/lib/catalog/catalog.test.ts` (test; create only when specified)
- `src/lib/catalog/search.test.ts` (test; create only when specified)

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
| `npm test -- src/lib/domain/product-matching.test.ts src/lib/domain/purchase-quantities.test.ts src/lib/catalog/catalog.test.ts src/lib/catalog/search.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Add table-driven evidence tests for units, pack notation, missing values, and conflicting sources. Use existing purchase-quantities.test.ts and product-matching.test.ts as patterns.

**Verify:** `npm test -- src/lib/domain/product-matching.test.ts src/lib/domain/purchase-quantities.test.ts src/lib/catalog/catalog.test.ts src/lib/catalog/search.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Implement one parser for source measures and pack counts, with distinct receipt and catalog provenance. Use named result types instead of rewriting ReceiptLine to hide conflicting catalog data.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Switch compatibility and quantity evidence to the shared parser, then ranking/family normalization where their semantics overlap. Retain all variant checks and conservative missing-size rules.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Remove superseded parsers and fold matchingKey into an explicit normalized search/identity boundary if it adds no semantic distinction. Keep generated Kassalapp files unchanged.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- 50 cl equals 500 ml; 5 dl equals 500 ml.
- 10BX conflicts with 15BX; 10PK and 10 pk carry the same pack evidence.
- Coca-Cola Original and Zero remain distinct; missing size is still unknown.
- Receipt text, monetary values, and purchased quantity remain unchanged by search normalization.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] Active matching and quantity paths use one unit conversion and pack-evidence parser; the two reproduced inconsistencies have focused tests.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not assume every number followed by x is a consumer multipack. Wholesale packs and ambiguous source descriptions must remain explicit unknowns.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/package-evidence`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Return evidence, not a modified receipt line

quantityEvidence(line: ReceiptLine): ReceiptLine at src/lib/domain/purchase-quantities.ts:25 hides its real responsibility: it removes catalogProduct from the returned line when pack counts conflict. Replace this with a narrow QuantityEvidence value that records which package facts can be used and why other evidence was excluded. parseProductEvidence(input: ProductEvidenceInput): ParsedProductEvidence owns unit/pack parsing; matching and quantity policies consume it without reparsing raw strings. Do not change the stored catalog link merely because quantity evidence is incompatible.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

New Norwegian pack abbreviations require one parser change plus cross-consumer tests.

## Implementation record

One parser now supplies normalized measures, pack candidates, variant facts, and source provenance. Quantity evidence reports catalog pack conflicts without changing the receipt line. The analysis worker was updated to consume that result. Matching, ranking, family naming, and catalog normalization use the shared parser and conversion. Multiplier notation remains ambiguous evidence for the classifier.

Verification: reproduced the cl/dl and BX failures before the change; focused tests, typecheck, lint, all 160 tests, and diff checks passed. No provider calls or deployment were performed.
