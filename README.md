# Kvittering

A mobile-first grocery receipt app for a private household with two members. The interface uses Norwegian, NOK, integer øre, and Europe/Oslo dates.

## Local setup

Use Bun 1.4.0 and Node.js 22 or later.

```sh
bun install
bunx convex dev --once
```

Keep the development deployment values in `.env.local`. Set the provider keys and authentication secret in `.env`; see `.env.example`.

```sh
bun scripts/configure_development.ts
bunx convex dev --once
bun run dev
```

Open [the local app](http://localhost:5180). Create an account with a password of at least 12 characters. Create a household. The second person creates a separate account and enters the invitation code shown under **Husstanden**. The membership limit is enforced in a database transaction. Email ownership verification and password recovery are not configured in this first version.

The configuration script only accepts a `dev:` deployment. It passes values to the Convex CLI through standard input and does not print keys. `RECEIPT_SITE_URL` can override its default app origin, `http://localhost:5180`.

## Environment variables

| Variable                 | Location           | Purpose                                                                        |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------ |
| `CONVEX_DEPLOYMENT`      | Local `.env.local` | Personal development deployment selected by the Convex CLI                     |
| `PUBLIC_CONVEX_URL`      | SvelteKit / Vercel | Convex query, mutation, and realtime URL                                       |
| `PUBLIC_CONVEX_SITE_URL` | SvelteKit / Vercel | Convex HTTP action URL; copy the exact value from Convex, including its region |
| `SITE_URL`               | Convex             | Exact browser origin, without a trailing slash; controls auth and image CORS   |
| `BETTER_AUTH_SECRET`     | Convex             | Random secret of at least 32 characters                                        |
| `OPENAI_API_KEY`         | Convex             | Receipt image extraction key                                                   |
| `OPENAI_RECEIPT_MODEL`   | Convex             | Default `gpt-5.6-luna`                                                         |
| `TYPESAFE_API_KEY`       | Convex             | Product classification key                                                     |
| `TYPESAFE_MODEL`         | Convex             | Default `jev-latest`                                                           |
| `RECEIPT_PROVIDER`       | Convex, optional   | Set to `mock` for a labelled demonstration; leave unset for live providers     |

Provider keys never enter the browser bundle. The browser talks directly to authenticated Convex image endpoints. The SvelteKit server only proxies authentication requests.

If the OpenAI key is missing, extraction returns the Battery fixture and marks the result as mock output. If the TypeSafe key is missing, products stay unclassified and carry a mock classification label. A live provider error is a processing failure; the app does not silently replace it with mock data. The provider label remains available in each receipt's processing information.

## Receipt workflow

1. Take a photo or select up to eight images. Each image becomes a separate receipt by default. For sections of one receipt, select **Bildene er deler av samme kvittering**. JPEG, PNG, WebP, and HEIC are supported. The browser converts images to JPEG with a maximum dimension of 2400 pixels. The server stores these capture images; it does not retain the source HEIC file.
2. Press **Lagre kvittering**. The app first writes the images to IndexedDB. Only after that write completes does it show **Lagret på denne enheten**.
3. The upload queue reserves a receipt using a stable request ID. It records every completed image upload. A repeated request or lost acknowledgement does not create another receipt or another image slot.
4. After all images arrive, a Convex Workflow runs extraction, applies confirmed product aliases, calls Jev for unfamiliar products, and stores the result. Failed provider calls have bounded retries.
5. Review the photos, names, dates, quantities, categories, amounts, discounts, and pant. Add or remove lines as needed. Resolve unclear fields and financial discrepancies before marking the receipt reviewed.

The application shell works offline after a successful online visit to the production build. Capture and the local queue remain available offline for the last signed-in household. History and original server photos require a connection. Uploads resume while the app is open after connectivity returns. The app does not depend on background upload support when a mobile browser is closed. Clearing browser storage deletes photos that have not yet uploaded. The app requests persistent browser storage after saving, but a browser can refuse it.

To test the service worker locally, use the production build on the same configured origin:

```sh
bun run build
bun run preview --host localhost --port 5180 --strictPort
```

Stop the development server first. Install the app from the browser menu or use **Add to Home Screen** on iPhone. Camera access on a phone requires HTTPS; plain HTTP on a computer's LAN address is not a supported camera deployment.

## Accounting and product matching

- Product lines, item discounts, receipt discounts, deposits, deposit returns, other adjustments, VAT, and savings summaries have separate types.
- All stored money values are integer øre. VAT and repeated savings summaries do not contribute to totals.
- A product amount is its printed line amount. A separate linked discount is applied once. Receipt-wide discounts are allocated proportionally in whole øre. Unlinked discounts and other adjustments remain visible under unallocated spending.
- Unknown and non-NOK currencies remain visible for review and are excluded from NOK totals and product price comparisons. There is no currency conversion.
- Amounts are never changed to force a receipt to balance. Unknown values remain null. Repeated equivalent discount lines, invalid signs, quantity/price discrepancies, and total differences need review.
- Pant is included in cash paid and excluded from product spending. Reviewed and provisional data are labelled separately. Suspected duplicates remain present until a member explicitly excludes one from spending.
- Alias matches require the same store, exact normalized product name, brand, package size, package unit, and sale unit. There is no fuzzy name matching. Choosing **Husk kategori** saves only the classification for matching descriptions. Product identity is stored separately. Existing matches update in small batches. Item-only category corrections keep their category.
- Products without a product record remain separate in product history. Price history shows net amounts per purchase.
- Every extraction is stored separately. Reprocessing after manual edits keeps the edited receipt intact and stores the new extraction for comparison. Revision checks prevent one member from silently replacing another member's changes.
- Search and reports load the household history through paginated, indexed queries. The interface labels totals as incomplete while pages are still loading. This first version is intended for one small household, not a large reporting workload.

Jev receives product descriptions, supported attributes, category definitions, and linked discount product descriptions. It does not receive images, receipt totals, payment details, or household member data. Related descriptions matter: the supplied receipt's `BATTERY REMIX` line is identified more reliably with its linked `Battery energidrikk` offer text.

### Overlapping receipt images

Combined images are read together. Extraction uses neighbouring rows and partial rows to reconstruct receipt order, even when upload order differs. A clearly repeated receipt row appears once, with its source image numbers retained. Equal product names or prices alone do not cause a merge. Uncertain overlap remains as separate rows with a review warning. Original image text is retained, and the existing total check remains active. Model extraction can still make errors; reviewed edits remain protected during reprocessing.

## Product matching

Each receipt line keeps its original text and its first extracted receipt name. The matching key changes only case and repeated whitespace. Flavour, size, punctuation, and words such as “zero” stay in the key. Mappings belong to one household and one normalized retailer name; branches of the same retailer can share a mapping.

Processing first checks saved receipt-name mappings. For unfamiliar names, indexed name searches retrieve a small candidate set. Code removes conflicting brands, package sizes, and zero variants, then ranks at most five candidates. Jev selects an existing product, a distinct new product, or uncertain. A match or new product requires confidence of at least 0.85. This is a conservative starting policy, not a measured accuracy guarantee. Missing size does not establish a match to a sized candidate. The app never fills a receipt's missing size from a product record.

Jev receives only product names, brands, explicit package details, and attributes. It receives no prices, payment details, household IDs, or images for matching. Requests contain up to 12 items. Model calls stop after a service failure or a bounded processing period; unresolved items stay separate and receipt processing continues. Final product and mapping writes are transactional and recheck saved mappings, so a concurrent correction takes priority over an earlier model result.

Product matching runs in the background and does not require a review decision. To correct a match, expand a product line, open **Endre produktkobling**, and use **Koblet produkt**. The product search loads only when this optional editor is opened. Search existing products, create a separate product from the line, or choose **Hold varen separat**. Press **Lagre endringer** to save. The choice applies to that line and future matching receipt names from the same retailer. It does not rewrite other historical receipts. Explicit separation is also remembered. Reprocessing keeps manual corrections. Existing receipts can receive product links through the same review control; there is no automatic historical migration.

Receipt review includes **Slett kvittering** with a confirmation step. Deletion removes the receipt from totals immediately and removes its images, extraction history, and edit history. Shared products and saved mappings remain. Uploads must finish before deletion; receipts can be deleted during processing.

Product purchase counts, cumulative spending, and price history group by product record. Category aliases no longer establish product identity. Package-size and unit-price controls and comparisons are omitted. Raw receipt details remain stored. Product matching does not change receipt amounts or category assignments.

## Tests and verification

```sh
bun run test
bun run check
bunx tsc --noEmit -p convex/tsconfig.json
bunx tsc --noEmit -p src/service-worker/tsconfig.json
bun run lint
bun run build
bun run test:e2e
```

The unit and Convex tests cover the Battery example, repeated savings summaries, weighted products, unknown totals, integer money validation, interrupted upload recovery, duplicate processing, household access checks, stale edits, preservation of manual corrections, and exact alias propagation.

Run `bun scripts/verify_providers.ts` to check model access and a small live Jev classification. This sends one classification request to TypeSafe.

The browser suite checks offline shell loading. Set `E2E_STORAGE_STATE` to a Playwright storage-state file for a signed-in test household to also test persistent offline photo capture. This optional test stays offline and does not upload its image. Run against the production preview, not the development server.

The local implementation was also tested in Chromium at desktop and phone sizes with the supplied receipt photo. Live tests used a separate test household with two accounts. Both accounts could read the receipt and its protected photo. Offline capture survived a full reload, resumed upload on reconnection, and flagged the repeated photo as a duplicate. The repeated test receipt was explicitly excluded from spending. Real iOS camera behavior and installation still need an on-device check.

## Vercel deployment

This repository uses SvelteKit 3 preview. Use the pinned matching preview Vercel adapter from the lockfile; the stable version 6 adapter is incompatible with its build API. Better Auth is pinned to the 1.6 release line required by the Convex component.

1. Create a Convex production deployment. Set its `SITE_URL`, `BETTER_AUTH_SECRET`, and provider variables. Use different secrets for production.
2. Deploy the Convex functions with `bunx convex deploy` after confirming the production target.
3. Import the repository into Vercel. The commands in `vercel.json` select Bun 1.4.0 explicitly for installation and build, because older Bun versions cannot read this lockfile. Select Node.js 22. The adapter creates the Build Output API files in `.vercel/output` and uses Stockholm (`arn1`) for server functions.
4. Set `PUBLIC_CONVEX_URL` and `PUBLIC_CONVEX_SITE_URL` on Vercel to the production deployment URLs. Provider keys belong in Convex, not in public Vercel variables.
5. Set the Convex `SITE_URL` to the exact HTTPS Vercel or custom-domain origin. Redeploy when public URLs change. Use a separate Convex preview deployment and matching origin for preview URLs.
6. Open the HTTPS site, create the two accounts and household, test capture, close/reopen recovery, review, and install on each phone.

The phone test site is [kvittering-kappa.vercel.app](https://kvittering-kappa.vercel.app). Its private source repository is [Tollii/kvittering](https://github.com/Tollii/kvittering), connected to the `kvittering` project in the `tolliis-projects` Vercel account. Updates to `main` deploy the frontend automatically.

This test site uses the existing Convex **development** deployment, `agile-falcon-148`, including its test accounts and data. Its `SITE_URL` is now `https://kvittering-kappa.vercel.app`. The single-origin auth and image configuration accepts this hosted origin; local authenticated testing requires changing `SITE_URL` back to `http://localhost:5180`, which temporarily disables hosted authentication. Use a separate Convex deployment for independent local and hosted testing. Backend changes still require an explicit Convex deployment.

Only the two public Convex URLs are configured on Vercel. Authentication data, receipt images, model processing, and provider secrets remain in Convex. The unused SQLite starter backend has been removed.

## Verified provider references

- [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna): image input, Responses API, and structured output support.
- [OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs): `responses.parse` with a Zod schema.
- [TypeSafe HTTP API](https://docs.typesafe.ai/api): `jev-latest`, typed Choice questions, and confidence values.
- [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript): `TypeSafeClient.systemOne` and `choice`.
- [Convex Better Auth integration](https://convex-better-auth.netlify.app/framework-guides/sveltekit).
- [SvelteKit Vercel adapter](https://svelte.dev/docs/kit/adapter-vercel).

Model identifiers and account access were checked on 17 September 2026. Model classifications remain provisional until reviewed. A single receipt test does not establish general extraction accuracy.

### Interface and insight conventions

The interface uses Tailwind CSS 4, shadcn-svelte components, Geist typography and Lucide icons. Shared controls are in `src/lib/components/ui`; the green theme is in `src/app.css`. Charts use LayerChart through the shadcn chart container. Each chart has a selectable list as a keyboard-accessible alternative.

Current-month comparisons use the same calendar days in the previous month, limited to that month's last day. Completed months use the full month. Figures describe recorded receipts, with pending review and missing product links shown separately. Receipt review retains summary and VAT lines behind a display option.

Product history shows net purchase totals, without volume or weight conversion. Typical price is the median observation. Returns and unknown dates are excluded from price summaries and counted in the displayed omission notice. Automatic product links and user confirmations have separate labels.

## Receipt-ready notifications

Open household settings and select **Slå på varsler** under **Varsler**. This opts in the current device for receipts uploaded by the signed-in person. On iPhone and iPad, first add the app to the Home Screen and open it there. Browser permission must be granted from the button press.

The existing service worker displays Web Push messages and opens the receipt when tapped. Images must finish uploading before the app can be closed. Receipt processing schedules notifications independently; delivery failures cannot fail receipt processing. Each receipt schedules at most one notification per subscribed device, with up to two retries for temporary failures. Notification tags replace duplicate deliveries. Deleted, excluded, or already-reviewed receipts are skipped. Expired subscriptions are removed. Signing out disables notifications on that device.

Convex requires `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Generate one pair with `web-push.generateVAPIDKeys()` and keep the private key only in Convex environment variables. Keep the same pair across deploys; rotation requires devices to subscribe again. `SITE_URL` is the VAPID contact URL. No Vercel secret or additional push service account is needed. Apple, Google, Mozilla and Windows browser push endpoints are accepted.

Push delivery depends on the device's notification permission, connectivity and operating-system settings. The inbox remains the authoritative receipt status.
