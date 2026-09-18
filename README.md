# Kvitto

An Expo 57 / React Native app for household grocery receipts. iOS is the primary platform. The app uses Convex for authentication, storage, receipt processing, and live updates.

## Run on iPhone or the simulator

Use Node.js 22.13 or later and Xcode 26.4 or later.

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

The simulator has no receipt camera. Import an image into its photo library, then select **Velg fra bilder**. Check camera capture on a physical iPhone.

## App functions

- Email and password sign-in. Sessions use iOS Keychain through Expo SecureStore.
- Shared households with two members and private invitation codes.
- Camera and photo-library capture. Up to eight images can form one receipt or separate receipts. Images are converted to JPEG.
- Persistent receipt images and an SQLite upload queue. Uploads resume when the app is open and connected. A failed request does not create a second receipt.
- Receipt review, correction, category memory, product matching, duplicate checks, exclusion, reprocessing, and deletion.
- Spending by month, category, store, and purchase type; daily purchase calendar; receipt and product history.
- Native tabs, SF Symbols, native date selection, light and dark themes, and system sharing.

Capture works offline after the account and household have been loaded once. Receipt images stay on the device until the server confirms the upload. The queue is separate for each account and household. Server receipt history and edits need a connection; the app does not promise background uploads after iOS suspends it.

The browser command is for layout inspection. Native capture and persistent offline storage require iOS or Android. The old PWA in `sveltemo/` is a reference and is excluded from Metro, TypeScript, lint, and tests. The active backend is `convex/` at the root; do not run the old backend at the same time.

## Convex configuration

The existing receipt extraction and classification pipeline is retained. Configure `BETTER_AUTH_SECRET` and the selected provider's credentials (`OPENAI_API_KEY` or `TYPESAFE_API_KEY`) in Convex. Existing `RECEIPT_PROVIDER`, `OPENAI_RECEIPT_MODEL`, and `TYPESAFE_MODEL` settings still apply.

Authentication requests go directly to `EXPO_PUBLIC_CONVEX_SITE_URL`. The server trusts the `kvitto://` application scheme. The Svelte authentication proxy is no longer required.

Push notifications now use Expo push tokens instead of browser subscriptions. To use them, configure an EAS project ID in `expo.extra.eas.projectId`, configure Apple push credentials, and install a development or release build on a physical iPhone. If Expo push security is enabled, set `EXPO_ACCESS_TOKEN` on Convex. The settings screen explains when native push is unavailable. Notifications remain optional for receipt processing.

Native push subscriptions use the deviceSubscriptions table. Existing browser subscriptions and IndexedDB captures are not migrated.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo export --platform ios
```

The tests cover receipt accounting, classification, matching, household access, concurrent receipt revisions, notifications, and interrupted uploads. The npm override allows the current Vitest version with Better Auth's older optional test peer range.

Expo APIs follow the [version 57 documentation](https://docs.expo.dev/versions/v57.0.0/). Authentication follows the [Convex Expo integration](https://labs.convex.dev/better-auth/framework-guides/expo).
