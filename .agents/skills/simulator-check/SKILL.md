---
name: simulator-check
description: Check a pull request's change on the iOS Simulator on this Mac and put screenshots and a video in the PR. Use when the user gives a PR number for a simulator check, typically for a branch that a cloud agent made.
metadata:
  harness: [claude]
  platform: [macos]
  scope: project
---

# Check a pull request on the simulator

The argument is a PR number. The result is simulator screenshots and a short video in the PR description, captured from the real native app against a local backend with seeded data. Cloud sessions cannot run this; they use [visual-check](../visual-check/SKILL.md).

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
   mkdir -p "$cache" && rm -rf "$cache/kvitto.app" && cp -R build/kvitto.app "$cache/"
   ```

   The script starts a local Convex backend with the mock receipt provider, seeds the fixture, builds the app or reuses the cached build for the same fingerprint and Xcode version, and runs the flow. The first build takes 10–20 minutes; a cached run takes a few minutes. When a step fails, fix the flow, not the app: the check reports what the branch does.

4. For a before view, repeat steps 1–3 for the base branch in `../kvitto-pr-<number>-base` with the same flow file.

## Publish

Find the screenshots and the recording: `find . -newer package-lock.json \( -name '*.png' -o -name '*.mp4' \) -not -path './node_modules/*'`. Open each screenshot and check that it shows what its caption will claim; a spinner, splash screen, or error proves nothing. GitHub rejects videos over 10 MB, so re-encode a larger one with `ffmpeg -i in.mp4 -vf scale=390:-2 -an out.mp4`.

Append a `## Simulator check` section to the PR description with a caption for each item, and upload the media with `gh pr edit <number> --body-file <description.md> --attach '<file>#<caption>'`, as [file-pr](../file-pr/SKILL.md) describes. Keep the rest of the description unchanged. If the flow found a defect, report it to the user instead of hiding it in the PR.

Remove the worktrees with `git worktree remove --force` when done.
