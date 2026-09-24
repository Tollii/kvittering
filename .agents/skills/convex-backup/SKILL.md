---
name: convex-backup
description: Back up Kvitto data and verify recovery in an isolated deployment. Use for backup schedules, recovery planning, or a requested restore exercise.
---

# Backup and recovery

Establish the source deployment, acceptable data loss, protected storage destination, and retention period. Use [backend setup](../../../README.md#backend-configuration) and installed CLI help to resolve the effective target. Deployment, export, and import commands can use different selectors; do not transfer flags between them or rely on the shell default.

1. Export the authorized data, including file storage when recovery needs receipt images. Record deployment, code/schema revision, time, scope, and checksum without exposing household records. Keep snapshots out of Git.
2. Create a disposable, isolated target with compatible code. Verify preview-key and plan requirements before choosing a preview deployment. If no isolated target is available, report recovery as unverified; do not replace an existing development database.
3. Import into that explicit target. Use replacement mode only for a confirmed disposable target or an authorized destructive restore.
4. Compare source and restored counts, identifiers, relationships, and stored files. Exercise representative receipt and household operations. A successful import command or matching row counts alone do not prove recovery.
5. Confirm the retained recovery copy before removing temporary snapshots. Clean up disposable resources within scope and report the tested revision, commands, results, and remaining resources.

A live replacement restore can discard writes since the snapshot. A backup request does not authorize that operation. Record the recovery target, required access, data-loss window, and the device-cache reconciliation plan before an authorized restore.

For a requested schedule, choose cadence from acceptable data loss and retention needs. Verify the scheduled export separately from the restore exercise. Platform backups and portable exports serve different recovery needs; identify which copies the operator can recover without the source deployment.
