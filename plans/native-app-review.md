# Native app review

Date: 2026-09-18. Scope: product direction and interface review of the Expo 57 iOS app. This is a findings report, not an implementation plan. No application code or saved receipt data was changed during this review.

## Evidence and limits

Inspected the signed-in iPhone 17 Pro simulator through Xcode Device Hub: spending, receipt history, the registered REMA receipt, its expanded item editor and category selector, the empty inbox, capture entry screen, and household settings. Returned to spending after inspection. Did not submit edits, capture images, or change settings.

The first spending screenshot was available. Later screenshot requests returned blank images, while the native accessibility tree continued to expose the controls and navigation. Findings about those later screens are based on their controls, text, and source code, not a complete visual assessment.

The app uses React Native styles and shared components in `src/components/ui.tsx`, SF Symbols, Expo Router native tabs, and Convex. Keep those conventions. Verification commands for subsequent work are `npm run typecheck`, `npm run lint`, and `npm test`; native changes also require `npm run ios:build` and device checks. No verification commands were run for this read-only review.

## Correctness findings

| Priority | Finding and evidence | Impact | Effort | Change risk | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | The receipt classifies BIGONE BBQ CHICKEN as chicken and poultry. The spending screen puts it in the raw meat summary. The category selector already includes frozen pizza. `src/app/(tabs)/spending.tsx:133` renders the raw meat summary. | The category totals tell the wrong story even when the receipt total balances. | M | Medium: classification changes need representative receipt examples. | High for this example; root cause needs examination. |
| 2 | The receipt labels the 37.96 kr Coca-Cola offer as a receipt discount. `src/lib/domain/receipt.ts:236` spreads receipt discounts over all products. The 97 kr pizza consequently appears as 87.17 kr in spending. | An offer on two Coca-Cola packs reduces unrelated category totals. | M | Medium: preserve integer rounding and the receipt total. | High: both the displayed values and the allocation code support this. |
| 3 | `convex/processing.ts:259` can set an automatically accepted receipt to `reviewed`. `src/components/receipt-card.tsx:5` labels every reviewed receipt “Kontrollert,” without checking `autoAccepted`. | Users cannot distinguish successful automatic checks from their own review. | S | Low if this first changes labels only. | High. |

Do not infer category accuracy from balanced totals. Show “Automatisk godkjent” separately from “Kontrollert av deg.” Add regression cases for prepared food containing meat and offers covering several matching items. The current item discount relation points to one line (`src/features/receipt-line-editor.tsx:165`), so this offer needs an explicit allocation across both matching lines, not a link to an arbitrary one.

The manufacturer confirms that [BigOne BBQ Chicken is pizza](https://orklafoods.no/produkter/bigone-bbq-chicken-2/).

## Interface findings

Review mode: full within the inspected flow. Native motion, large text settings, dark mode, and physical-device interaction remain unverified.

| Severity | Location | Before | Proposed after | Why |
| --- | --- | --- | --- | --- |
| Medium | `src/app/receipt/[id].tsx:317`, `:445` | A checked receipt still opens an editor with review filters, two save actions, reprocessing, deletion, and a second back button. | Open a receipt summary. Use an explicit Edit action, a persistent save action when editing, and a menu for uncommon operations. | Clear action hierarchy reduces repeated decisions and scrolling. |
| Medium | `src/features/receipt-line-editor.tsx:103` | Category changes open a long flat list; remembering a correction is a separate switch in the expanded form. | Offer current/recent categories first, retain search, and make the effect on future matching items clear at confirmation. | Reduce work in a frequent correction task without silently changing other purchases. |
| Medium | `src/app/(tabs)/spending.tsx:133` | The raw meat panel and calendar precede the complete spending breakdown. Four empty meat categories occupy space in the inspected month. | Show total, largest categories, and recent purchases first. Move detailed meat analysis and calendar into expandable sections or detail screens. | Visual hierarchy should lead with the broadest useful information. |
| Low | `src/app/(tabs)/spending.tsx:124`, `src/components/receipt-card.tsx:21`, `src/components/ui.tsx:185` | ISO dates and fixed content headings make the screens feel like forms. | Use Norwegian display dates, correct singular/plural labels, and native navigation titles and toolbar actions where they replace duplicate controls. | Improve readability and spatial consistency. |

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Spending screenshot, date/count text, shared Text component | Display-date and singular/plural improvements. Tabular numbers already exist. Large text not tested. |
| Surfaces | Spending screenshot, receipt and category control hierarchy, shared panels | Prioritize content and simplify editing; no proposed restyling of the whole app. |
| Animations | Navigation state changes and shared button source | No motion defect established. Slow-motion inspection unavailable in the current capture path. |
| Icons | Spending screenshot and SF Symbol component | No actionable icon issue found in inspected scope. |
| Performance | Shared ScrollView and history/session source | No measured performance finding. One receipt is not a useful load test. |

Interface verdict: **Needs changes**. The findings above are usability improvements, not a claim that the current app is unusable. Camera quality, haptics, push delivery, cold-start offline behavior, VoiceOver operation, dark mode, and large text remain unverified. This was not a backend security or load audit.

## Product direction

1. **Make receipt review a short task.** Use the existing issue checks to present only decisions that need attention. Keep the original receipt available while correcting an item, instead of requiring a separate full-screen visit. Evidence: `src/app/receipt/[id].tsx:305` and `src/features/receipt-images.tsx:32`. Effort M; medium change risk because edits and dismissal must preserve unsaved values. Confidence high.
2. **Make the spending overview useful at a glance.** Reorder the existing information before adding new charts. Keep the distinction between goods, deposits, and total payment, but use shorter labels and reveal the accounting details on demand. Evidence: `src/app/(tabs)/spending.tsx:112`. Effort S; low risk. Confidence high.
3. **Add an iOS document-scanning flow.** The current camera takes ordinary photos and asks users to overlap sections of long receipts (`src/app/(tabs)/index.tsx:84`). Investigate Apple's VisionKit document camera for page capture and correction, while keeping the current camera/photo import as a fallback. Test unusually long receipts before choosing the default. A native integration would require a development build instead of stock Expo Go. Effort M–L; medium risk and medium confidence until tested with real receipts. [Apple document camera](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller).
4. **Keep recent receipt history available offline.** Uploads already have local persistence, while history comes from Convex subscriptions (`src/features/session.tsx:142`). Cache recent receipt summaries by account and household, show the last synchronization time, and keep edits online initially. This would let a user look up a previous purchase in a shop with poor reception. Effort M; medium risk around cache invalidation and account separation. Confidence high from source; offline behavior was not exercised.

## Considered and deferred

| Candidate | Reason |
| --- | --- |
| More custom animation, shadows, or glass effects | Native tabs already supply platform behavior. Navigation and review structure have higher value than extra decoration. |
| Price alerts and purchase advice | `src/lib/domain/insights.ts:270` currently measures amounts per purchase, not normalized unit prices. Quantity, product matching, and discount allocation must be reliable first. One receipt is too little evidence for useful trends. |
| General offline editing and automatic background uploads | Read-only history is a smaller next step. Offline edits add conflict handling; background upload needs separate native lifecycle work. |

Recommended order: correct discount/category handling and review labels; simplify receipt review; reorder spending; then evaluate scanning and offline history. Select the next scope before writing implementation plans.
