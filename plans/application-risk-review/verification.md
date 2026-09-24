# Review verification

Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.
Date: 24 September 2026. Review branch: `codex/application-risk-review`.

## Existing tests

The following run passed: **16 files, 122 tests**, seed `1790257512040`.

```sh
npx vitest run convex/auth.test.ts convex/appleAuthentication.test.ts convex/receipts.test.ts convex/products.test.ts convex/catalog.test.ts convex/corrections.test.ts convex/productLinking.test.ts convex/productAnalysis.test.ts convex/notifications.test.ts convex/iosIntegrations.test.ts convex/releasePolicy.test.ts convex/featureFlags.test.ts convex/receiptReview.test.ts src/lib/upload-queue.test.ts src/lib/receipt-migrations.test.ts src/lib/sentry-event.test.ts
```

Dependencies were installed from the lockfile in the dedicated worktree, with
install scripts disabled. No dependency files were changed. No production data
or provider credentials were required by these tests.

## New reproductions

The temporary test in [reproductions](reproductions.md) ran with seed
`1790257949372`: **four expected failures and one passing payload-size check**.

| Check                                               | Observed result                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Receipt deletion removes correction batch copies    | Failed: the query returned a deleted receipt's original line and amount    |
| All service pauses stop new evaluation calls        | Failed: the mocked TypeSafe transport was called once                      |
| Alias propagation preserves active processing       | Failed: status changed from `processing` to `reviewed`                     |
| New reservations reject six images                  | Failed: a receipt ID was returned; demonstrates the newly requested rule   |
| Valid payloads can exceed the aggregate read budget | Passed: one accepted value was below 1 MiB; 50 such values exceeded 16 MiB |

No real TypeSafe request was made. The transport used a placeholder key and an
in-process response. The first three failures establish defects; the image
failure establishes a new requirement that the baseline does not yet meet.
The payload check proves input size, not actual hosted limit enforcement.

The temporary test was removed after its full source was saved in the plan
document. The audit does not leave a deliberately failing test in the active
test suite. Implement each check in its owning test file with the corresponding
fix and prove that reverting the fix makes it fail.

## Coverage limits

- Public entry points and indirect guards were inspected in source. Existing
  tests cover many household-isolation cases, but this is not an exhaustive
  generated negative test across all 52 functions.
- No hosted Convex load test, transaction-limit rehearsal, live environment
  inspection, or production journal inventory was performed.
- No signed iOS binary was run. Build 5 and build 15 were inspected at their
  source commits, with read-only build/submission evidence. Actual tester
  installation and App Store Connect availability remain unverified.
- No real OpenAI, TypeSafe, Kassalapp, APNs, or Sentry delivery was invoked.
- No source mutation campaign was run. The new reproducers show omissions in
  the selected passing suite, not a claim that all existing tests are weak.
- No application code, deployment, release minimum, or live data was changed.
  No commit, push, or pull request was created.

Formatting and documentation links were checked for the final plan files.
The full mechanical `npm run check` was not repeated: the requested scope
excludes its findings and the retained changes are documentation only.

## Follow-up comparison

[The active-work comparison](concurrent-work.md) records a separate read of the
other task's uncommitted implementation on 24 September 2026. Its six selected
test files passed all 24 tests. Those results are separate from the 122-test
audit baseline above. No source in the other task was edited. The comparison
identified a source-confirmed workflow component mismatch and narrowed the
overlapping plans; no delayed cleanup or hosted load test was run.
