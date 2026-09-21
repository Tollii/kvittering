# Backend operations

Use this guide for deployment, environment changes, imports, exports, and fixtures. Code edits and reviews use local project checks; they do not require a deployment.

## Select the target

Identify the effective deployment from the explicit command options, environment-file selection, deployment-key presence, and available deployment status. Do not print keys or secret values. Resolve conflicting selectors before acting, then state the target and operation. See [release environments](releases.md#environments) and [setup](../README.md) for this project's configuration.

Use installed CLI help or current official documentation for command options. Do not infer the target from the current branch or from a successful earlier command. If a deployment appears to have no effect, verify which deployment changed before retrying.

## Authorization and secrets

Honor read-only scope. An investigation does not authorize a mutation, publication, environment change, or data import. Existing user authorization applies to the agreed operation and target; do not ask again for each routine step. Ask only when the target, destructive consequence, cost, or scope is unresolved or exceeds that authorization. Present the prepared change before asking for a decision.

Use the least tool access needed. Read-only production inspection must not enable production mutation tools. Store provider secrets in the intended deployment's environment. Check presence or a safe acknowledgement without printing values; keep credentials out of source, logs, and client bundles.

## Data and publication

Imports, restores, and fixture resets can replace data. Use an isolated target for rehearsal and tests. Re-running a fixture must not clear unrelated records. Verify counts, relationships, and relevant behavior; row counts alone do not establish a correct migration.

Snapshots contain household data. Keep an authorized recovery copy in protected storage for an agreed retention period. Delete local temporary copies only after confirming the retained copy. Never commit snapshots. A replacement restore can lose later writes; use the explicit recovery plan.

Before publishing changes that affect installed clients, use [release-review](../.agents/skills/release-review/SKILL.md) and [release policy](releases.md). Preserve supported client contracts and deploy in the reviewed order. A successful upload does not establish tester availability, and no build step may raise minimum supported versions automatically.
