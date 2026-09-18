# Kvitto

An Expo 57 / React Native app for household grocery receipts. iOS is the primary platform. The app uses Convex for authentication, storage, receipt processing, and live updates.

## Run on iPhone or the simulator

Use Node.js 22.13 or later and Xcode 26.4 or later.

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
to `@atolness-team/kvitto`. Apple signing and submission credentials are already
stored in Expo. The workflow file must be on the repository's default branch to
show the **Run workflow** button.

The `production` build profile currently connects to the existing Convex development
deployment. Set the public Convex URLs in `eas.json` when this should change.
For a release from your computer, use `npm run testflight`.

## App functions

- Email and password sign-in. Sessions use iOS Keychain through Expo SecureStore.
- Shared households with two members and private invitation codes.
- Full-screen camera and photo-library capture. Up to eight images can form one receipt or separate receipts. Images are converted to JPEG.
- PDF receipts: pick them from Files, or share images and PDFs to Kvitto from any app via the iOS share sheet (`expo-share-intent`). PDF pages are rendered to JPEG on the device (PDFKit, in the `receipt-intelligence` module) and enter the normal upload queue as one receipt.
- Persistent receipt images and an SQLite upload queue. Uploads start immediately and retry silently while the app is open and connected. A failed request does not create a second receipt. Reading and categorization run as a durable Convex workflow on the server, so the phone is only needed for the upload.
- Receipt review as a checklist: one action chip per open question, one-tap confirmation of suggested categories, and swipe-to-approve in the inbox when categories are all that remain. Confirmed categories are remembered per store and settle the same item on later receipts, approving them automatically when nothing else is open. Every approved receipt also teaches a looser memory keyed by store and receipt name (`categoryMemory`): after two agreeing approvals, or one explicit "husk", an uncertain reading of that item is settled without asking.
- Receipt review, correction, category memory, product matching, duplicate checks, exclusion, reprocessing, and deletion.
- Spending by month, category, store, and purchase type; daily purchase calendar; receipt and product history.
- Native tabs, SF Symbols, native date selection, light and dark themes, and system sharing.

Capture works offline after the account and household have been loaded once. Receipt images stay on the device until the server confirms the upload. The queue is separate for each account and household. Server receipt history and edits need a connection; the app does not promise background uploads after iOS suspends it, but processing never depends on the phone once the images are in storage.

iOS is the only target. The old PWA in `sveltemo/` is a reference and is excluded from Metro, TypeScript, lint, and tests. The active backend is `convex/` at the root; do not run the old backend at the same time.

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

Matching collects the search results first, then sends all candidate and category questions for the receipt in one Jev request. Each unresolved candidate uses Noul to estimate the probability that it is the purchased product. One compatible candidate at or above 0.80 is linked automatically; competing matches stay unresolved. Saved links and unique exact matches do not need another model decision. Candidate probabilities and decision reasons are stored on the receipt for diagnosis. Provider failures remain separate from negative matches.

- Orval generates the server client from `api/kassalapp.openapi.json`. Run `npm run generate:catalog` after updating the spec. The transport adapts boolean query parameters to the API's required `1`/`0` encoding.
- Convex shares normalized search results and product records across households. Search results last one day, empty results seven days, product and store data thirty days, and requested prices six hours. Identical pending requests share one job. Receipt data and saved corrections remain private to the household.
- TanStack Query caches lookup results on the device with SQLite persistence, scoped to the account and household. Receipt subscriptions continue to use Convex directly. The API client is generated; the app hooks are small wrappers around authenticated Convex functions so the API key remains on the server.
- There is no server requests-per-minute counter. HTTP `429`, network failures, and server errors get up to three attempts with delayed retries. `Retry-After` is respected. Final errors retain prior data and expire after ten minutes. New receipts remain usable during failure.
- EAN identifies the same packaged product across shops. Records without EAN keep their Kassalapp ID; similar names alone do not merge products. Receipt rows are never merged. Product, brand, and store summaries use receipt amounts after item discounts, not current catalog prices. Unallocated receipt discounts remain in the existing accounting overview.

Prices are fetched only when **Hent butikkpriser** is selected. Fresh foods and unlisted items remain ordinary receipt lines. Nutrition is displayed as product information; it is not used to calculate intake.

Searches and saved product matching use the same formatting rules. For example,
`COCA-COLA10PK BX` and `COCA-COLA 10 PK BX` use one query and cache key. Receipt text,
quantities and amounts stay unchanged. Package counts and variants remain distinct.

Catalog matching links a line without asking the model when the text leaves no doubt: a unique
full match, or the only compatible product that contains every receipt word and adds nothing but
size, pack, packaging or ordinary-variant words (`BATTERY WHIRL` → `Battery Whirl Sugar 0,5l boks`).
**Finn produkter på nytt** in the receipt menu re-runs matching for an existing receipt.

Product-family analysis runs after catalog matching.

### Product families and purchased quantities

**Forbruk → Utforsk forbruket → Mengder kjøpt** groups the same product across package sizes and stores.
Jev selects a family using receipt and cached catalog evidence. It keeps different brands,
flavours and variants such as Original and Zero separate. Exact catalog links and receipt
text remain unchanged. Fresh products can have a family without a catalog match.

Jev also selects the pack count, the meaning of a stated size, and the purchased quantity.
Code converts the selected source values to item counts, grams and millilitres. For example,
two confirmed packs of 10 × 330 ml give 20 items and 6.6 litres. A catalog entry whose pack
count conflicts with the receipt cannot supply missing size data. Unknown amounts stay
unknown; partial totals are labelled. These are household purchases, not measured consumption.

Convex stores household product profiles and reuses them on later receipts. Purchase quantities
are calculated for each receipt line. A durable workflow runs after receipt processing,
catalog matching and edits. Older receipts are analysed when the app is open and online.
Generation, revision, evidence and analysis-version checks reject stale results. Provider
failures leave the receipt usable and can retry later. This stage uses `TYPESAFE_API_KEY`
and `TYPESAFE_MODEL` (default `jev-latest`); it does not make extra Kassal.app requests.

Run the arithmetic, ownership and stale-result checks with `npm test`. The internal
`productAnalysisEvaluation:evaluate` action runs six fixed family cases against Jev and
returns expected and actual choices. It calls the model but does not change receipt data.
