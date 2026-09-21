# Explain or assess an existing backend

Use for an architecture explanation, readiness assessment, or an optimization plan. Start from the relevant schema and exported function surface, and inspect runtime metadata only when needed and authorized.

Map tables, field meanings, identifier relationships, and the indexes that reveal access paths. Separate public queries, mutations, actions, and HTTP routes from internal functions and scheduled work. Trace identity through the current provider and membership helpers. Component-owned authentication tables are not evidence of a missing authentication system.

List installed components, external services, HTTP entry points, schedules, environment requirements, and responsibility boundaries. Trace one or two representative flows from a caller through authorization, persisted work, and observable results. Describe what the source establishes; keep uncertain behavior explicit.

For an assessment, combine only relevant checks: backend correctness and authorization, installed-client compatibility, observed read limits or contention, and failure logs. Deduplicate a static defect and its runtime symptom by the affected function and cause. Show which checks ran, failed, or were unavailable. A skipped pass is not a pass.

If the user requests the former readiness score, its formula was 100 minus 15 per high, 5 per medium, and 1 per low confirmed finding, floored at zero. Report the formula, coverage, and evidence; label it an optional comparison aid, not proof of readiness. Do not require the absent findings schemas.

Prioritize unauthorized access and data loss, then verified correctness and performance problems. Keep speculative product changes separate. For optimization, inspect component versions and observability against actual needs. Do not combine a requested code fix with automatic dependency upgrades or a new monitoring system. Recheck affected behavior after an authorized change; repeated full audits are not a substitute for targeted verification.
