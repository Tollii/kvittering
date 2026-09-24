---
name: file-pr
description: File a concise Kvitto pull request and follow CI and reviews to completion. Use when the user asks to file, open, or create a PR. Merge only when requested.
metadata:
  harness: [claude, codex]
  platform: [darwin, linux]
  scope: project
---

# File a pull request

Adapted from Andreas's personal `file-pr` skill.

Before filing, check whether a PR for this branch already exists. Reuse an existing PR instead of creating a duplicate. Inspect the working tree and index, and include only changes within the requested scope. Preserve unrelated work; use an isolated worktree when needed.

Fetch `origin` and rebase the PR branch onto the latest `origin/main` before opening the PR. Resolve conflicts, then review the local diff against `origin/main` to confirm that it matches the user's goal. Run the relevant checks from the [README](../../../README.md) on the final changes. If rebasing a published branch requires a rewritten push, use an explicit `--force-with-lease` against the remote head you inspected.

PR titles usually become commit messages. Check recently merged PRs and Git history for the repository's current convention. Prefer a concise title that explains the change's purpose. Do not impose a conventional-commit prefix if the repository does not use one.

For example, prefer `Preserve receipt drafts when the app restarts` to `Refactor receipt state persistence`.

Open the description with a simple explanation of the problem from the user's original request. Then explain the solution briefly. Include relevant validation and material limitations. Describe the final change; omit abandoned approaches and an inventory of implementation details.

End the description with the actual model and harness used for the change, for example `Created with <model> in <harness>.` Do not invent a model identifier if it is unavailable.

Use a structured tool argument for the description, or write it to a temporary file and pass `gh pr create --body-file <path>`. Open a real PR, not a draft, so review bots run. In Codex, attach the created or updated PR to the task with the artifact tool when available.

After filing, use [babysit-pr](../babysit-pr/SKILL.md) to follow CI and published review feedback through completion. Honor an explicit request to file only or a different stopping point. Carry the PR URL and any existing merge authorization into monitoring. Merge only if the user requested it; otherwise finish when the PR is ready.
