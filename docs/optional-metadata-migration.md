# Optional metadata transition

Convex 1.46.0 was already installed and was the latest published npm version on 19 September 2026. The source now uses the fluent `.optional()` validator method. A field can be absent; `null` is still a distinct value.

Catalog metadata, catalog request timestamps/errors, receipt errors and duplicate links now use absence. Kassalapp responses can still contain nulls: the response parser accepts them, and the normalizer produces the internal optional fields. Unknown receipt amounts, explicit no-match decisions and clear commands retain their existing null meanings. The disposable catalog cache version advances to `catalog-v2`.

## Completed data migration

The migration ran on personal development (`agile-falcon-148`) and TestFlight staging (`courteous-jay-215`). Convex classifies the staging deployment as production; the application uses it only for TestFlight.

Each deployment used this sequence:

1. Deploy updated writers and a transitional schema that accepts both null and absent metadata.
2. Normalize existing documents in transactions of at most 20 documents. Remove only the specified null metadata fields. Preserve meaningful nulls, IDs, creation times and all other data.
3. Repeat the full scan. Confirm unchanged document counts and zero further changes.
4. Deploy the strict optional schema.

Both deployments had the same initial data counts:

| Table | Scanned per deployment | Changed on first pass |
| --- | ---: | ---: |
| catalogProducts | 103 | 92 |
| catalogStores | 3 | 0 |
| catalogRequests | 31 | 31 |
| receipts | 9 | 9 |
| extractions | 10 | 0 |
| revisions | 11 | 0 |
| corrections | 0 | 0 |
| correctionBatches | 0 | 0 |

Each verification pass scanned the same 167 documents and changed none. No tables or documents were deleted. The temporary migration function and its dedicated tests were removed after both data migrations passed. The application retains its catalog normalization and receipt behavior tests. Both final deployments passed schema validation. Typecheck, lint and all 149 remaining tests across 31 files passed.

## Release assessment

The data transition is complete on both retained deployments. The normal TestFlight build and OTA workflows can now deploy the strict schema without an intermediate data migration.

Old clients or open editors can submit catalog snapshots with explicit null metadata. The strict write validators reject those snapshots. Reload the development client to obtain the updated JavaScript; distribute the matching client update to TestFlight when ready. No native build, OTA update, release policy or secret was changed by this migration. No minimum version was raised, and active-client adoption was not checked.

There are no native dependency or configuration changes. SQLite queue formats, saved images, reservation IDs and upload progress are unchanged. Workflow names, step order and identifiers are unchanged. Stored workflow arguments were not inspected on staging. An old binary, offline upgrade and OTA rollback were not tested.

The audit's reactivity and command/query changes remain proposals. This update does not remove the catalog polling hooks or the client analysis worker.
