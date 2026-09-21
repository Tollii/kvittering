---
name: convex-backup
description: Back up Kvitto data and verify recovery in an isolated deployment. Use for backup schedules, recovery planning, or a requested restore exercise.
---

# Backup and recovery

Read [backend operations](../../../docs/backend-operations.md). Establish the source, authorized scope, acceptable data loss, retention period, and protected storage destination. Verify current CLI options with installed help before constructing export or import commands.

Export the required data and include file storage when recovery needs it. Treat snapshots as sensitive household data. Record the source deployment, code/schema revision, time, scope, and checksum without exposing record contents.

Verify restoration in a new, isolated deployment running compatible code. Confirm the target is disposable before importing. If an isolated target is unavailable, report the backup as unverified; do not overwrite an existing development deployment as a fallback.

Compare critical table counts and relationships and inspect representative behavior. Check stored files when included. A successful import command alone does not prove recovery; zero rows are valid only if the source was also empty.

Keep a verified recovery copy in the agreed protected location for its retention period. Remove temporary local copies only after confirming durable storage. Never commit snapshots. Clean up disposable resources within the authorized scope.

Document the recovery commands for the actual target, validation, access requirements, and data-loss window. Production replacement can discard writes since the snapshot and requires authorization for that concrete restore. A backup request does not authorize that restore. Configure a recurring schedule only when requested, and report whether both export and restoration were tested.

## Export and restore procedure

Use for an authorized backup or restore exercise. Check installed CLI help before running examples; pass an explicit selector for the intended deployment. Do not infer a target from the shell's default environment.

The original workflow used `npx convex export --path <snapshot.zip>` and added `--include-file-storage` when recovery needed stored files. Record source, revision, export time, scope, and checksum. Store the artifact in a protected retained location before removing temporary copies.

Rehearse against a newly created isolated deployment on compatible code. Preview creation may require a preview deployment key and an eligible plan; verify current access instead of assuming ordinary CLI login is sufficient. If previews are unavailable, create a disposable development target rather than replacing an existing one.

Import the snapshot into that explicit target using the installed CLI's deployment selector. The original import API selected a deployment name, not the preview-name option used by deploy. Verify current help instead of transferring flags between commands. Do not use replacement mode unless the target is confirmed disposable or the specific destructive restore is authorized.

Compare critical source and restored table counts, identifier relationships, representative records, and file availability without exposing household data in reports. Exercise the operations that depend on those records. An import that exits successfully but restores an unexpectedly empty table fails the exercise.

For a requested schedule, choose cadence from acceptable data loss and retention needs. Store user-controlled portable copies durably, with access controls and recovery instructions; platform backups and portable exports can serve different recovery needs. Verify the scheduled export separately from the restore test. Report what was actually performed, failures, remaining gaps, and the intended retention/cleanup dates.
