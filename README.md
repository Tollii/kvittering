# Kvitto

Kvitto captures household grocery receipts and explains purchases. It uses Expo 57 / React Native on iOS and Convex for authentication, storage, and processing. Reports describe purchases, not consumption; missing evidence remains unknown.

## Documentation

- [Architecture](docs/architecture.md): responsibility boundaries, data flow, and reasons behind the design.
- [Design principles](docs/principles.md): domain modeling and test design.
- [Verification](docs/verification.md): current CI checks, test fixtures, and device-test procedures.
- [Open work](plans/README.md): unresolved findings and design decisions.
- [Release review](.agents/skills/release-review/SKILL.md): assess installed-client compatibility.
- [Release operations](.agents/skills/release-operations/SKILL.md): publish a reviewed release or change live release controls.

Configuration and source own exact values and behavior. [AGENTS.md](AGENTS.md) contains the shared agent instructions (`CLAUDE.md` links to it); [package.json](package.json) defines the commands.

## Run on iPhone or the simulator

Use Node.js 24 and Xcode 26.4 or later.

```sh
npm ci
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

## Backend configuration

[eas.json](eas.json) maps development and TestFlight profiles to their backends and channels. Convex labels persistent TestFlight staging as type `prod`; this does not make it the public App Store backend. Development and staging data change independently.

The local staging command uses `.env.staging.local`, which is ignored by Git. To set up another development machine, create a staging deploy key for the deployment selected from `eas.json`, using the installed Convex CLI's `deployment token create --help`. Save it to that file; leave `.env.local` for personal development. GitHub Actions needs its own key in `CONVEX_STAGING_DEPLOY_KEY`.

Deploy the backend separately using an explicit stage and reviewed revision in
[release operations](.agents/skills/release-operations/SKILL.md#enforced-release-checks).
TestFlight and OTA commands check staging readiness before publishing the client;
they do not deploy the backend.

Configure provider credentials in the selected Convex deployment. Required names and model defaults are read by [providers](convex/providers.ts), [authentication](convex/auth.ts), and the affected integration. Keep them out of `EXPO_PUBLIC_*` variables. Use separate provider accounts/projects and keys for development and staging where possible; separate keys in one account can still share billing or quota.

For push, configure Apple credentials and use a signed physical iPhone. For Apple sign-in, widgets, or ActivityKit setup, follow the native capability checks in [release operations](.agents/skills/release-operations/SKILL.md#native-capabilities). Expo Go cannot verify these integrations.

## Source references

| Concern                                           | Source of truth                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build identities, capabilities, and native assets | [app.json](app.json), [plugins](plugins/), [native module](modules/receipt-intelligence/)                                                                     |
| Release commands and credentials                  | [package.json](package.json), [TestFlight workflow](.github/workflows/testflight.yml), [OTA workflow](.github/workflows/ota.yml)                              |
| Diagnostics and redaction                         | [Sentry initialization](src/lib/sentry.ts), [event handling](src/lib/sentry-event.ts)                                                                         |
| Formatting, lint, and coverage                    | [Prettier](.prettierrc.json), [ESLint](eslint.config.js), [Oxlint](.oxlintrc.json), [repository rules](oxlint.policy.config.mjs), [Vitest](vitest.config.mts) |

Do not copy constants, enabled rules, event catalogs, or feature inventories into documentation. Explain a constraint or procedure only when the code does not make it clear.

## Checks

Merging requires `CI result`, `E2E result`, and an independent approving review.
See [merge requirements](docs/verification.md#merge-requirements-and-repository-settings).

Use `npm run check:changed` during code development, `npm run check` before committing code, and `npm run check:ci` when tests or coverage configuration change. Fix findings without baselines or broad suppressions. Use `npm run lint:docs` for documentation references. See [verification](docs/verification.md) for the current CI and native-test procedures. After a Convex signature change, run `npm run contract:update` and review the resulting contract diff. Commands and tool configuration remain the source of truth for what each check runs.

Expo API work uses the [Expo 57 documentation](https://docs.expo.dev/versions/v57.0.0/). Backend implementation uses the generated guidance through the [Convex skill](.agents/skills/convex/SKILL.md).

## Sentry access

Use the installed `sentry` CLI with saved OAuth credentials: `env -u SENTRY_AUTH_TOKEN sentry ...`. The source-map token cannot read issues. Do not load `.env.local` for an investigation or replace its build token with a user token. Configuration and redaction are in the source references above; use the `sentry-cli` skill for investigation commands.

## License

See [FSL-1.1-ALv2](LICENSE.md) for the terms.
