# Components

Shared presentation components live in [`src/components/ui`](../../src/components/ui) and are imported from `@/components/ui`. Reach for these before styling a `View` or `Pressable` yourself; when a screen needs something they cannot express, extend the component rather than copying its styles. The source owns props and exact styles; this page explains purpose, variants, and states.

## Text and icons

**`Copy`** ([typography](../../src/components/ui/typography.tsx)) is the only text component. It takes `size`, `weight`, and `muted`, and sets line height, tracking, and tabular numerals. See [typography](foundations.md#typography) for the size of each role.

**`Icon`** renders an SF Symbol, `primary` by default, hidden from VoiceOver. Label the control that contains it instead.

**`pressed(state)`** is the shared press style. Use it on any custom `Pressable`.

## Actions

**`Button`** ([controls](../../src/components/ui/controls.tsx)) is a full-width-capable action with an optional leading SF Symbol.

| Variant     | Look                               | Use                                                                           |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `primary`   | `primary` fill, `onPrimary` text   | The one main action on a screen or sheet: "Lagre og godkjenn", "Logg inn".    |
| `secondary` | `muted` fill, `text`               | Alternatives: "Forkast importen", "Vis flere kvitteringer".                   |
| `tint`      | `primarySoft` fill, `primary` text | A supporting action that should still read as cobalt: "Kopier", "Prøv igjen". |
| `danger`    | `dangerSoft` fill, `danger` text   | Destructive actions such as "Slett kvittering". Confirm with an alert.        |

States: `disabled` fades the button; `busy` shows a spinner in place of the icon, or before the title when there is no icon, and disables the button while keeping the title. `compact` is the shorter size for inline and footer use.

**`IconButton`** is an icon-only control with a required Norwegian `label`. `filled` adds the muted disc, or pass a colour such as `heroControl` on the hero.

**`SettingsButton`** ([layout](../../src/components/ui/layout.tsx)) opens household settings. Every tab places it at the top right; `surface="camera"` adapts it to the viewfinder.

**`Chip`** shows a short status or opens a picker. Tones are `muted`, `primary`, `accent`, `success`, and `warning`. A chip with `onPress` grows to a full touch target and shows a chevron, unless `trailing="none"` marks it as an action rather than a dropdown. A chip without `onPress` is read as text.

## Inputs

**`Field`** is a labelled text input. The label sits above in secondary text; the border turns `primary` on focus; `hint` adds a caption below. On iOS it adds a keyboard toolbar with "Ferdig". Use the label as the accessibility label, and keep placeholders for examples, not instructions.

**`MoneyField`** ([money field](../../src/components/money-field.tsx)) is a `Field` for kroner. It keeps the typed text, parses it with a comma decimal, and reports a Norwegian error message instead of changing the amount when the text is invalid.

**`Toggle`** is a labelled `Switch` with optional detail text, tinted `primary`.

**`Segments`** switches between two to four views of the same content, such as Kvitteringer / Varer. On iOS it is the native segmented control; at large text sizes, and off iOS, it draws its own control (see [accessibility](foundations.md#accessibility)).

**`Select`** ([selection](../../src/components/ui/selection.tsx)) is a `Row` that opens a `Sheet` with options, a checkmark on the current one, and search when the list is long.

## Surfaces

**`Panel`** ([surfaces](../../src/components/ui/surfaces.tsx)) is the card. Tones:

- `surface`: the default card on `background`.
- `plain`: a quieter `surfaceRaised` card, for a nested group such as product search inside the line editor.
- `soft`: a `primarySoft` card. Nothing uses it today.
- `primary`: the cobalt `hero`. With `borderRadius: 0` it forms the summary band under a hero header.

For a list inside a card, set `gap: 0` and `paddingVertical: 4`, and give each row after the first a 1-point `line` top border.

**`Row`** is the list item: an optional icon tile, a title, detail text, a trailing value, and a chevron when tappable. `selected` swaps the chevron for a checkmark. Large text moves the value under the title (see [accessibility](foundations.md#accessibility)).

**`SectionTitle`** heads a group with an optional text action on the right, such as "Start" in the inbox.

**`Disclosure`** is a card that expands in place for secondary detail, such as "Om kvitteringen" or "Slik er endringen beregnet".

**`ReceiptCard`** ([receipt card](../../src/components/receipt-card.tsx)) summarises a receipt in the inbox: store, date and branch, total, and a coloured status line (warning for review, danger for failure) followed by what needs attention. A receipt still being processed shows a spinner in place of the total; `compact`, used for those receipts in the inbox, tightens the padding and drops an empty status line.

## Feedback and states

**`Notice`** is an inline message with an icon. Tones: `info` (soft cobalt), `warning`, `error` (marked as an alert), and `success`. Pass `icon="wifi.slash"` for the offline notice; [screen states](patterns.md#states-every-data-screen-handles) say where it goes.

**`Loading`** is a centred spinner with a Norwegian status, "Henter …" by default. Name what is loading: "Henter kvittering …".

**`Empty`** is a card with an icon disc, title, message, and optional actions, for an empty state anywhere but a tab root, such as "Ingen treff" or "Ingen rettelser ennå". **`IllustratedEmpty`** ([artwork](../../src/components/monument-artwork.tsx)) puts the monument artwork on an empty tab root: "Ingen kvitteringer til kontroll" in the inbox and "Historikken begynner her" in history.

**`ReceiptTip`** ([receipt tip](../../src/components/receipt-tip.tsx)) shows a native TipKit tip, such as the widget suggestion on Forbruk. It renders nothing where TipKit is unavailable.

## Containers

**`Screen`** ([layout](../../src/components/ui/layout.tsx)) is the page frame. It provides the safe area, keyboard avoidance, scrolling, a maximum content width, and three optional regions:

- `title` and `subtitle` draw the cobalt hero header with the arch mark; `settings` adds `SettingsButton` and `headerRight` adds other icon buttons.
- `summary` sits under the header, edge to edge, for a cobalt summary band.
- `footer` pins an action bar to the bottom, above the home indicator, on `surface` with a hairline top border.

Pass `insetTop={false}` when a native stack header already covers the top inset.

**`Sheet`** is a bottom sheet with a title, a close button ("Lukk"), optional fixed `header` and `footer`, and scrolling content. On iOS it is a native sheet with medium and large detents and a drag indicator. Set `dismissible={false}` while closing would lose work or leave an invalid value: while a save is busy, or while the paid amount is invalid in Kvitteringsdetaljer.

**`NativeForm`** and **`FormSection`** ([native form](../../src/components/ui/native-form.ios.tsx)) render a SwiftUI grouped form on iOS for settings-style screens and field sheets, with React Native content inside each section.

**Native menus.** `PeriodMenu` ([period menu](../../src/components/period-menu.ios.tsx)) and `ReceiptContextMenu` ([context menu](../../src/components/receipt-context-menu.ios.tsx)) use SwiftUI menus on iOS; each has a plain fallback for other platforms in the same folder.
