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

Show, don't tell: reviewers judge the change from the description. Any change with a visual impact needs screenshots from the running app, and a short video when navigation, gestures, or state changes are needed to show the result. Choose the smallest set that lets a reviewer understand and check the changed behavior. Use before-and-after views when the comparison is useful; do not recreate a before view from memory. Capture them from the most faithful build you can run:

- **On a Mac with Xcode:** use the iOS Simulator, which runs the native app. Start it as the [README](../../../README.md) describes, or drive a Maestro flow with `E2E_FLOW=<flow> npm run e2e:ios` (see [verification](../../../docs/verification.md)). Capture with `xcrun simctl io booted screenshot <name>.png` and `xcrun simctl io booted recordVideo --codec=h264 <name>.mp4`, stopping the recording with Ctrl-C. GitHub rejects videos over 10 MB, so keep recordings short or re-encode them with ffmpeg.
- **Without a simulator, as in cloud sessions:** use [device-check](../device-check/SKILL.md), which runs the native app on a Revyl cloud iPhone. Use [visual-check](../visual-check/SKILL.md), which runs the web build, only when device-check cannot run.

Capture the final tested revision with synthetic or approved demonstration data. Add short captions that state what each image or recording proves, including the device, simulator, or web build and relevant appearance or text-size settings.

Prefer a picture to a long block of text elsewhere too: a chart for numbers that changed, a small Mermaid diagram for a non-obvious flow or state machine, or a table for a before-and-after comparison. Keep logs and command output short; quote the lines that prove the point.

Put media in the description without committing it to the PR branch or using external hosts:

- **Cloud sessions:** GitHub's attachment upload and GraphQL are blocked, so `gh pr create` and `gh pr edit` fail. Publish media to the `pr-media` branch with `tools/visual/publish-media.sh` and paste the Markdown it prints. Create and edit the PR with `curl` against the REST API; the session proxy supplies the credentials, so send no token. Build the JSON with `jq` so the body is escaped:

  ```sh
  jq -n --arg title "<title>" --rawfile body <description.md> \
    '{title: $title, body: $body, head: "<branch>", base: "main"}' |
    curl -fsS -X POST https://api.github.com/repos/Tollii/kvittering/pulls --data @-
  ```

  To edit, `PATCH` `https://api.github.com/repos/Tollii/kvittering/pulls/<number>` with only the fields that change.
- **Elsewhere:** use `gh` 2.99.0 or newer with `--attach`, for example `gh pr edit <number> --body-file <description.md> --attach './receipt-details.png#Items in the selected category'`. References to attached local files in the body are replaced with uploaded asset URLs; other attachments are appended. A partial upload can update the PR despite a nonzero exit; inspect the result before retrying. See [GitHub CLI attachment documentation](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli).

Afterward, read back the body and check that each media URL loads. Reviewers cannot open local paths, so cite only published URLs as evidence.

For changes that have no useful visual result, give concise execution evidence instead. Describe material release, compatibility, or recovery risks in plain language. Keep the description proportional to the change rather than filling a fixed template. This evidence guidance is inspired by [Matt Pocock's PR skill](https://github.com/mattpocock/skills/blob/main/skills/in-progress/pr/SKILL.md).

End the description with the actual model and harness used for the change, for example `Created with <model> in <harness>.` Do not invent a model identifier if it is unavailable.

Use a structured tool argument for the description, or write it to a temporary file and pass it as the body. Open a real PR, not a draft, so review bots run. In Codex, attach the created or updated PR to the task with the artifact tool when available.

After filing, use [babysit-pr](../babysit-pr/SKILL.md) to follow CI and published review feedback through completion. Honor an explicit request to file only or a different stopping point. Carry the PR URL and any existing merge authorization into monitoring. Merge only if the user requested it; otherwise finish when the PR is ready.
