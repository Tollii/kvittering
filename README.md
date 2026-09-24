# Kvitto

Household grocery receipts for iPhone. Photograph or share a receipt; Kvitto
reads it, categorizes the lines, links products, and reports what the household
buys. Expo 57 / React Native, with a Convex backend.

## Develop

Needs Node.js 24 and Xcode 26.4 or later.

```sh
npm install
[ -e .env.local ] || cp .env.example .env.local  # then set your deployment and URLs
npm run backend             # Convex dev deployment, in one terminal
npm run ios:build           # build and open the app; later, npm start
```

Provider keys and `BETTER_AUTH_SECRET` belong in the Convex deployment, never in
`EXPO_PUBLIC_*`. The simulator has no camera: import an image and use **Velg fra
bilder**. [Development](docs/development.md) covers devices, backend settings,
and staging.

## Check

| When                | Command                 |
| ------------------- | ----------------------- |
| After each change   | `npm run check:changed` |
| Before committing   | `npm run check`         |
| iOS flows, on a Mac | `npm run e2e:ios`       |

CI must pass `CI result` before merging. [Verification](docs/verification.md)
explains the checks and how to add one.

## Release

Run the **TestFlight** workflow in GitHub Actions. It checks the code, deploys the
staging backend, builds on Expo, and uploads to TestFlight. Review changes that
affect installed apps with the [release policy](docs/releases.md).

| Builds                | Convex deployment   |
| --------------------- | ------------------- |
| Local and development | `agile-falcon-148`  |
| TestFlight            | `courteous-jay-215` |

## Docs

[Features](docs/features.md) · [Architecture](docs/architecture.md) ·
[Principles](docs/principles.md) · [Quality](docs/quality.md) ·
[Native iOS](docs/native-ios.md) · [Releases](docs/releases.md) ·
[Backend operations](docs/backend-operations.md) ·
[Observability](docs/observability.md)

## License

[FSL-1.1-ALv2](LICENSE.md): use, modify, and self-host freely, but not to offer
a competing product. Each release becomes Apache 2.0 two years after
publication.
