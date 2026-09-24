# 003 — Preserve drafts through pending saves and required updates

Priority: P1. Execution status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Comparison with active work

See [the working-copy comparison](concurrent-work.md).

The newer local receipt cache stores server records, not unsaved editor drafts.
The `dirty && !busy` navigation guard remains unchanged. Both draft recovery
cases in this plan remain open; do not treat receipt caching as their fix.

## Outcome and evidence

A person edits a receipt, starts Save, and leaves with the back gesture while
the request is pending. The guard permits removal because `busy` is true. If the
request then fails, its failure dispatch targets an unmounted editor and the
only copy of the edited values has been lost.

Evidence: reducer state at
[src/features/receipt-editor.tsx:94](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/src/features/receipt-editor.tsx),
`usePreventRemove(dirty && !busy)` at line 136, and the delayed failure handling
at line 228. This is source-confirmed; the native gesture was not executed.

A second recovery case shares the same owner: a required update overlays the
editor at [src/features/release-policy.tsx:226](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/src/features/release-policy.tsx).
The children remain mounted, which preserves the draft while the process lives.
Updating the native app or restarting it loses a draft that exists only in
memory. The update gate offers no durable draft recovery.

## Scope and approach

Keep navigation protection active until a successful save or explicit discard.
Distinguish successful deletion from a pending operation so valid exits still
work. Use a durable, account/household/receipt-scoped draft record for required
update and process-restart recovery, with its baseline revision. Do not silently
apply that record over newer server data. Restore the person's values and show
the revision conflict for a deliberate resolution.

Dependencies: none. Preserve existing queued-image migrations and account
isolation. Do not increase minimum client versions to solve draft handling.

## Verification and completion

Add a component/navigation test beside the editor. Defer the save promise, edit
a visible field, press Save, attempt Back, reject the promise, and assert that
the edited text and error remain visible. Test success and explicit discard as
separate permitted exits. Replacing the guard with `dirty && !busy` must fail
the test. Existing reducer tests cannot observe navigator removal.

Add one device flow: create a dirty draft, activate a required update, restart
the app, and recover the exact values under the same account. Another account
must not see them. Verify newer remote revisions and future persisted draft
versions preserve the recovery data. Complete after the component check and
signed-device recovery check pass. Use a forward-compatible local migration;
rollback must leave any unrecognized draft payload intact.
