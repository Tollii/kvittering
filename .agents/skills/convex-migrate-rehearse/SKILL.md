---
name: convex-migrate-rehearse
description: Rehearse Kvitto schema changes and backfills against representative existing data before an authorized deployment. Use when persisted data or installed-client contracts must migrate.
---

# Schema migration rehearsal

Identify the old and new data shapes, supported clients, stored workflow arguments, and concurrent writers. Use [backend setup](../../../README.md#backend-configuration) to select the target and [release review](../release-review/SKILL.md) for affected contracts. Schema validity alone does not establish business or workflow-replay compatibility.

1. Define the compatible transition, resumable backfill, verification, and recovery plan. Keep old endpoints and optional fields while supported writers need them.
2. Export an authorized representative snapshot with required file storage. Record the source revision and retain the recovery copy in protected storage. State which later writes a replacement restore would lose.
3. Create an isolated target running the pre-change code before importing. Check installed CLI help and preview-key requirements. Import selects the actual deployment; do not assume it accepts deploy's preview flags. If previews are unavailable, use a new disposable development target, not an existing database.
4. Deploy the expanded schema, then run a bounded, resumable backfill. Verify relationships and behavior as well as counts. Exercise interrupted batches, repeated execution, and concurrent writes. Prefer the existing migration mechanism when it supplies these guarantees.
5. Tighten validators only when stored data and all supported writers permit it. Verify old and new requests, persisted workflow replay, and device-cache reconciliation. Record the exact revision and sequence that passed.
6. Repeat the verified sequence on the live target only within the user's deployment authorization. Recheck the results there. If verification fails, stop dependent work and use the recovery plan; do not automatically replace data from a snapshot.

A compatible forward repair can preserve writes that a snapshot replacement would lose. Keep the recovery copy for the agreed retention period, remove temporary copies only after confirming retained storage, and clean up rehearsal resources within scope. Report migration progress, compatibility evidence, and remaining gaps.
