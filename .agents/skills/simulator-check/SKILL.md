---
name: simulator-check
description: Check a pull request's change on the iOS Simulator on this Mac and put screenshots and a video in the PR. Use with a PR number, or without one to check every open PR labeled simulator-check, as the scheduled task on the Mac does.
metadata:
  harness: [claude]
  platform: [macos]
  scope: project
---

# Check a pull request on the simulator

The result is simulator screenshots and a short video in the PR description, captured from the real native app against a local backend with seeded data. Cloud sessions cannot run this; they use [visual-check](../visual-check/SKILL.md) and add the `simulator-check` label to the PR.

With a PR number as the argument, check that PR. Without one, check each open PR with the label, oldest first:

```sh
gh pr list --repo Tollii/kvittering --state open --label simulator-check --json number,headRefOid --jq 'sort_by(.number)[]'
```

Only one check runs at a time, because they share the simulator and the local backend ports. Take the lock with `mkdir ~/Library/Caches/kvitto-simulator/lock` and stop without output if it already exists; remove it when you finish, also after a failure. A lock older than three hours is left from a stopped run: remove it and continue.

## Decide what to show

Read the PR: `gh pr view <number> --json title,body,headRefOid,baseRefName,files` and its diff. Name the screens and states the change affects, and the steps that reach them. Choose a fixture from `tools/e2e/fixtures/` that has the data those screens need; `reviewed-receipts` covers most receipt screens. Show a before view too when a comparison helps the reviewer.

## Run it

1. Check out the PR head in a temporary worktree. It has no `.env.local`, which `tools/e2e/ios.sh` requires:

   ```sh
   git fetch origin "pull/<number>/head"
   git worktree add --detach "../kvitto-pr-<number>" FETCH_HEAD
   cd "../kvitto-pr-<number>" && npm ci
   ```

2. Write the flow as `.maestro/<fixture>/pr-<number>.yaml` in the worktree, and do not commit it. Start with `- runFlow: ../shared/sign-in.yml`, then navigate with the visible Norwegian text, as the existing flows in that folder do. Add `takeScreenshot: <step>` at each state to show, and wrap the steps in `startRecording: pr-<number>` and `stopRecording`.

3. Run it. Install Maestro first if `~/.maestro/bin/maestro` is missing: `curl -fsSL https://get.maestro.mobile.dev | MAESTRO_VERSION=2.10.0 bash`.

   ```sh
   export PATH="$HOME/.maestro/bin:$PATH"
   cache="$HOME/Library/Caches/kvitto-simulator/$(npx expo-updates runtimeversion:resolve --platform ios | jq -r .runtimeVersion)-$(xcodebuild -version | head -1 | tr ' ' '-')"
   E2E_FLOW=.maestro/<fixture>/pr-<number>.yaml E2E_APP_CACHE="$cache/kvitto.app" npm run e2e:ios
   ```

   The script starts a local Convex backend with the mock receipt provider, seeds the fixture, builds the app or reuses the cached build for the same fingerprint and Xcode version, and runs the flow. It saves a new build in the cache before the flow runs and stops the backend when it finishes. The first build takes 10–20 minutes; a cached run takes a few minutes. When a step fails, fix the flow, not the app: the check reports what the branch does.

4. For a before view, repeat steps 1–3 for the base branch in `../kvitto-pr-<number>-base` with the same flow file.

## Publish

The screenshots and the recording are in `build/e2e/flows/<fixture>/pr-<number>/maestro/`. Open each screenshot and check that it shows what its caption will claim; a spinner, splash screen, or error proves nothing. The simulator has no camera feed, so the Kamera tab shows an empty dark view and controls drawn with `cameraOverlay` blend into it; say so in the caption instead of reporting a defect. GitHub rejects videos over 10 MB, and a recording of a few seconds is often larger, so always re-encode it: `ffmpeg -i pr-<number>.mp4 -vf scale=390:-2 -an <out>.mp4`.

Append a `## Simulator check` section to the PR description with a caption for each item, and upload the media with `gh pr edit <number> --body-file <description.md> --attach '<file>#<caption>'`, as [file-pr](../file-pr/SKILL.md) describes. In the body, give each screenshot as a Markdown image whose target is its local path, such as `./kamera.png`. Do not put the video path in the body: `--attach` does not replace a plain path and adds the video at the end of the description. Keep the rest of the description unchanged. If the flow found a defect, report it to the user instead of hiding it in the PR.

Then remove the label with `gh pr edit <number> --remove-label simulator-check`. When the check fails or finds a defect, keep the label, add a PR comment that states what failed with the relevant log lines, and include it in the final report, so the user sees it.

Remove the worktrees with `git worktree remove --force` when done. Finish with one line for each PR checked: the PR, the result, and a link to the new section or comment. With nothing to check, finish with one line that says so.
