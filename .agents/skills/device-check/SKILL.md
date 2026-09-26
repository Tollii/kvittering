---
name: device-check
description: Run the Kvitto iOS app on a Revyl cloud iPhone against a seeded preview backend, drive it with the Revyl CLI, and collect screenshots and video. Use when a change alters what a person sees or does in the app and no local iOS Simulator is available, as in Linux cloud sessions, or when the user asks for a device check.
metadata:
  harness: [claude]
  platform: [linux, macos]
  scope: project
---

# Check a change on a cloud iPhone

Revyl runs an iOS Simulator in its cloud. You control it with the `revyl` CLI; only Metro runs in your session. The app is the real native Kvitto dev client, so SF Symbols, native tabs, Keychain, and native modules behave as on iOS.

The setup has three parts:

- **Backend.** A Convex preview deployment for your branch, with your branch's functions, the mock receipt provider, and an end-to-end fixture: an account, a household, and its data. It is disposable; nobody else uses it.
- **Native binary.** A simulator build of the dev client, uploaded to Revyl with the version name `ios-<runtime version>-<timestamp>`. The runtime version is the expo-updates fingerprint (`runtimeVersion.policy: "fingerprint"` in `app.json`), so a build fits the working tree when the fingerprints are equal.
- **JavaScript.** Metro runs in your session and Revyl relays it to the device. JS/TS edits hot-reload without a new build.

## Start

```sh
tools/device/create_backend.sh      # optional argument: a fixture name in tools/e2e/fixtures
tools/device/start_ios_session.sh
```

`create_backend.sh` prints the backend URL and the account email. Rerun it after backend changes, or to reset the data. The fixtures are the ones that the Maestro flows use; add a fixture there when a check needs other data.

`start_ios_session.sh` prints JSON with `session_id` and `viewer_url`. Commands target this session by default; with more than one live session, pass `-s <session_id>`. The first load takes up to a minute while Metro bundles.

Exit status 3 means that no build fits the current fingerprint, because native code, config plugins, `app.json`, `eas.json`, `.gitignore`, or native dependencies changed. Then run `tools/device/build_ios_binary.sh` and start again. On Linux it reuses an EAS cloud build with the same fingerprint, or starts one (about 15 minutes); on a Mac it builds with Xcode. Build only when the script asks for it: builds cost time and EAS build credits, and JS changes never need one.

## Sign in

Use the seeded account. Do not sign up, and do not use other credentials.

```sh
email=$(node -p 'require("./build/device/seed/account.json").email')
password=$(node -p 'require("./build/device/seed/account.json").password')
revyl device tap --target "Logg inn med e-post"
revyl device type --target "E-post field" --text "$email"
revyl device type --target "Passord field" --text "$password"
revyl device tap --target "Logg inn button"
revyl device validation "The main tabs of the app are visible"
```

Apple sign-in does not work on the simulator. The session persists until the app is reinstalled, so sign in once per device session.

## Drive the app

Targets are descriptions of visible elements, in the app's language (Norwegian). Revyl finds the element; no coordinates are necessary.

```sh
revyl device instruction "Open the Innboks tab"
revyl device tap --target "First receipt in the list"
revyl device swipe --target "Receipt lines" --direction up
revyl device validation "The receipt shows three lines"
revyl device screenshot --out build/device/media/receipt/01-receipt.png
```

- `instruction` performs one multi-step intent. Use it for navigation, and `tap`/`type` for exact steps.
- `validation` is a semantic check and exits non-zero when it fails. With `--json`, read `success`.
- Read each screenshot yourself before you use it as evidence. A splash screen, spinner, or red error screen proves nothing.
- `revyl device hierarchy` prints the UI tree, `logs` shows device logs including JS errors, and `requests` shows network calls.

The [revyl-cli-dev-loop](../revyl-cli-dev-loop/SKILL.md) skill has the complete command reference.

## Collect evidence

Save screenshots for the PR in `build/device/media/<flow>/`, numbered in flow order. Revyl records every session; get the video from the report:

```sh
revyl device report --json > build/device/report.json
curl -fsS -o build/device/session.mp4 "$(node -p 'require("./build/device/report.json").video_url')"
```

The recording is large (about 20 MB per minute), and GitHub rejects videos over 10 MB. Trim it to the steps that the change needs and scale it down:

```sh
ffmpeg -i build/device/session.mp4 -ss <start> -to <end> -vf scale=390:-2 -an build/device/media/<flow>/flow.mp4
```

Each step in the report has `video_timestamp_start`, which gives the start and end times. Publish the directory with `tools/visual/publish-media.sh build/device/media/<flow>` and use the Markdown it prints, as [file-pr](../file-pr/SKILL.md) describes. Caption each item with what it proves. `report_url` and `viewer_url` need a Revyl login, so do not use them as PR evidence.

## Stop

```sh
revyl dev stop
```

Always stop the session when you are done or when you give up. A device costs money while it runs; an idle session stops only after 30 minutes. Preview deployments expire by themselves.

## When it fails

- `revyl dev` says the build has no Expo dev-client metadata: the build was uploaded with `revyl build upload`. Upload only through `build_ios_binary.sh`.
- `eas build --local` fails with "Runtime version calculated on local machine not equal": a local Xcode build changed a file in `node_modules` (for example `react-native-maps/ios/AirMaps/RNMapsDefines.h`). Reinstall the package with `rm -rf node_modules/<package> && npm install`.
- The app shows "Searching for development servers": Metro is not relayed. Stop the session and start it again, and check `.revyl/dev-sessions/detach.log`.
- Sign-in fails with a server error: check that the project's default preview environment variables are set, as `create_backend.sh` describes.
- Run `revyl doctor` for authentication and network problems. The environment needs `REVYL_API_KEY`, `CONVEX_DEPLOY_KEY`, and, for new builds, `EXPO_TOKEN`; `tools/device/install_cloud_tools.sh` installs the tools.
