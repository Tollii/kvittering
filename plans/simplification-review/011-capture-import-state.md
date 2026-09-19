# Plan 011: Make shared-file import an explicit operation

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P1
- Effort: S–M
- Risk: Medium
- Confidence in finding: High
- Depends on: None
- Category: correctness and architecture
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/app/(tabs)/index.tsx' 'src/lib/pending-import.ts' 'src/lib/receipt-import.ts' 'src/features/capture-import.ts' 'src/lib/capture-import.test.ts' 'src/lib/upload-queue.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

The share-import effect checks busyRef but does not depend on busy. Files received while another operation is busy can wait until a later focus or queue change. It removes pending files before import succeeds, so a failed import is not retained for retry. The effect suppresses exhaustive dependency checking.

## Target design

Give capture/import a small explicit operation state. Pending imports are claimed and acknowledged after success; failure leaves a retryable batch or an explicit dismissal. The effect remains justified because it connects to an external share queue, but it must react when capture becomes idle.

## Current state

Source references:
- `src/app/(tabs)/index.tsx:79`
- `src/app/(tabs)/index.tsx:97`
- `src/app/(tabs)/index.tsx:155`
- `src/lib/pending-import.ts:17`
- `src/lib/receipt-import.ts:68`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/app/(tabs)/index.tsx:79

```text
79:   async function run(action: () => Promise<void>) {
80:     if (busyRef.current) return;
81:     busyRef.current = true;
82:     setBusy(true);
83:     setError("");
```

### src/app/(tabs)/index.tsx:97

```text
97:   const addFiles = (files: ImportedFile[]) =>
98:     run(async () => {
99:       const room = maxReceiptImages - photos.length;
100:       if (room <= 0) throw new Error(`Maks ${maxReceiptImages} bilder`);
101:       const imported = await importReceiptFiles(files, room);
```

### src/app/(tabs)/index.tsx:155

```text
155:   useEffect(() => {
156:     if (!focused || !pendingImports.length || busyRef.current) return;
157:     void addFiles(takeImportedFiles());
158:     // eslint-disable-next-line react-hooks/exhaustive-deps
159:   }, [focused, pendingImports]);
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

- `src/app/(tabs)/index.tsx`
- `src/lib/pending-import.ts`
- `src/lib/receipt-import.ts`
- `src/features/capture-import.ts` (new)
- `src/lib/capture-import.test.ts` (new)
- `src/lib/upload-queue.test.ts` (test; create only when specified)

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
| `npm test -- src/lib/capture-import.test.ts src/lib/upload-queue.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Add deterministic tests for an import arriving while busy and a failed import retry. Model claim/acknowledge transitions rather than mock native UI internals.

**Verify:** `npm test -- src/lib/capture-import.test.ts src/lib/upload-queue.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Make pending imports stable batches. Acknowledge only after prepared images enter the capture draft; preserve or explicitly cancel failed batches.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Make the synchronization effect depend on a stable import callback and idle/focus state. Remove exhaustive-deps suppression.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Unify file-picker and shared-file preparation through the same bounded import operation. Keep camera capture/photo selection behavior and eight-image limit.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Files arriving while busy start once the current operation finishes.
- A failed PDF/image import remains available for retry and is not processed twice.
- The eight-image limit and single-document combine behavior remain.
- Closing and reopening the capture screen does not duplicate a completed import.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] No pending batch is consumed before successful draft insertion; returning to idle triggers waiting work without another navigation event.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not introduce general background iOS uploads or change photo retention behavior. Native camera interaction still needs a device check.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/capture-import-state`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Import outcome controls acknowledgement

Give the import operation a typed outcome for imported, cancelled, and failed attempts if those states lead to different acknowledgement behavior. Return imported queue entries or their IDs as an explicit result. The coordinator owns claim/ack and native I/O; the decision about acknowledgement can be a pure function. A single boolean must not mean both already consumed and import succeeded.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

Each new import source must enter the same claim/acknowledge path.
