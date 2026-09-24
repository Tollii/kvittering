# Risk plan implementation

Starting revision: `8564c4c7287d936161b3d63041c5a0bfe2a44c0c`.
Branch: `codex/application-risk-review`, in its dedicated worktree.

The user authorized implementation and local commits for all nine plans.
This base includes the committed API safeguards and receipt caching work.
It does not include the separate verification-tooling branch used for the audit.
The original findings retain immutable source links to the audited revision.
Use the plan index for status; this record holds implementation and verification
results. No deployment or release-minimum change is part of this task.

## Verification approach

Use focused behavioral tests and the base revision's `check`, `check:ci`, and
formatting checks. Prove each new defect check fails before applying its fix
where practical. Preserve old public and scheduled arguments. Local fixture
rehearsals cover additive persisted-data changes; live deployment and signed
device upgrade checks remain separate release work.
