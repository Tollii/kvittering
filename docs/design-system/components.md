# Components

Shared presentation components live in [`src/components/ui`](../../src/components/ui) and are imported from `@/components/ui`. Reach for these before styling a `View` or `Pressable` yourself; when a screen needs something they cannot express, extend the component rather than copying its styles. The source owns props and exact styles; this page explains purpose, variants, and states.

## Where components live

A component's folder says how far it reaches, so a reader knows what a change touches:

- [`src/components/ui`](../../src/components/ui) is the catalogue: presentation only, no household data, used anywhere. Everything on this page below lives here unless it says otherwise.
- [`src/components`](../../src/components) holds domain components that more than one screen shares: `ReceiptCard` and its status helpers, `SpendingBars` and `SpendingDetails`, `MoneyField`, `ReceiptTip`, and the monument artwork.
- [`src/features`](../../src/features) holds screens' own parts, next to the screen or sheet that uses them: the receipt editor's sections and its next-step notice, the pending receipts of Kvitteringer with their upload queue card, the spending reports with their calendar, family purchases and store map, the period menu of Forbruk, and the context menu of Kvitteringer.

When a second screen needs a feature's component, move it up to `src/components` in the same change; when it needs new styling, extend the `ui` component it is built from.

## Text and icons

**`Copy`** ([typography](../../src/components/ui/typography.tsx)) is the only text component. It takes `size`, `weight`, and `muted`, and sets line height, tracking, and tabular numerals. See [typography](foundations.md#typography) for the size of each role.

**`Amount`** is the large number a screen or sheet leads with, and `detail` is its one-line explanation under it, such as "3 kjøp" or "12 poster i perioden". `hero` puts it on a `SummaryBand` in `onHero`; otherwise it sits on paper at the top of a sheet or a detail view.

**`Icon`** renders an SF Symbol, `primary` by default, hidden from VoiceOver. Label the control that contains it instead.

**`pressed(state)`** and **`faded(disabled)`** are the shared press and disabled styles. Use both on any custom `Pressable`.

## Actions

**`Button`** ([controls](../../src/components/ui/controls.tsx)) is a full-width-capable action with an optional leading SF Symbol.

| Variant     | Look                               | Use                                                                                             |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `primary`   | `primary` fill, `onPrimary` text   | The one main action on a screen or sheet: "Lagre og godkjenn", "Logg inn".                      |
| `secondary` | `muted` fill, `text`               | Alternatives: "Forkast importen", "Vis flere kvitteringer", and `compact` for "Vis alle 8".     |
| `tint`      | `primarySoft` fill, `primary` text | A supporting action that should still read as cobalt: "Kopier", "Prøv igjen", "Bekreft alle …". |
| `danger`    | `dangerSoft` fill, `danger` text   | Destructive actions such as "Slett kvittering". Confirm with an alert.                          |

States: `disabled` fades the button; `busy` shows a spinner in place of the icon, or before the title when there is no icon, and disables the button while keeping the title. `compact` is the shorter size for inline and footer use. A "show more" control under a list is a `compact` `secondary` button, not a row. A short title next to the thing it acts on, such as "Bekreft" beside a category suggestion, gets an `accessibilityLabel` that names the object.

**`IconButton`** is an icon-only control with a required Norwegian `label`. `filled` adds the muted disc, or pass a colour such as `heroControl` on the hero.

**`SettingsButton`** ([layout](../../src/components/ui/layout.tsx)) opens household settings. Every tab places it at the top right; `surface="camera"` adapts it to the viewfinder.

**`Chip`** shows a short status or opens a picker. Tones are `muted`, `success`, and `warning`. A chip with `onPress` grows to a full touch target and shows a chevron, unless `trailing="none"` marks it as an action rather than a dropdown. A chip without `onPress` is read as text.

## Inputs

**`Field`** is a labelled text input. The label sits above in secondary text; the border turns `primary` on focus; `hint` adds a caption below. On iOS it adds a keyboard toolbar with "Ferdig". Use the label as the accessibility label, and keep placeholders for examples, not instructions.

**`MoneyField`** ([money field](../../src/components/money-field.tsx)) is a `Field` for kroner. It keeps the typed text, parses it with a comma decimal, and reports a Norwegian error message instead of changing the amount when the text is invalid.

**`Toggle`** is a labelled `Switch` with optional detail text, tinted `primary`.

**`Segments`** switches between two to four views of the same content, such as Kvitteringer / Varer. On iOS it is the native segmented control; at large text sizes, and off iOS, it draws its own control (see [accessibility](foundations.md#accessibility)).

**`Select`** ([selection](../../src/components/ui/selection.tsx)) is a `Row` that opens a `Sheet` with options, a checkmark on the current one, and search when the list is long.

## Surfaces

**`Panel`** ([surfaces](../../src/components/ui/surfaces.tsx)) is the card. `surface` is the default card on `background`; `plain` is a quieter `surfaceRaised` card for a group nested inside another card, such as product search inside the line editor.

**`List`** is the card that holds a list. It draws a `line` divider between its children and renders nothing when it has none, so every list in the app, rows, spending bars, receipt lines, and the receipts of a month in Kvitteringer, sits in one of these and looks the same. Give it `Row`s or other full-width elements directly, one per row; a fragment or a string is not a row, and the caller needs no index bookkeeping or empty guard.

**`Row`** is the list item: an optional `IconTile`, a title, detail text, a trailing value, and a chevron when tappable. `selected` swaps the chevron for a checkmark. Large text moves the value under the title (see [accessibility](foundations.md#accessibility)).

**`IconTile`** is the soft cobalt tile behind an icon: a 32-point squircle with the `tile` radius in a `Row` and the upload queue, where it can hold a spinner instead, or the 64-point `circle` that `Empty` leads with.

**`SectionTitle`** heads a group with optional detail text under it and an optional text action on the right, such as "Start" over the receipts to review or "Bekreft alle" over the review lines; `actionLabel` names the object for VoiceOver when the short action text does not. Kvitteringer uses the detail for the month's count and total.

**`Disclosure`** is a card that expands in place for secondary detail, such as "Om kvitteringen" or "Slik er endringen beregnet".

**`ReceiptCard`** ([receipt card](../../src/components/receipt-card.tsx)) summarises a receipt that waits for a person or is still on its way in: store, date and branch, total, and a coloured status line (warning for review, danger for failure) followed by what needs attention. A receipt still being processed shows a spinner in place of the total; `compact`, used for those receipts under "Under behandling", tightens the padding and drops an empty status line.

## Feedback and states

**`Notice`** is an inline message with an icon. Tones: `info` (soft cobalt), `warning`, `error` (marked as an alert), and `success`. [Screen states](patterns.md#states-every-data-screen-handles) say where the offline notice goes. `title` adds a bold first line above the message, and `onPress` makes the notice a button with a trailing chevron, as the pending-receipts notice on Forbruk that opens Kvitteringer and the next-step notice on a receipt under review, whose title is the open question and whose message says how to settle it. `OfflineNotice` ([offline notice](../../src/features/offline-notice.tsx)) is the "Uten nett" notice that reads the household's connection itself; a screen renders it first instead of checking `online`.

**`Loading`** is a centred spinner with a Norwegian status, "Henter …" by default. Name what is loading: "Henter kvittering …".

**`Empty`** is a card with an icon disc, title, message, and optional actions, for an empty state anywhere but a tab root, such as "Ingen treff" or "Ingen rettelser ennå". **`IllustratedEmpty`** ([artwork](../../src/components/monument-artwork.tsx)) puts the monument artwork on an empty tab root with a screen-title-sized heading, as "Kvitteringene samles her" on Kvitteringer.

**`ReceiptTip`** ([receipt tip](../../src/components/receipt-tip.tsx)) shows a native TipKit tip, such as the widget suggestion on Forbruk. It renders nothing where TipKit is unavailable.

## Containers

**`Screen`** ([layout](../../src/components/ui/layout.tsx)) is the page frame. It provides the safe area, keyboard avoidance, scrolling, a maximum content width, and three optional regions:

- `title` and `subtitle` draw the cobalt hero header with the arch mark; `settings` adds `SettingsButton`.
- `summary` takes a `SummaryBand`, which sits under the header edge to edge.
- `footer` pins an action bar to the bottom, above the home indicator, on `surface` with a hairline top border.

Pass `insetTop={false}` when a native stack header already covers the top inset.

**`SummaryBand`** is the cobalt band with a screen's key number: the month menu and total on Forbruk, the paid amount and status chips on a receipt, the current item in Koble produkter. It owns the hero fill and padding; screens put an `Amount size="hero"` and `onHero` text inside it.

**`Sheet`** is a bottom sheet with a title, a close button ("Lukk"), optional fixed `header` and `footer`, and scrolling content. On iOS it is a native sheet with medium and large detents and a drag indicator. Set `dismissible={false}` while closing would lose work or leave an invalid value: while a save is busy, or while the paid amount is invalid in Kvitteringsdetaljer.

**`NativeForm`** and **`FormSection`** ([native form](../../src/components/ui/native-form.ios.tsx)) render a SwiftUI grouped form on iOS for settings-style screens and field sheets, with React Native content inside each section. Each section takes the theme's `surface` as its row background, so settings cards match every other card in both colour schemes.

**Native menus.** `PeriodMenu` ([period menu](../../src/features/period-menu.ios.tsx)) and `ReceiptContextMenu` ([context menu](../../src/features/receipt-context-menu.ios.tsx)) use SwiftUI menus on iOS; each has a plain fallback for other platforms in the same folder.
