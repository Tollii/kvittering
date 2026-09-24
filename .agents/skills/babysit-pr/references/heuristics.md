# CI and review decisions

Adapted from the OpenAI Codex skill; see [source and license](../SKILL.md).

## Classify failures

A failure is caused by the branch when logs connect it to changed code: a type error, lint error, deterministic test failure, or incorrect build configuration. Fix the cause and run the relevant project checks.

A failure is likely transient when logs show a network timeout, registry outage, runner provisioning failure, or external rate limit. Diagnose before retrying. Do not edit unrelated code to obtain a passing run.

If the cause is unclear, inspect the failing job and compare it with the changed files before choosing a fix or retry.

## Choose the next action

1. Stop if the PR is merged or closed.
2. Process valid published review findings. A required fix takes priority over a retry on the old commit.
3. Diagnose failed jobs even if other jobs are still running.
4. Retry a transient failure only when the helper recommends it, all selected runs are safe CI retries, and fewer than three retry cycles have been used for this commit.
5. Never retry a release workflow under PR-monitoring authorization.
6. Continue after a push or retry. Verify the current head, expected checks, reviews, and merge state.
7. At the requested completion point, stop the watcher or heartbeat. Merge only with existing user authorization.

## Review findings

Apply feedback when it is correct, within scope, and consistent with the user's requirements. Preserve receipt drafts, queued images, household access controls, and installed-client contracts.

Ignore unpublished reviews. Check thread resolution directly; a comment recorded as seen by the helper can still require a fix. An empty new-comment list does not establish readiness.

Separate unrelated local changes with an isolated worktree. Do not require the user to clean the workspace when safe isolation is available.

Report a blocker when access fails, the retry budget is exhausted, the PR branch cannot be pushed, or a product decision is needed. Do not post replies or resolve other people's threads without user authorization. Continue independent work while a response is needed.
