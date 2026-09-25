---
name: file-pr
description: File a concise Kvitto pull request and follow CI and reviews to completion. Use when the user asks to file, open, or create a PR. Merge only when requested.
metadata:
  harness: [claude, codex]
  platform: [darwin, linux]
  scope: project
---

# File a pull request

Before filing, check whether a PR for this branch already exists. Reuse an existing PR instead of creating a duplicate. Inspect the working tree and index, and include only changes within the requested scope. Preserve unrelated work; use an isolated worktree when needed.

Fetch `origin` and rebase the PR branch onto the latest `origin/main` before opening the PR. Resolve conflicts, then review the local diff against `origin/main` to confirm that it matches the user's goal. Run the relevant checks from the [README](../../../README.md) on the final changes. If rebasing a published branch requires a rewritten push, use an explicit `--force-with-lease` against the remote head you inspected.

PR titles usually become commit messages. Check recently merged PRs and Git history for the repository's current convention. Prefer a concise title that explains the change's purpose. Do not impose a conventional-commit prefix if the repository does not use one.

For example, prefer `Preserve receipt drafts when the app restarts` to `Refactor receipt state persistence`.

Open the description with a simple explanation of the problem from the user's original request. Then explain the solution briefly. Include relevant validation and material limitations. Describe the final change; omit abandoned approaches and an inventory of implementation details.

For an interface feature or visual fix, include screenshots from the running app in the PR description. Use a short screen recording when navigation, gestures, or state changes are needed to show the result. Choose the smallest set that lets a reviewer understand and check the changed behavior. Use before-and-after views when the comparison is useful; do not recreate a before view from memory.

Capture the final tested revision with synthetic or approved demonstration data. Add short captions that state what each image or recording proves, including the simulator or device and relevant appearance or text-size settings.

Use `gh` for PR operations, including image and video uploads. Check `gh pr edit --help` for `--attach`; update an older CLI from its official distribution before using a browser workaround. For example:

```sh
gh pr edit <number> --body-file <description.md> \
  --attach './receipt-categories.png#Category totals on one receipt' \
  --attach './receipt-details.png#Items in the selected category'
```

`gh pr create` also accepts `--attach`. References to attached local files in the Markdown body are replaced with uploaded asset URLs; other attachments are appended. Afterward, read back the body with `gh pr view --json body` and check that the asset URLs are accessible. Inspect the rendered PR only when the layout or playback needs verification. A partial upload can update the PR despite a nonzero exit; inspect the result before retrying. If CLI upload is unavailable, link to accessible test artifacts and state the limitation. Do not commit generated screenshots to application source or report local paths as attached evidence. See [GitHub CLI attachment documentation](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli).

For changes that have no useful visual result, give concise execution evidence instead. Add a small diagram or code sketch only when it explains a non-obvious behavior or data flow. Describe material release, compatibility, or recovery risks in plain language. Keep the description proportional to the change rather than filling a fixed template. This evidence guidance is inspired by [Matt Pocock's PR skill](https://github.com/mattpocock/skills/blob/main/skills/in-progress/pr/SKILL.md).

End the description with the actual model and harness used for the change, for example `Created with <model> in <harness>.` Do not invent a model identifier if it is unavailable.

Use a structured tool argument for the description, or write it to a temporary file and pass `gh pr create --body-file <path>`. Open a real PR, not a draft, so review bots run. In Codex, attach the created or updated PR to the task with the artifact tool when available.

After filing, use [babysit-pr](../babysit-pr/SKILL.md) to follow CI and published review feedback through completion. Honor an explicit request to file only or a different stopping point. Carry the PR URL and any existing merge authorization into monitoring. Merge only if the user requested it; otherwise finish when the PR is ready.
