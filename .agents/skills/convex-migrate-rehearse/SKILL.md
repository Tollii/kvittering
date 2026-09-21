---
name: convex-migrate-rehearse
description: Rehearse Kvitto schema changes and backfills against representative existing data before an authorized deployment. Use when persisted data or installed-client contracts must migrate.
---

# Schema migration rehearsal

Read [backend operations](../../../docs/backend-operations.md) and the affected [release contracts](../../../docs/releases.md). Identify old and new data shapes, supported clients, persisted workflow arguments, and concurrent writers. A schema-valid document can still violate a business or replay contract.

1. Define the compatible transition, resumable backfill, verification, and recovery plan. Prefer additive fields or endpoints while old clients remain supported. Do not make a field required merely because a backfill finished if old writers can still omit it.
2. Export an authorized snapshot with the required scope. Record its code/schema revision and retain it in protected storage. State which later writes a replacement restore would lose.
3. Create an isolated rehearsal deployment from the pre-change code, then import the snapshot. Confirm the target and CLI options. If previews are unavailable, use a new disposable development deployment; do not replace an existing development database.
4. Apply the compatible schema, run a bounded and resumable backfill, and verify all intended records and relationships. Use an existing migration mechanism if suitable; install a component only when its guarantees are needed. Check retries, interrupted batches, and writes that arrive during migration.
5. Tighten the schema only when migrated data and all supported writers permit it. Test relevant old and new requests plus persisted workflow replay. Record the exact code and migration sequence that passed.
6. Promote that sequence only within the user's deployment authorization. Recheck live results. If verification fails, stop dependent operations and use the agreed recovery plan; do not automatically run a destructive snapshot replacement.

Retain the recovery artifact for the agreed window. Delete temporary local snapshots only after verifying the retained copy. Clean up rehearsal resources within scope. Report the source/target, tested revision, migration progress, compatibility evidence, and remaining gaps.

## Rehearsal and promotion sequence

Use for a migration touching existing persisted data. Select the source, rehearsal target, and eventual live target explicitly and follow backend operations.

1. Identify the pre-change code/schema revision and export an authorized snapshot. Include file storage when the migration or recovery depends on it. Protect and retain the recovery artifact.
2. Create an isolated rehearsal deployment from pre-change code before importing. This ensures the snapshot initially conforms. The original preview workflow used `deploy --preview-create <name>` and then `deploy --preview-name <name>` for later changes; check the installed CLI and preview-key requirements. Never substitute `convex dev` and accidentally modify a different deployment.
3. Import using the actual deployment name and the import command's supported selector. Do not assume the deploy command's preview options also work on import.
4. Deploy a compatible expanded schema. Existing documents may need optional fields or a transitional union before backfill. Run a bounded, resumable, idempotent transformation; consider the migrations component when no existing mechanism supplies these guarantees.
5. Verify transformed data, relationships, behavior, and concurrent writes. Resume an interrupted batch and confirm it does not duplicate work. Only tighten validators once both stored data and every supported writer conform.
6. Verify relevant old/new application requests and persisted workflow replay against the rehearsed result. Record exact revisions and commands.
7. Repeat the proven sequence on the live target only within the user's authorization. Do not treat permission for rehearsal as permission to replace live data. Monitor the affected behavior after promotion.

A snapshot replacement loses later writes. Prefer a compatible forward repair when appropriate; use destructive recovery only under the agreed plan. Keep the recovery copy for the required window and remove temporary snapshots only after confirming retained storage. Clean up isolated targets within scope and report if any resources remain.
