# Plan 014: Keep classification evidence and taxonomy typed

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P2
- Effort: M
- Risk: Low–medium
- Confidence in finding: High
- Depends on: None
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/lib/domain/classification.ts' 'src/lib/domain/receipt.ts' 'src/lib/domain/categories.ts' 'src/lib/domain/corrections.ts' 'src/lib/domain/insights.ts' 'convex/providers.ts' 'convex/correctionEvaluation.ts' 'convex/corrections.ts' 'related classification/correction tests' 'src/lib/domain/receipt.test.ts' 'convex/corrections.test.ts' 'convex/catalogClassifier.test.ts' 'src/lib/domain/insights.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

classificationInputs constructs an object, converts it to JSON text, and classificationState parses it back as arbitrary JSON. Taxonomy leaves are encoded as a delimiter string and classifier descriptions live in a separate string-keyed map. These internal boundaries discard type information that already exists.

## Target design

Define ClassificationEvidence and a shared validator. Send the object directly to Jev and correction evaluation. Define taxonomy as static typed entries with stable ID, group, label, purchase type, and optional classifier description. Derive CategoryId, maps, and choice metadata without a delimiter parser.

## Current state

Source references:
- `src/lib/domain/receipt.ts:409`
- `src/lib/domain/classification.ts:40`
- `convex/providers.ts:145`
- `convex/correctionEvaluation.ts:75`
- `src/lib/domain/categories.ts:1`
- `src/lib/domain/categories.ts:93`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/lib/domain/receipt.ts:409

```text
409: export function classificationInputs(data: ReceiptData) {
410:   return data.lines
411:     .filter((line) => line.kind === "product" && !line.productKey)
412:     .map((line) => ({
413:       id: line.id,
```

### src/lib/domain/classification.ts:40

```text
40: export function classificationState(description: string) {
41:   const evidence = z
42:     .record(z.string(), z.json())
43:     .parse(JSON.parse(description));
44:   return Object.fromEntries(
```

### convex/providers.ts:145

```text
145:           products: batch.map((p) => classificationState(p.description)),
146:         },
147:         questions,
148:       });
149:       batch.forEach((product, index) => {
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

- `src/lib/domain/classification.ts`
- `src/lib/domain/receipt.ts`
- `src/lib/domain/categories.ts`
- `src/lib/domain/corrections.ts`
- `src/lib/domain/insights.ts`
- `convex/providers.ts`
- `convex/correctionEvaluation.ts`
- `convex/corrections.ts`
- `related classification/correction tests`
- `src/lib/domain/receipt.test.ts` (test; create only when specified)
- `convex/corrections.test.ts` (test; create only when specified)
- `convex/catalogClassifier.test.ts` (test; create only when specified)
- `src/lib/domain/insights.test.ts` (test; create only when specified)

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
| `npm test -- src/lib/domain/receipt.test.ts convex/corrections.test.ts convex/catalogClassifier.test.ts src/lib/domain/insights.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Create a typed evidence object that preserves related discount descriptions and omits irrelevant absent fields. Update classificationInputs and its tests.

**Verify:** `npm test -- src/lib/domain/receipt.test.ts convex/corrections.test.ts convex/catalogClassifier.test.ts src/lib/domain/insights.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Pass structured evidence through provider arguments and stored correction records. Remove the internal stringify/parse cycle. Parse external responses once at the provider boundary.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Replace category delimiter strings with typed static entries; derive all existing IDs and labels. Attach classifier descriptions and purchase-type metadata to the relevant entries.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Check active workflow argument compatibility before later deployment. This report authorizes no deployment; retained workflow journals need normal release review even during development.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Current category IDs and labels are unchanged.
- Invalid category references are rejected by typecheck; runtime inputs are still validated.
- Provider classification and correction replay receive the same structured evidence.
- Related offer descriptions and unknown optional fields keep the current classification behavior.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] No internal classification JSON round trip remains. Taxonomy is typed data with one metadata owner; no public category identifiers change.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not change category granularity, model choice, prompt rules, or provider output acceptance while changing the data contract.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/typed-classification-contracts`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Keep provider evidence typed across internal calls

classificationInputs and classificationState currently serialize and parse internally defined evidence, losing the original field contract. Define ClassificationEvidence and pass it directly through the preparation and provider adapter. Parse external answers once into the existing domain decision type. Serialize only at the actual provider transport boundary. Taxonomy construction must yield the category-ID vocabulary consumed by that contract.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

New categories require one typed entry. New evidence fields require one contract change and a matching boundary test.
