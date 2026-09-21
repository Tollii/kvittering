---
name: convex-reviewer
description: Review Kvitto backend correctness, household authorization, transactions, bounded reads, and tests. Use for backend reviews or targeted security and reliability checks.
---

# Backend review

Establish the requested comparison and trace affected callers. Separate introduced defects from existing limitations. Read the relevant generated guidelines and project contracts; a text match is a lead, not proof of a defect.

Check the boundaries affected by the change:

- **Identity and access:** follow Better Auth and existing membership helpers. Test whether one household can read or change another household's data, including referenced parents and linked records. Client identifiers do not establish authority. Public bootstrap or shared catalogue reads can be intentional; do not add blanket owner checks or change public endpoints to internal ones without tracing callers.
- **Transactions and concurrency:** keep access checks, revisions, and related writes atomic. Reject stale results before they overwrite later user decisions. Check duplicate requests, retries, and workflow completion.
- **Contracts:** validate external inputs and meaningful return shapes. Preserve old client contracts and persisted workflow arguments; use [release-review](../release-review/SKILL.md) when affected.
- **Data access:** justify the read scope, index, pagination, and completion behavior. Check growing collections and contention from shared writes. Avoid arbitrary limits that hide missing results.
- **Effects:** keep provider failures, timers, scheduled work, and retries under explicit ownership. Inspect failure recovery and cleanup.

For tests, read [verification](references/verification.md). Use the existing project checks; do not reinstall test dependencies or change runtime configuration as a routine review step.

Report confirmed findings with severity, file/line, a concrete failure scenario, and the smallest correction. State coverage gaps. Do not invent scores or require a findings framework. A review request produces findings; implement fixes when the user requests them. Do not deploy as part of review verification.

## Authorization review scenarios

Use when a change affects identity, household scope, shared records, or a parent/child relationship. Text patterns identify candidates; trace actual helpers and callers before concluding that a check is absent.

| Scenario                              | What to verify                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity supplied in arguments        | An actor/account identifier cannot impersonate the authenticated caller. An operator function with a deliberate target user has separate operator authority.  |
| Lookup or update by record ID         | Possession of an ID does not grant access. The current caller must have the required household membership or role before private data is returned or changed. |
| List filtered by a caller-supplied ID | The filter cannot expose another household's records. Intentionally public or shared catalogue data follows its own access policy.                            |
| Create or reparent a child            | The caller must be authorized for the referenced parent and the child. Existing access to one object does not prove access to the other.                      |

Follow the application's identity representation. An auth provider subject, a component user identifier, and an application document ID may differ. Do not compare them without the intended mapping. Inspect helper functions, wrappers, and component boundaries rather than requiring a literal `ctx.auth` call in every handler.

Keep access decisions and related writes in the transaction that owns them. Do not patch every regex match with a new `ownerId` helper or convert public functions to internal ones without checking installed callers. A missing app-owned user table is not proof that component-backed auth is absent.

For the affected private operation, seed legitimate and other-household data, invoke it with the real identity shape, and verify permitted access, wrong-household rejection, unauthenticated rejection where required, and no unintended write. Also check list isolation and unauthorized parent references. Assert meaningful error contracts, not an incidental message string. Do not weaken a failed access test merely to obtain a green run.
