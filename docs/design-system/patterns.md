# Screens and flows

How the components combine into screens, and how the screens connect. Routes live in [`src/app`](../../src/app); the [screen catalogue](#screen-catalogue) links simulator screenshots of each.

## Navigation

Four native tabs (`src/app/(tabs)/_layout.tsx`), each with an SF Symbol; Kamera and Innboks switch to the filled symbol when selected:

| Tab       | Symbol            | Purpose                                                                                       |
| --------- | ----------------- | --------------------------------------------------------------------------------------------- |
| Kamera    | `camera`          | Capture or import a receipt. The app opens here.                                              |
| Innboks   | `tray`            | Receipts that need review or are still processing. The badge counts only what needs a person. |
| Forbruk   | `chart.bar.xaxis` | Monthly spending, breakdowns, and reports.                                                    |
| Historikk | `magnifyingglass` | Search every saved receipt and product.                                                       |

Above the tabs, the root stack ([root layout](../../src/app/_layout.tsx)) pushes detail screens, such as the receipt, with a cobalt native header and a back chevron without text. Household settings open as a modal with "Ferdig". Choices, details, and short edits open as a `Sheet` over the current screen rather than a new page; confirmations and destructive choices use a system alert.

On iOS, header and toolbar actions are native toolbar items, such as the receipt's "Flere handlinger" menu at the top right. Other platforms show the same actions as a sheet or a footer.

## Screen anatomy

A typical screen, top to bottom:

1. **Header.** Cobalt, either the `Screen title` hero or the native stack header (see [open questions](open-questions.md#two-kinds-of-screen-header)). The settings button sits at the top right of every tab.
2. **Summary band** (optional). Edge-to-edge cobalt below the header with the screen's key number: the month total on Forbruk, the paid amount and status chips on a receipt, the current item in Koble produkter. Text on it uses `onHero` and `onHeroMuted`; controls on it use `heroControl` discs.
3. **Status notices.** The offline notice first, then loading or partial-data notices.
4. **Content** on warm paper: `SectionTitle` groups, `Panel` cards, `Row` lists with dividers, and `Segments` to switch views.
5. **Footer** (optional). A pinned action bar with the screen's primary action and a one-line status above it, as on the receipt.

### States every data screen handles

- **Loading:** `Loading` with a named object, or keep the cached content and show a notice that more is coming.
- **Empty:** `IllustratedEmpty` on an empty tab root; `Empty` everywhere else.
- **Offline:** the "Uten nett" notice with the `wifi.slash` icon at the top, which Kamera, Innboks, Forbruk, and the receipt show today (see [open questions](open-questions.md#offline-notice-on-some-screens)); content from the local cache stays readable, and actions that need the server are disabled rather than hidden.
- **Error:** `Notice tone="error"` near the action that failed, with the message from `failureMessage`.
- **Partial data:** reports say when they are provisional ("foreløpige") or incomplete instead of showing a total as final.

### Large text

Check new layouts at the largest accessibility text size; [accessibility](foundations.md#accessibility) lists how the shared components adapt.

## Flows

Each flow below names the presentation choices it makes, so a new feature can follow them. The routes and features it links own what each screen contains.

### Sign-in and household

Sign-in is a full-screen form outside the tabs ([sign-in](../../src/features/sign-in.tsx)), with Sign in with Apple first and email as the alternative. A new account then creates or joins a household on one screen before the tabs appear.

### Capture

1. Kamera is a full-bleed viewfinder with controls on overlay discs; importing from Bilder or Filer sits beside the shutter.
2. Each photo opens a review sheet ([capture review](../../src/features/capture-review.tsx)) where pages can be combined into one receipt before saving. Shared images and PDFs from other apps arrive in the same sheet.
3. Saving returns to the camera at once. A note follows the upload and fades when it lands; processing continues in Innboks and a Live Activity, never on a blocking screen.

### Review

1. Innboks lists receipts that need a person first and receipts still processing below them. Swipe left approves a receipt whose facts are complete.
2. The receipt screen leads with the summary band: amount, status chip, and one chip per task, each jumping to what needs attention. Lines expand in place for small edits; categories and catalogue products open sheets; rarer actions live in the "Flere handlinger" menu.
3. The footer always says what is left and offers the one next action; after approval it offers the next receipt when one is waiting.
4. Unsaved changes survive restarts, and leaving asks before discarding them.

### Explore spending

Forbruk shows one month at a time, chosen from the summary band. Breakdowns switch with `Segments` in place; a row drills into its purchases in a sheet; reports open as sheets from a list, and the deeper analysis is a pushed screen.

### Find a purchase

Historikk searches from the native search bar and switches between receipts and products with `Segments`. Receipts group by month; a long press opens a context menu; a product opens its price history in a sheet.

### Household settings

Settings is a modal grouped native form ([settings](../../src/app/settings.tsx)), one section per area.

## Screen catalogue

Screenshots from the iOS Simulator with the `reviewed-receipts` fixture, taken on 10 October 2026 from `main` at `f94a9ba`. Treat the code as current when they differ. The fixture has only reviewed receipts and the simulator has no camera, so the catalogue does not show a receipt to review, swipe to approve, capture review, upload progress, the category picker, or Rettelser.

| Screen                    | Shows                                                                                                            | Light                                                                                                                                                                             | Dark                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome                   | System background, Sign in with Apple (system-language label), email options.                                    | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/00-welcome.png)             | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/00-welcome.png)             |
| Sign in with email        | Pill buttons and 14-point fields; keyboard toolbar "Ferdig".                                                     | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/00-sign-in.png)             | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/00-sign-in.png)             |
| Kamera                    | Dark viewfinder with corner guides; overlay discs blend into the empty simulator feed.                           | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/01-kamera.png)              | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/01-kamera.png)              |
| Innboks, empty            | Hero header, `IllustratedEmpty`, primary button.                                                                 | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/02-innboks-tom.png)         | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/02-innboks-tom.png)         |
| Koble produkter           | Native header, summary band, info notices, native bottom toolbar.                                                | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/02-produktkobling.png)      | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/02-produktkobling.png)      |
| Forbruk, empty month      | Summary band with period menu, eyebrow, amount, artwork; `Empty`.                                                | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/03-forbruk-tom.png)         | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/03-forbruk-tom.png)         |
| Forbruk by category       | Native segmented control and spending bars.                                                                      | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/03-forbruk.png)             | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/03-forbruk.png)             |
| Forbruk by store          | Same bars, store breakdown.                                                                                      | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/03-forbruk-butikk.png)      | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/03-forbruk-butikk.png)      |
| Forbruk reports           | Butikker card, bare Forbruksanalyse row, report rows in a card.                                                  | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/03-forbruk-rapporter.png)   | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/03-forbruk-rapporter.png)   |
| Butikker sheet            | Sheet with month stepper, segments, and an info notice.                                                          | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/04-butikker-ark.png)        | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/04-butikker-ark.png)        |
| Handlekalender sheet      | Calendar heat scale on the chart ramp.                                                                           | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/04-handlekalender-ark.png)  | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/04-handlekalender-ark.png)  |
| Prissjekk sheet           | `Empty` inside a sheet.                                                                                          | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/04-prissjekk-ark.png)       | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/04-prissjekk-ark.png)       |
| Forbruksanalyse, paused   | A defect, not a pattern: see [open work](../../plans/README.md#forbruksanalyse-header-while-analysis-is-paused). | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/05-analyse.png)             | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/05-analyse.png)             |
| Historikk                 | Native header with search, segments, month header, flat receipt rows.                                            | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/06-historikk.png)           | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/06-historikk.png)           |
| Historikk, Varer          | Product rows in a card.                                                                                          | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/06-historikk-varer.png)     | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/06-historikk-varer.png)     |
| Product history sheet     | Detail amount, metric panel, bars, purchase rows.                                                                | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/06-varehistorikk-ark.png)   | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/06-varehistorikk-ark.png)   |
| Receipt                   | Summary band with status chip, notice, purchase overview card, footer status.                                    | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/07-kvittering.png)          | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/07-kvittering.png)          |
| Receipt lines             | Category bars, line cards with category chips and product links, `Disclosure`.                                   | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/07-kvittering-linjer.png)   | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/07-kvittering-linjer.png)   |
| Flere handlinger          | Native toolbar menu with a destructive item.                                                                     | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/08-flere-handlinger.png)    | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/08-flere-handlinger.png)    |
| Kvitteringsdetaljer sheet | `NativeForm` sections inside a sheet with a footer button.                                                       | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/08-kvitteringsdetaljer.png) | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/08-kvitteringsdetaljer.png) |
| Line expanded             | Inline fields for name and amount.                                                                               | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/09-linjeredigering.png)     | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/09-linjeredigering.png)     |
| Category detail sheet     | Detail amount and contributing lines.                                                                            | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/09-kategori-detaljer.png)   | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/09-kategori-detaljer.png)   |
| Settings                  | Native grouped form: household, invitation, corrections.                                                         | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/10-innstillinger.png)       | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/10-innstillinger.png)       |
| Settings, continued       | Oda, budget with `MoneyField`, notifications.                                                                    | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/10-innstillinger-2.png)     | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/10-innstillinger-2.png)     |
| Settings, end             | Updates, Spotlight toggle, account.                                                                              | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/10-innstillinger-3.png)     | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/10-innstillinger-3.png)     |
