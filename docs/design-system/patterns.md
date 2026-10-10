# Screens and flows

How the components combine into screens, and how the screens connect. Routes live in [`src/app`](../../src/app); the [screen catalogue](#screen-catalogue) links simulator screenshots of each.

## Navigation

Four native tabs (`src/app/(tabs)/_layout.tsx`), each with an SF Symbol that fills when selected:

| Tab       | Symbol            | Purpose                                                                                       |
| --------- | ----------------- | --------------------------------------------------------------------------------------------- |
| Kamera    | `camera`          | Capture or import a receipt. The app opens here.                                              |
| Innboks   | `tray`            | Receipts that need review or are still processing. The badge counts only what needs a person. |
| Forbruk   | `chart.bar.xaxis` | Monthly spending, breakdowns, and reports.                                                    |
| Historikk | `magnifyingglass` | Search every saved receipt and product.                                                       |

Above the tabs, the root stack ([root layout](../../src/app/_layout.tsx)) pushes the receipt, Forbruksanalyse, Rettelser, and Koble produkter with a cobalt native header and a back chevron without text. Household settings open as a modal with "Ferdig". Choices, details, and short edits open as a `Sheet` over the current screen rather than a new page; confirmations and destructive choices use a system alert.

On iOS, header actions are native toolbar items: the receipt's save button and "Flere handlinger" menu at the top right, and Koble produkter's undo, search, and skip buttons in a bottom toolbar. Other platforms show the same actions as a sheet or a footer.

## Screen anatomy

A typical screen, top to bottom:

1. **Header.** Cobalt, either the `Screen title` hero or the native stack header (see [open questions](open-questions.md#two-kinds-of-screen-header)). The settings button sits at the top right of every tab.
2. **Summary band** (optional). Edge-to-edge cobalt below the header with the screen's key number: the month total on Forbruk, the paid amount and status chips on a receipt, the current item in Koble produkter. Text on it uses `onHero` and `onHeroMuted`; controls on it use `heroControl` discs.
3. **Status notices.** "Uten nett" first, then loading or partial-data notices, such as "Henter kvitteringer …".
4. **Content** on warm paper: `SectionTitle` groups, `Panel` cards, `Row` lists with dividers, and `Segments` to switch views.
5. **Footer** (optional). A pinned action bar with the screen's primary action and a one-line status above it, as on the receipt.

### States every data screen handles

- **Loading:** `Loading` with a named object, or keep the cached content and show a notice that more is coming.
- **Empty:** `IllustratedEmpty` for an empty tab on first use; `Empty` for an empty filter or search.
- **Offline:** the "Uten nett" notice; content from the local cache stays readable, and actions that need the server are disabled rather than hidden.
- **Error:** `Notice tone="error"` near the action that failed, with the message from `failureMessage`.
- **Partial data:** reports say when they are provisional ("foreløpige") or incomplete instead of showing a total as final.

### Large text

At a font scale above 1.3, rows stack their value under the title, segmented controls become a vertical list, metric rows stack, and sheets open at full height. Check new layouts at the largest accessibility size.

## Flows

### Sign-in and household

The welcome screen offers Sign in with Apple, "Opprett konto med e-post", and "Logg inn med e-post" ([sign-in](../../src/features/sign-in.tsx)). After the first sign-in, "Kom i gang" starts a household named "Hjemme", or "Jeg har en invitasjonskode" joins an existing one. Settings shows the invitation code with "Kopier" and "Del".

### Capture

1. Kamera shows the live viewfinder with corner guides. The shutter is centred; "Velg fra bilder" is on the left and the latest photo with a count badge on the right. The top bar names the household and offers Files import and settings.
2. Each photo opens the capture review sheet ([capture review](../../src/features/capture-review.tsx)): thumbnails, "Samme kvittering" to combine pages, "Ta flere" and "Velg flere", and "Lagre kvittering" or "Lagre som N kvitteringer".
3. Saving returns to the camera with an upload note that fades once the upload lands. Shared images and PDFs from other apps arrive the same way.
4. Uploads and reading continue in Innboks under "Under behandling" with progress, and in a Live Activity.

### Review

1. Innboks lists receipts "Til kontroll". A left swipe approves a receipt whose facts are complete ("Sveip for å godkjenne"); "Start" opens the first one.
2. The receipt screen shows the summary band with status and task chips, then the lines, category totals, and payment summary. Each chip jumps to what needs attention.
3. A line expands in place to edit its name and amount; its category opens the category picker sheet and its product opens the catalogue sheet. Reading issues on a line offer "Dette stemmer" or "Rediger". The "Flere handlinger" menu holds Kvitteringsdetaljer, adding a line, VAT, exclusion, re-reading, and deletion.
4. The footer says what is left and offers "Godkjenn kvittering", "Lagre og godkjenn", or "Lagre for senere". After approval it offers "Til innboksen" and "Neste til kontroll".
5. Leaving with unsaved changes asks "Forkaste endringene?". Drafts survive restarts.

### Explore spending

Forbruk opens on the current month. The period menu and chevrons change month; the hero shows the grocery total, receipt count, change from last month, and budget pace. "Fordeling" switches between Kategori, Butikk, and Varetype; tapping a category group drills into its categories, and tapping a row opens the purchases behind it. "Butikker" opens the store sheet with a map. "Utforsk forbruket" leads to Forbruksanalyse and to report sheets: Produkter og merker, Prissjekk, Mengder kjøpt, Handlekalender, Betaling og pant, and Om tallene.

### Find a purchase

Historikk searches stores, items, and labels from the native search bar. "Kvitteringer" groups receipts by month with a month total; a long press opens a context menu. "Varer" lists products with purchase counts; a product opens its price history sheet with latest, typical, and lowest price.

### Household settings

A grouped native form: household name and members, invitation, Rettelser, Oda, budget, notifications, app updates, Spotlight, and account.

## Screen catalogue

Screenshots from the iOS Simulator with the `reviewed-receipts` fixture, taken on 10 October 2026 from `main` at `f94a9ba`. Treat the code as current when they differ. The fixture has only reviewed receipts and the simulator has no camera, so the catalogue does not show a receipt to review, swipe to approve, capture review, upload progress, the category picker, or Rettelser.

| Screen                    | Shows                                                                                                    | Light                                                                                                                                                                             | Dark                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome                   | System background, Sign in with Apple (system-language label), email options.                            | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/00-welcome.png)             | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/00-welcome.png)             |
| Sign in with email        | Pill buttons and 14-point fields; keyboard toolbar "Ferdig".                                             | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/00-sign-in.png)             | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/00-sign-in.png)             |
| Kamera                    | Dark viewfinder with corner guides; overlay discs blend into the empty simulator feed.                   | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/01-kamera.png)              | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/01-kamera.png)              |
| Innboks, empty            | Hero header, `IllustratedEmpty`, primary button.                                                         | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/02-innboks-tom.png)         | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/02-innboks-tom.png)         |
| Koble produkter           | Native header, summary band, info notices, native bottom toolbar.                                        | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/02-produktkobling.png)      | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/02-produktkobling.png)      |
| Forbruk, empty month      | Summary band with period menu, eyebrow, amount, artwork; `Empty`.                                        | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/03-forbruk-tom.png)         | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/03-forbruk-tom.png)         |
| Forbruk by category       | Native segmented control and spending bars.                                                              | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/03-forbruk.png)             | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/03-forbruk.png)             |
| Forbruk by store          | Same bars, store breakdown.                                                                              | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/03-forbruk-butikk.png)      | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/03-forbruk-butikk.png)      |
| Forbruk reports           | Butikker card, bare Forbruksanalyse row, report rows in a card.                                          | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/03-forbruk-rapporter.png)   | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/03-forbruk-rapporter.png)   |
| Butikker sheet            | Sheet with month stepper, segments, and an info notice.                                                  | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/04-butikker-ark.png)        | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/04-butikker-ark.png)        |
| Handlekalender sheet      | Calendar heat scale on the chart ramp.                                                                   | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/04-handlekalender-ark.png)  | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/04-handlekalender-ark.png)  |
| Prissjekk sheet           | `Empty` inside a sheet.                                                                                  | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/04-prissjekk-ark.png)       | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/04-prissjekk-ark.png)       |
| Forbruksanalyse, paused   | Shows the route name "analysis" in the native header above a second hero title; a defect, not a pattern. | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/05-analyse.png)             | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/05-analyse.png)             |
| Historikk                 | Native header with search, segments, month header, flat receipt rows.                                    | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/06-historikk.png)           | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/06-historikk.png)           |
| Historikk, Varer          | Product rows in a card.                                                                                  | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/06-historikk-varer.png)     | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/06-historikk-varer.png)     |
| Product history sheet     | Detail amount, metric panel, bars, purchase rows.                                                        | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/06-varehistorikk-ark.png)   | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/06-varehistorikk-ark.png)   |
| Receipt                   | Summary band with status chip, notice, purchase overview card, footer status.                            | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/07-kvittering.png)          | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/07-kvittering.png)          |
| Receipt lines             | Category bars, line cards with category chips and product links, `Disclosure`.                           | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/07-kvittering-linjer.png)   | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/07-kvittering-linjer.png)   |
| Flere handlinger          | Native toolbar menu with a destructive item.                                                             | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/08-flere-handlinger.png)    | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/08-flere-handlinger.png)    |
| Kvitteringsdetaljer sheet | `NativeForm` sections inside a sheet with a footer button.                                               | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/08-kvitteringsdetaljer.png) | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/08-kvitteringsdetaljer.png) |
| Line expanded             | Inline fields for name and amount.                                                                       | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/09-linjeredigering.png)     | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/09-linjeredigering.png)     |
| Category detail sheet     | Detail amount and contributing lines.                                                                    | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/09-kategori-detaljer.png)   | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/09-kategori-detaljer.png)   |
| Settings                  | Native grouped form: household, invitation, corrections.                                                 | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/10-innstillinger.png)       | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/10-innstillinger.png)       |
| Settings, continued       | Oda, budget with `MoneyField`, notifications.                                                            | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/10-innstillinger-2.png)     | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/10-innstillinger-2.png)     |
| Settings, end             | Updates, Spotlight toggle, account.                                                                      | [light](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-light/10-innstillinger-3.png)     | [dark](https://raw.githubusercontent.com/Tollii/kvittering/bba27954bbc8337bd4f3cd93cb8fb9e0ef3f6b55/claude/project-thread-ucbnvu/design-system-dark/10-innstillinger-3.png)     |
