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

For Expo Go, set `ALLOW_EXPO_GO=true` on the Convex development deployment with `npx convex env set ALLOW_EXPO_GO true`. Expo Go sends an `exp://` origin instead of the app scheme. Leave this setting unset on production deployments. No native rebuild is needed when this server setting changes.

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

## Product catalog

Set `KASSALAPP_API_KEY` in the **Convex development deployment**. Keep it out of the Expo environment. Kassalapp calls run on the server. `TYPESAFE_API_KEY` enables category inference and exact product selection from the returned candidates.

New receipts get catalog enrichment after extraction. On an existing receipt, select **Finn produkter og butikk**. Each product row also has a catalog search and product details. Physical stores can be selected in receipt details. A failed lookup or an item missing from the catalog does not block receipt approval. Explicit category and product corrections take priority over automatic results.

- Orval generates the server client from `api/kassalapp.openapi.json`. Run `npm run generate:catalog` after updating the spec. The transport adapts boolean query parameters to the API's required `1`/`0` encoding.
- Convex shares normalized search results and product records across households. Search results last one day, empty results seven days, product and store data thirty days, and requested prices six hours. Identical pending requests share one job. Receipt data and saved corrections remain private to the household.
- TanStack Query caches lookup results on the device with SQLite persistence, scoped to the account and household. Receipt subscriptions continue to use Convex directly. The API client is generated; the app hooks are small wrappers around authenticated Convex functions so the API key remains on the server.
- There is no server requests-per-minute counter. HTTP `429`, network failures, and server errors get up to three attempts with delayed retries. `Retry-After` is respected. Final errors retain prior data and expire after ten minutes. New receipts remain usable during failure.
- EAN identifies the same packaged product across shops. Records without EAN keep their Kassalapp ID; similar names alone do not merge products. Receipt rows are never merged. Product, brand, and store summaries use receipt amounts after item discounts, not current catalog prices. Unallocated receipt discounts remain in the existing accounting overview.

Prices are fetched only when **Hent butikkpriser** is selected. Fresh foods and unlisted items remain ordinary receipt lines. Nutrition is displayed as product information; it is not used to calculate intake.

### Compare receipt engines on iOS

In Settings, select **GPT** or **Foundation Models** under **Lesing av kvitteringer**.
The choice is stored on this device and captured when a receipt enters the upload queue.
GPT uses the existing server pipeline. Foundation Models uses Apple Vision document OCR
and on-device Foundation Models for extraction and categorization. It requires iOS 26+
and an available Apple Intelligence model with Norwegian support. Build the native app
with `npm run ios:build`; the custom module is not included in Expo Go.

To compare the same images, change the setting, open a receipt, and choose **Les bildene
på nytt**. **Sammenlign lesinger** shows the saved text, amounts, categories, engine and
processing time. Existing manual edits remain in place, and the purchase is counted once.
Catalog enrichment is shared by both engines and runs after the saved reading, so compare
the reading snapshots when evaluating OCR and categorization. Older snapshots have no
category or timing details. Times cover extraction and classification, exclude upload/download and catalog matching,
and are not a controlled performance benchmark.

Keep the app open during local processing. A local failure stays in the inbox for an
explicit retry; it never switches to GPT. Successful local results remain in the durable
queue if upload completion fails. Receipt images still synchronize to Convex.
