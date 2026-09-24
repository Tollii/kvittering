# Features

What the app does and how receipt processing and the product catalog behave. [Architecture](architecture.md) covers data ownership and the receipt flow.

## App functions

- Apple sign-in and account creation on supported iOS devices, with email and
  password as an alternative. Existing users can connect Apple in Settings.
  Sessions use iOS Keychain through Expo SecureStore. See
  [Apple setup](native-ios.md#apple-authentication).
- Shared households with two members and private invitation codes.
- Full-screen camera and photo-library capture. Up to eight images can form one receipt or separate receipts. Images are converted to JPEG.
- PDF receipts: pick them from Files, or share images and PDFs to Kvitto from any app via the iOS share sheet (`expo-share-intent`). PDF pages are rendered to JPEG on the device (PDFKit, in the `receipt-intelligence` module) and enter the normal upload queue as one receipt.
- Persistent receipt images and an SQLite upload queue. Uploads start immediately and retry silently while the app is open and connected. A failed request does not create a second receipt. Reading and categorization run as a durable Convex workflow on the server, so the phone is only needed for the upload.
- Receipt review as a checklist: one action chip per open question, one-tap confirmation of suggested categories, and swipe-to-approve in the inbox when categories are all that remain. Confirmed categories are remembered per store and settle the same item on later receipts, approving them automatically when nothing else is open. Every approved receipt also teaches a looser memory keyed by store and receipt name (`categoryMemory`): after two agreeing approvals, or one explicit "husk", an uncertain reading of that item is settled without asking.
- Receipt review, correction, category memory, product matching, duplicate checks, exclusion, reprocessing, and deletion.
- Spending by month, category, store, and purchase type; daily purchase calendar; receipt and product history.
- **Forbruk → Utforsk → Forbruksanalyse** compares weeks or months, including partial periods. It separates changes in price per quantity and purchased quantity for comparable product families. Other purchases and unknown quantities remain separate. Tap a result to inspect its receipt lines; **Oppdater analyse** refreshes the receipt history. The existing weekly notification includes the change from the previous week when comparison data exists.
- **Forbruk → Utforsk → Produktegenskaper** groups purchases by product type, sugar variant, or preparation. This can combine product families across brands, such as all cola. Unknown attributes and incomplete quantities remain visible.
- **Innstillinger → Rettelser og læring** records new human category and catalog decisions. Category corrections can be previewed and applied to matching receipt names from the same store, with undo. Later manual decisions are protected. **Test Jev** checks the current classifier against the latest recorded category decision per product in one request.
- Price signals: a linked product whose net unit price is 15 % or more off the household's median for that product (three or more earlier purchases) gets a `+30 % vs vanlig` chip on the receipt line, and the month's surprises are listed under Forbruk → Utforsk → Prissjekk.
- Optional monthly budget (Settings → Budsjett). Forbruk shows pace against the elapsed share of the month; a Sunday-evening push (`convex/crons.ts` → `digest.sendAll`) summarises the week and the budget position for subscribed devices.
- Native tabs, SF Symbols, native date selection, light and dark themes, and system sharing.

Capture works offline after the account and household have been loaded once. Receipt images stay on the device until the server confirms the upload. The queue is separate for each account and household. Server receipt history and edits need a connection; the app does not promise background uploads after iOS suspends it, but processing never depends on the phone once the images are in storage.

iOS is the primary target. The application and Convex backend are at the repository root. See [the architecture guide](architecture.md) for data ownership and the receipt flow.

## Product catalog

Set `KASSALAPP_API_KEY` in the **Convex development deployment**. Keep it out of the Expo environment. Kassalapp calls run on the server. `TYPESAFE_API_KEY` enables category inference and exact product selection from the returned candidates.

New receipts get catalog enrichment after extraction. On an existing receipt, select **Finn produkter og butikk**. Each product row also has a catalog search and product details. Physical stores can be selected in receipt details. A failed lookup or an item missing from the catalog does not block receipt approval. Explicit category and product corrections take priority over automatic results.

Matching groups interchangeable catalog records before sending candidate and category questions in one Jev request. Word order and packaging descriptions can differ within a group. Different brands, sizes, pack counts, organic variants, and recipes stay separate. Missing metadata joins a group only when it cannot bridge conflicting alternatives. Each unresolved candidate group uses Noul to estimate whether it is the purchased product. One compatible group at or above 0.80 is linked automatically; competing groups stay unresolved. Saved links and unique name matches do not need another model decision. Candidate probabilities and decision reasons are stored on the receipt for diagnosis. Provider failures remain separate from negative matches.

Equivalent matches use a stable group identity and a representative image. They resolve the manual matching queue but do not confirm a barcode, package weight, ingredients, allergens, nutrition, or exact-product price comparison. Receipt quantity evidence remains available to the existing product-family analysis. The product sheet labels these links **Tilsvarende produkt** and allows an exact manual selection. Group records never fetch provider details or prices for the representative. Run `catalogMatchingEvaluation:evaluate` on the selected development deployment to check fixed examples with the live classifier without changing receipts.

- Orval generates the server client from `api/kassalapp.openapi.json`. Run `npm run generate:catalog` after updating the spec. The transport adapts boolean query parameters to the API's required `1`/`0` encoding.
- Convex shares normalized search results and product records across households. Search results last one day, empty results seven days, product and store data thirty days, and requested prices six hours. Identical pending requests share one job. Receipt data and saved corrections remain private to the household.
- TanStack Query caches lookup results on the device with SQLite persistence, scoped to the account and household. Receipt subscriptions continue to use Convex directly. The API client is generated; the app hooks are small wrappers around authenticated Convex functions so the API key remains on the server.
- Loaded receipt pages remain subscribed while their screen is mounted, including when another screen covers it. Optional reports start on first use. The Convex query cache retains up to 40 idle subscriptions for five minutes after a screen closes, so return navigation can use live results. This cache is memory-only and releases its subscriptions when the account or household scope is removed.
- There is no server requests-per-minute counter. HTTP `429`, network failures, and server errors get up to three attempts with delayed retries. `Retry-After` is respected. Final errors retain prior data and expire after ten minutes. New receipts remain usable during failure.
- EAN identifies the same packaged product across shops. Records without EAN keep their Kassalapp ID. Equivalent groups have separate keys and retain their source record keys; source records and receipt rows are never merged. Product, brand, and store summaries use receipt amounts after item discounts, not current catalog prices. Unallocated receipt discounts remain in the existing accounting overview.

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
catalog matching and edits. Older receipts use the explicit `productAnalysis.repair` operator recovery operation.
Generation, revision, evidence and analysis-version checks reject stale results. Provider
failures leave the receipt usable and can retry later. This stage uses `TYPESAFE_API_KEY`
and `TYPESAFE_MODEL` (default `jev-latest`); it does not make extra Kassal.app requests.

Run the arithmetic, ownership and stale-result checks with `npm test`. The internal
`productAnalysisEvaluation:evaluate` action runs six fixed family cases against Jev and
returns expected and actual choices. It calls the model but does not change receipt data.

Product attributes use the same receipt and cached catalog evidence as package analysis,
including available ingredients, nutrition, and labels. Their independent questions share
the existing Jev request, and the product profile caches the results. Decisions below 0.80
remain unknown. Missing or rounded nutrition alone does not establish a sugar-free variant.
The internal `productAnalysisEvaluation:evaluateAttributes` action checks six fixed attribute
cases in one request without changing receipts.

Spending comparisons use net receipt amounts and exclude deposits and unresolved duplicates.
Price effects can include a change in stores, discounts, or package sizes; they are not a
measurement of inflation. Physical quantities must be known for every compared line. Counts
are comparable only with the same package identity. The effects and remaining difference add
up to the total change. These figures describe purchases, not measured consumption.

Correction history starts when this feature is installed; it does not reconstruct older
decisions. The screen pages through decisions and receipt groups. Preview continuation retains every matching line; each apply operation accepts at most 20 selected lines. Changes require the previewed receipt revisions
to remain current. Undo also requires unchanged revisions, so it cannot overwrite a later edit.
Batch propagation does not create more learning or evaluation examples. The category test is
an agreement check on those examples, not an estimate of accuracy on all purchases.
