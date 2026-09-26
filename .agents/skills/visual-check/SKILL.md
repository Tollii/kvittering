---
name: visual-check
description: Run the Kvitto app on web in a cloud session, drive a flow with Playwright, and put screenshots and a short video in the pull request. Use for any change that alters what a person sees.
metadata:
  harness: [claude]
  platform: [linux]
  scope: project
---

# Check a change visually

The web build is an approximation of the iOS app. Layout, text, navigation, and JavaScript behavior are real; SF Symbol icons, the camera, Keychain, widgets, the share sheet, and native tab bars are not. The tab bar sits at the top on web. Say so in the PR when the change touches a native-only path, and rely on the `End-to-end` workflow for it (see [verification](../../../docs/verification.md)).

## Start the app

```sh
npm run visual:start
```

This starts a disposable local Convex backend with the mock receipt provider and email sign-up, exports the web build, and serves it at `http://127.0.0.1:8081`. It prints the URL when ready. Rerun it after every source change: the export is static. Data persists between runs; `VISUAL_RESET=1 npm run visual:start` clears it. Logs are in `build/visual/`.

The environment's setup script provides Chromium, ffmpeg, and unzip. If `ffmpeg` is missing, say so and stop rather than committing raw recordings.

## Drive a flow

Write a flow as `tools/visual/flows/<name>.mts` and run it with `node tools/visual/flows/<name>.mts`. [add-receipt.mts](../../../tools/visual/flows/add-receipt.mts) is the worked example: a new member signs up, picks a synthetic receipt photo, saves it, and opens the processed receipt from the inbox.

```ts
import { App, receiptPhoto } from "../app.mts";

await App.run("add-receipt", async (app) => {
  await app.signUp();
  const photo = await receiptPhoto("build/visual/receipt.jpg");
  await app.chooseFiles([photo], () => app.tap("Velg fra bilder"));
  await app.tap("Lagre kvittering");
  await app.tap("Innboks");
  await app.see("Eksempelbutikk", 60_000);
  await app.screenshot("inbox");
});
```

[app.mts](../../../tools/visual/app.mts) opens an iPhone 15-sized page in Norwegian and records video by default. `tap`, `see`, and `type` find an element by test ID, accessibility label, or exact visible text, as Maestro flows do. `app.page` is the Playwright page for anything else. `signUp` creates a fresh account and household, so each run starts empty. The mock provider always returns the same example receipt (Eksempelbutikk).

`App.run` saves numbered screenshots, `flow.mp4`, and a `flow.gif` preview in `build/visual/media/<name>/`, prints that directory, and on failure saves `failed.png` first. Browser errors print to stderr. Look at the screenshots yourself before publishing them: a screenshot of an error screen is not evidence.

Keep flows short. A recording must stay under 9 MB; the helper refuses larger files.

## Before and after

For a before view, run the same flow on `main` in a separate worktree, then rerun `npm run visual:start` on your branch:

```sh
git worktree add ../kvitto-before origin/main
cd ../kvitto-before && npm ci && npm run visual:start
node <path-to-your-flow>.mts
```

Both builds use the same backend and port. A flow that does not exist on `main` can run from your branch's copy of `tools/visual`, as long as its selectors match both builds.

## Put media in the PR

GitHub's attachment upload and `gh pr create --attach` do not work in cloud sessions: the session proxy blocks both, and `gh` needs GraphQL. Media goes to the `pr-media` branch instead, which never merges into `main`:

```sh
tools/visual/publish-media.sh build/visual/media/add-receipt
```

It appends the PNGs, GIFs, and MP4s under `<your-branch>/<flow>/` on `pr-media`, pushes, and prints Markdown for the PR description. Images and GIFs show inline from `raw.githubusercontent.com`; each MP4 is a link through jsDelivr, which plays it in the browser. Links pin the commit, so later pushes do not break them. Never commit media to your PR branch.

Create or edit the PR with `curl` against the REST API, as described in [file-pr](../file-pr/SKILL.md). Caption each image with what it proves and note that it is from the web build.
