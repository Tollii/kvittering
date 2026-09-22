# Interface review

This review covers the active Expo application. It keeps the cobalt and warm-paper
palette, system type, SF Symbols, native tabs, native menus, and native sheet
presentation. The changes improve reading order, control spacing, feedback, and
large-text layouts. They do not change receipt calculations or backend contracts.

## Changes

- Shared panels separate related content from the page. The existing card-radius
  token is 24 points: an 8-point control plus 16 points of panel padding. Dividers
  still separate list rows. Surfaces stay opaque and readable in both themes.
  Form sections own their surfaces; child settings do not add a second panel.
- Receipt cards give store names, amounts, status, and errors separate space.
  Long names can wrap. Large text puts the amount below the receipt name.
- Rows, segmented controls, report periods, receipt summaries, and product-history
  metrics accommodate larger text. The calendar uses a purchase list at large text
  sizes or narrow widths. Each calendar week has seven equal cells; percentage
  rounding can no longer move Sunday into the next row. Calendar text has a
  contrasting foreground for each chart shade. Zero-value bars have zero length.
- Sign-in and household setup have clearer titles, instructions, and form grouping.
  The keyboard submit action uses the same eligibility checks as the submit button.
  Fields and mode changes are disabled while a request is active.
- Capture explains photo and file import before camera permission. Import and
  settings controls have separate 44-point targets. Upload notices use an opaque
  surface. The image review grid fits its sheet, and remove controls are 44 points.
- Catalog search explains its minimum input and gives useful empty and failure
  feedback. Image edges use neutral outlines. Generic selection clears the old
  search when reopened and explains an empty result.
- Price checks and correction history have explicit empty states. Product selection
  keeps disabled feedback visible. The product queue's return action goes to the
  inbox, including when the screen was opened from a link.
- Decorative symbols no longer add their English symbol names to accessibility
  labels. Busy buttons retain readable labels and progress indicators. Sheet titles
  are headings; the close control shows when dismissal is unavailable.

## Coverage inventory

Source review includes all application routes, their supporting sheets, and the
shared components below. A source review does not establish device behavior.
The verification record distinguishes rendered fixtures from live services.

| Area               | Routes, components, and states reviewed                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry and access   | Root layout and error boundary; session loading, offline gate, sign-in, registration, create household, join household; release-required and recommended-update screens                                                                              |
| Capture and import | Camera tab; camera permission, unavailable camera, photo and Files import, shared images/PDFs, prepared-image review, combine/remove/add images, busy and error states, upload confirmation                                                          |
| Inbox              | Review, failed, processing, empty and offline receipts; upload queue and retry; swipe approval; product-linking entry; receipt tips and Live Activity action                                                                                         |
| Receipt review     | Receipt route, missing and loading receipt; summary, review/all-lines segments, category confirmation, missing amount/name, discounts, adjustments, duplicate and exclusion controls, approval and save footer, stale revision, unsaved-change guard |
| Receipt sheets     | Receipt details and native date picker; category search, recent categories and groups; product and store search; product details; original images and Quick Look; action menu and destructive confirmation dialogs                                   |
| History            | Receipt and product tabs; native search, grouped months, pagination, no results, native receipt context menu, product-history sheet and price observations                                                                                           |
| Product linking    | Queue, candidates, catalog search, pending/error/empty states, disabled selection, undo and native toolbar                                                                                                                                           |
| Spending           | Month menu and arrows; budget pace; review notice; category, store and purchase-type breakdown; payment details; filters and receipt contributions                                                                                                   |
| Reports            | Analysis route; product attributes; products and brands; price signals; purchased quantities; calendar; meat and fish; period changes; coverage and unknown values                                                                                   |
| Stores             | Store and chain lists; map and numbered markers; unknown locations; period controls; store detail and receipt drill-down                                                                                                                             |
| Household/settings | Members; invitation, copy/share and code rotation; corrections link; budget draft and remote change; notifications; update check/reload; Spotlight; local queue and sign-out                                                                         |
| Corrections        | History, evaluation, propagation preview, selection limit, apply, undo, loading/error/empty states                                                                                                                                                   |
| System surfaces    | Home Screen widget, Live Activity, TipKit, notification links, App Shortcuts, share-intent routing, Quick Look source                                                                                                                                |
| Shared system      | Copy, Icon, Button, IconButton, Chip, Field, MoneyField, Toggle, Segments, Select, Row, Panel, Disclosure, Notice, Empty, Loading, Screen, Sheet, NativeForm, artwork                                                                                |

## Verification environment

Screenshots are native simulator captures of the application's components and
routes. They are not generated interface mockups. The test device is a separate
**Kvitto Interface Review** iPhone 17 Pro simulator running iOS 26.4. Its app
container is separate from the existing simulator and the user's devices.

A temporary Metro resolver supplies synthetic household, receipt, and catalog
records in place of service hooks. The fixture adapter does not connect to Convex,
create accounts, or write household records. A synthetic receipt image is used for
image-review screenshots. Provider adapters and the temporary review route are
removed from the final change. The source snapshot before this change and the
implemented source use the same fixture data.

The screenshots are stored in this private repository so repository reviewers can
open them without access to the author's filesystem or a separate image service.

## Limits

The simulator cannot verify camera image quality, push delivery, haptics, or
Lock Screen and Home Screen behavior. The fixture run
does not establish live authentication, extraction, catalog availability, upload
completion, or server write behavior. Those boundaries retain the existing code
and tests.

The Mac locked during the review. Screenshots remain available through `simctl`,
but direct Device Hub input requires an unlocked Mac. Direct typing, touch
feedback, swipe interruption, VoiceOver, Reduce Motion, and Increase Contrast
were not tested. Android and physical-device checks were not run.

## Screenshot comparisons

Each pair uses the same synthetic data and default text size in light mode.
The calendar and sheets are opened in a temporary component review route.

| Screen             | Before                                                | After                                               | Check                                           |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Sign-in            | [Before](interface-review/sign-in-before.png)         | [After](interface-review/sign-in-after.png)         | Form grouping and heading weight                |
| Household setup    | [Before](interface-review/household-before.png)       | [After](interface-review/household-after.png)       | Clearer instructions and form spacing           |
| Capture            | [Before](interface-review/capture-before.png)         | [After](interface-review/capture-after.png)         | Permission guidance and control size            |
| Image review       | [Before](interface-review/capture-review-before.png)  | [After](interface-review/capture-review-after.png)  | Image bounds and remove target                  |
| Inbox              | [Before](interface-review/inbox-before.png)           | [After](interface-review/inbox-after.png)           | Receipt grouping, failure and processing states |
| Receipt review     | [Before](interface-review/receipt-before.png)         | [After](interface-review/receipt-after.png)         | Summary, line grouping and control spacing      |
| History            | [Before](interface-review/history-before.png)         | [After](interface-review/history-after.png)         | List spacing                                    |
| Spending           | [Before](interface-review/spending-before.png)        | [After](interface-review/spending-after.png)        | Section spacing and bars                        |
| Analysis           | [Before](interface-review/analysis-before.png)        | [After](interface-review/analysis-after.png)        | Report grouping                                 |
| Calendar           | [Before](interface-review/calendar-before.png)        | [After](interface-review/calendar-after.png)        | Seven-column weeks and readable amounts         |
| Household settings | [Before](interface-review/settings-before.png)        | [After](interface-review/settings-after.png)        | Native section spacing and icons                |
| Corrections        | [Before](interface-review/corrections-before.png)     | [After](interface-review/corrections-after.png)     | Explicit empty state                            |
| Product linking    | [Before](interface-review/product-linking-before.png) | [After](interface-review/product-linking-after.png) | Candidate surface and image outline             |
| Category picker    | [Before](interface-review/category-before.png)        | [After](interface-review/category-after.png)        | Search focus and row spacing                    |
| Receipt details    | [Before](interface-review/receipt-fields-before.png)  | [After](interface-review/receipt-fields-after.png)  | Native form, fields and rows                    |
| Product details    | [Before](interface-review/catalog-before.png)         | [After](interface-review/catalog-after.png)         | Disclosure surfaces                             |
| Product search     | [Before](interface-review/catalog-search-before.png)  | [After](interface-review/catalog-search-after.png)  | Search guidance and result spacing              |

## Additional rendered states

All 47 images were inspected. The large-text checks use the simulator's
`accessibility-medium` content size. The dark-mode checks use default text size.
The calendar's temporary review-route heading is outside the shipped calendar
component; the large-text check concerns the dated purchase list below it.

| State              | Captures                                                                                                                                                                                                     | Result                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Large text         | [Inbox](interface-review/inbox-large-text.png), [history](interface-review/history-large-text.png), [receipt](interface-review/receipt-large-text.png), [calendar](interface-review/calendar-large-text.png) | Values stack, segmented choices use separate rows, and the calendar becomes a dated list.       |
| Dark mode          | [Inbox](interface-review/inbox-dark.png), [settings](interface-review/settings-dark.png), [calendar](interface-review/calendar-dark.png)                                                                     | Cards and native form sections remain separate from the page. Calendar amounts remain readable. |
| Approved receipt   | [Receipt](interface-review/receipt-approved-after.png)                                                                                                                                                       | Approved status, total, accounting rows, and item separators remain clear.                      |
| Empty inbox        | [Inbox](interface-review/inbox-empty-after.png)                                                                                                                                                              | The next action remains visible below the empty-state explanation.                              |
| Loading            | [Inbox](interface-review/inbox-loading-after.png)                                                                                                                                                            | A progress indicator and loading label appear while receipt data is pending.                    |
| Offline            | [Inbox](interface-review/inbox-offline-after.png)                                                                                                                                                            | The offline notice remains visible above cached receipt rows.                                   |
| No catalog results | [Product search](interface-review/catalog-empty-after.png)                                                                                                                                                   | The empty state suggests another search. The sheet can scroll to the manual alternative.        |
| Catalog failure    | [Product search](interface-review/catalog-error-after.png)                                                                                                                                                   | The error remains visible with the available result and manual alternative.                     |

Calendar text against each of the eight chart backgrounds has a calculated
contrast ratio of at least 5.1:1 in its normal enabled state. This calculation
does not establish support for the system Increase Contrast setting.

## Repository checks

After removal of the temporary fixtures:

- `npm run check:fast` passed: formatting, TypeScript, and all lint checks.
- `npm run check` passed: the fast checks, 13 custom rule tests, and 297 application
  tests across 52 files.
- `git diff --check` passed.
- All 47 screenshot links resolve to original-resolution PNG files in this
  repository.

No new tests were added for styling. The existing suite checks the application
rules and failures; the screenshots provide the layout evidence described above.
