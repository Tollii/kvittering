# Development

Detailed setup behind the [README](../README.md) quick start.

## iPhone and simulator builds

Use Node.js 24 and Xcode 26.4 or later.

For Xcode 27, keep `ios.enableSceneSupport` enabled in the `expo-build-properties`
plugin. This generates the scene lifecycle required to launch on iOS 27.

```sh
npm install
cp .env.example .env.local # Only if .env.local does not exist.
```

Set the deployment and both public Convex URLs in `.env.local`. Keep provider keys and `BETTER_AUTH_SECRET` in the Convex deployment. Do not put secrets in `EXPO_PUBLIC_*` variables.

Run the backend from the repository root:

```sh
npm run backend
```

In a second terminal, build and open the native app:

```sh
npm run ios:build
```

After the first build, use `npm start` to start Metro. Press `i` to open the simulator. Rebuild with `npm run ios:build` after changes to native packages or app plugins. On a physical iPhone, configure signing in Xcode and use `npx expo run:ios --device`.

For a signed development build with the Apple credentials stored in Expo, use the
`development` profile. Local EAS builds require Xcode, CocoaPods, and Fastlane.

```sh
npx eas-cli build --platform ios --profile development --local --output /tmp/kvitto-development.ipa
npx expo start --dev-client --lan
```

The iPhone must be registered in the provisioning profile for this build. After
installation, open Kvitto and connect to Metro on the Mac. Keep both devices on
the same network and allow local network access when iOS asks. The development
profile uses the existing Convex development deployment.

The simulator has no receipt camera. Import an image into its photo library, then select **Velg fra bilder**. Check camera capture on a physical iPhone.

## Convex configuration

The existing receipt extraction and classification pipeline is retained. Configure `BETTER_AUTH_SECRET` and the selected provider's credentials (`OPENAI_API_KEY` or `TYPESAFE_API_KEY`) in Convex. Existing `RECEIPT_PROVIDER`, `OPENAI_RECEIPT_MODEL`, and `TYPESAFE_MODEL` settings still apply.

Receipt extraction defaults to `gpt-6-luna`. `OPENAI_RECEIPT_MODEL` overrides this default; check each deployment for an existing override before rollout. To restore the previous model, set it to `gpt-5.6-luna`. TypeSafe classification and product analysis continue to use `TYPESAFE_MODEL`, which defaults to `jev-latest`.

Authentication requests go directly to `EXPO_PUBLIC_CONVEX_SITE_URL`. The server trusts the `kvitto://` application scheme. The Svelte authentication proxy is no longer required.

For Expo Go, set `ALLOW_EXPO_GO=true` on the Convex development deployment with `npx convex env set ALLOW_EXPO_GO true`. Expo Go sends an `exp://` origin instead of the app scheme. Leave this setting unset on production deployments. No native rebuild is needed when this server setting changes.

Push notifications now use Expo push tokens instead of browser subscriptions. To use them, configure an EAS project ID in `expo.extra.eas.projectId`, configure Apple push credentials, and install a development or release build on a physical iPhone. If Expo push security is enabled, set `EXPO_ACCESS_TOKEN` on Convex. The settings screen explains when native push is unavailable. Notifications remain optional for receipt processing.

Native push subscriptions use the deviceSubscriptions table. Existing browser subscriptions and IndexedDB captures are not migrated.

## Backend environments and staging

| Use               | Convex reference     | Deployment          | Build configuration             |
| ----------------- | -------------------- | ------------------- | ------------------------------- |
| Local development | `dev/andreas-tolnes` | `agile-falcon-148`  | `.env.local`, EAS `development` |
| TestFlight        | `staging`            | `courteous-jay-215` | EAS `testflight`                |

Both deployments are in Ireland (`aws-eu-west-1`). Convex classifies the persistent
staging deployment as type `prod`; it is a separate named deployment, not the local default.
Staging began as a copy of personal data, stored files, accounts, and provider configuration.
The two databases now change independently. Staging account references use its own auth issuer.
Sessions, signing keys, notification registrations, and background job state were not retained.
Sign in with the existing credentials and enable notifications again in the staging app.

Run `npm run backend` for local development. Deploy staging explicitly with:

```sh
npm run backend:staging -- --stage additive
```

This requires eight-image source for the additive stage. The combined five-image
source is rejected. For the later enforcement stage, use `--stage enforcement`
after the [release checks](releases.md#enforced-release-checks) pass. The command
uses a staging-only deploy key from the git-ignored `.env.staging.local` or the
process environment, leaving `.env.local` unchanged. To configure another development machine:

```sh
npx convex deployment token create staging-local-deploy --deployment courteous-jay-215 --save-env .env.staging.local
```

Use a separately named staging deploy key for GitHub Actions. Do not put provider secrets
or deploy keys in `eas.json` or `EXPO_PUBLIC_*` variables. Update each backend's API keys
in its own Convex dashboard. Device sessions, upload queues, images, and catalog caches
are isolated by backend address; existing personal device storage is preserved.

Backend deployment does not change an installed TestFlight binary. A new TestFlight build
is required to switch it to staging.

See [native iOS integration](native-ios.md) for the Home Screen widget and App Shortcuts. These features require a new native build.

## Release to TestFlight

Use the **TestFlight** workflow under **Actions** in GitHub. Select **Run workflow**,
choose the branch to release, and select an operation:

- `build-and-submit`: Check the code, build iOS on Expo, and upload to TestFlight.
  Leave `build_id` empty. Expo increments the build number.
- `submit-existing`: Upload a completed Expo build. Enter its build ID from the
  Expo build page. This does not rebuild the selected branch.

The workflow runs only when started manually. It waits for the Expo build and
upload to finish. Apple then processes the upload before testers can install it.
The workflow summary links to the build and TestFlight.

Before the first run, add an [Expo access token](https://expo.dev/accounts/atolnes/settings/access-tokens)
as the GitHub repository secret `EXPO_TOKEN`. The token's account must have access
to `@atolness-team/kvitto`. Add a deploy key for staging as `CONVEX_STAGING_DEPLOY_KEY`.
The workflow checks staging backfill readiness but does not deploy the backend.
Deploy the appropriate backend stage separately. Apple signing and submission credentials are already
stored in Expo. The workflow file must be on the repository's default branch to
show the **Run workflow** button.

The `testflight` build profile uses the EAS `preview` environment and Convex staging.
The `development` profile and local Metro builds use the personal Convex deployment.
The `submit-existing` operation accepts only builds made with the `testflight` profile;
older `production` builds still point to the personal backend and must be rebuilt.
For a release from your computer, use `npm run testflight`. This checks staging readiness before
building and submitting the iOS app; it does not deploy staging.

## Notes

- Expo APIs follow the [version 57 documentation](https://docs.expo.dev/versions/v57.0.0/). Authentication follows the [Convex Expo integration](https://labs.convex.dev/better-auth/framework-guides/expo).
- The npm override allows the current Vitest version with Better Auth's older optional test peer range.
