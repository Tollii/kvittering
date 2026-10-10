# Foundations

Colour, type, shape, and feedback as the app uses them today. [Theme](../../src/constants/theme.ts) owns the values; this page explains which token to choose and why. Read a token from `useTheme()` and never write a colour literal: lint rejects hex and `rgb()` literals outside [widgets](#widgets).

## Colour

The palette is cobalt ink on warm paper. Light and dark share token names, so a screen that uses tokens gets dark mode for free. Choose by role, not by appearance. Every token has a user; when a role disappears, its token goes with it.

### Surfaces

| Token           | Role                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `background`    | Screen and sheet backdrop, including sign-in.                                                                            |
| `surface`       | Cards (`Panel`, `List`), text fields, footer action bars, and the sections of a `NativeForm`.                            |
| `surfaceRaised` | A quieter card (`Panel tone="plain"`) and inset boxes such as the invitation code.                                       |
| `muted`         | Fill for secondary buttons, chips, segmented-control track, progress tracks.                                             |
| `line`          | Dividers between rows, field borders, footer top border.                                                                 |
| `hero`          | Cobalt header and `SummaryBand`. It stays dark in both schemes, so text on it uses `onHero`, never `text`.               |
| `heroControl`   | Translucent disc behind a control on the hero, such as the settings button or the receipt's edit button.                 |
| `heroTrack`     | Track of a bar drawn on the hero (budget pace). `heroMarker` is the "today" tick; `heroWarning` is the over-budget fill. |

### Content

| Token                   | Role                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `text`                  | Body copy and titles on light surfaces.                                                           |
| `secondary`             | Supporting copy (`Copy muted`), placeholders, trailing chevrons.                                  |
| `primary`               | Interactive tint: links, icons, selected states, primary buttons, focused field border, spinners. |
| `primarySoft`           | Soft cobalt fill: `tint` buttons, info notices, `IconTile`.                                       |
| `onPrimary`             | Text and icons on a `primary` fill.                                                               |
| `onHero`, `onHeroMuted` | Text on `hero`; muted for dates, eyebrows, and subtitles.                                         |

### Status

Each status has a strong and a soft token. Use the soft one as a fill and the strong one for the text and icon on it, as `Notice` and `Chip` do.

| Status  | Strong / soft             | Use                                                                                              |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| Success | `success` / `successSoft` | Reviewed receipt, completed upload, swipe-to-approve action.                                     |
| Warning | `warning` / `warningSoft` | Unsaved changes, reading issues, a needs-review status, and a failed upload that waits to retry. |
| Danger  | `danger` / `dangerSoft`   | Errors, destructive buttons, failed reading.                                                     |

A failed upload is a warning, not a danger: the images are safe in the queue and the app retries, so Kamera's upload note and the Innboks queue both show the `arrow.clockwise.circle` symbol in `warning`.

### Charts

`chart` is a four-step cobalt ramp, strongest first; `onChart` is the readable label colour on each step. Spending bars colour the top rows with the first steps and every later row with the last; a negative amount, such as a deposit return, uses `warning`. The shopping calendar uses the ramp as a heat scale on a `muted` empty day. Keep series distinguishable by label and position, not by hue alone, because the ramp is one hue.

### Fixed-context colours

Some backdrops do not follow the colour scheme, so their tokens do not either:

- **Camera** (`cameraBackground`, `onCamera`, `onCameraMuted`, `cameraOverlay`, `cameraOverlayStrong`, `cameraGuide`): the viewfinder stays dark so it reads as a photo. Controls over the camera sit on `cameraOverlay` discs, and the shutter is an `onCamera` ring and disc. On the simulator there is no camera feed, so these controls blend into an empty dark view.
- **Product photos** (`productImageBackground`, `productImagePlaceholder`): catalogue images have white backgrounds, so their frame stays white in dark mode. `imageOutline` draws a faint edge around any image.

### Widgets

`expo-widgets` turns each widget function into a string, so code in [widgets](../../src/widgets) cannot read the theme and keeps literal colours. Match a new literal to the value of the token whose role it plays, in the scheme its backdrop implies: the purchase widget draws the light `background` and `primary`, and the Live Activity's compact icon on the always-black Dynamic Island draws the dark `primary`. A widget change ships with the next native build, not an OTA update.

## Typography

The app uses the system font (San Francisco) through `Copy` ([typography](../../src/components/ui/typography.tsx)). There is no named type scale: `Copy` takes a size and weight, derives line height and tracking from the size, and sets tabular numerals so amounts align. Style any text outside `Copy` with `tracking(size)`.

Text sizes cluster into roles. For new text, copy the size and weight of the role it plays from the place named here rather than picking a new one.

| Role                | Copy it from                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Key amount on hero  | `Amount hero`: the month total on Forbruk, the paid amount on a receipt.                                                        |
| Amount in a sheet   | `Amount`: the total that opens a detail sheet, the store total in Butikker, the analysis total.                                 |
| Screen title        | The `Screen` header ([layout](../../src/components/ui/layout.tsx)); `IllustratedEmpty` uses the same size on an empty tab root. |
| Sheet title         | The `Sheet` header; `Empty` uses the same size for its title.                                                                   |
| Section title       | `SectionTitle` ([surfaces](../../src/components/ui/surfaces.tsx)).                                                              |
| Card title          | Store and amount in [`ReceiptCard`](../../src/components/receipt-card.tsx).                                                     |
| Body and row titles | The `Copy` default; `Row` titles and buttons use the same size, heavier.                                                        |
| Detail              | `Row` detail and the labels of `Field` ([controls](../../src/components/ui/controls.tsx)).                                      |
| Caption             | `Field` hints.                                                                                                                  |

Weight carries meaning: regular for reading, semibold (600) for labels, interactive text, and the hero amount, bold (700) for titles and amounts on paper. Mark each title with `accessibilityRole="header"`.

## Spacing

There are no spacing tokens. Spacing follows a 4-point rhythm, and the shared components own it: copy the padding and gaps of `Screen`, `Sheet`, `Panel`, `List`, and `Row` instead of setting new ones. `Amount` owns the gap between a large amount and its `detail` line. `Screen` also caps content width and centres it, so layouts stay readable on iPad.

## Shape

| Token            | Value source                          | Use                                                                                        |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `radius.card`    | [theme](../../src/constants/theme.ts) | `Panel`, `List`, `Empty`, swipe action, the store map, the arch tile on sign-in.           |
| `radius.control` | theme                                 | `Button`, `Field`, `Notice`, segmented track, the Sign in with Apple button.               |
| `radius.chip`    | theme                                 | `Chip`.                                                                                    |
| `radius.inner`   | theme                                 | Images inside a card, including the capture-review pages.                                  |
| `radius.tile`    | theme                                 | `IconTile`, inset boxes, calendar days, category-group tiles, the camera's overlay labels. |

Always add `borderCurve: "continuous"` with a radius, as iOS does. Circles and bars use half their size: icon discs, the shutter and the two 54-point camera buttons beside it, the 64-point disc in `Empty`, and the thin progress and spending bars. There are no other radii; a new shape joins this table or uses one of these.

## Elevation

The app is flat. Cards separate from the background by colour (`surface` on `background`), not by shadow, and the hero separates by its cobalt fill. Native sheets and menus bring the system's own depth.

## Iconography

Icons are SF Symbols through `Icon`, tinted `primary` by default and hidden from VoiceOver, so the control that holds an icon carries the label. Prefer the outline symbol and let the tab bar use the `.fill` variant for its selected state. Size an icon like the same element in a shared component: `IconButton`, `IconTile`, `Notice`, `Chip`, and `Empty` each set theirs.

Recurring meanings: `wifi.slash` offline, `checkmark.seal` reviewed or approve, `exclamationmark.triangle` warning, `exclamationmark.circle` error, `arrow.clockwise` retry, `arrow.clockwise.circle` an upload waiting to retry, `barcode` product linking, `person.2` household and settings, `xmark` close, `chevron.right` navigates, `chevron.down` opens a menu or picker.

Illustrations are separate from icons. [Monument artwork](../../src/components/monument-artwork.tsx) supplies two decorative scenes (inbox nave, history monument) under arched masks, and `ArchMark` is the small arch logo in hero headers and on sign-in. Artwork is decorative: it is hidden from VoiceOver and disappears in compact layouts on narrow screens or with large text.

## Motion and feedback

Motion is mostly native: tab switches, stack pushes, sheet presentation, context menus, and the segmented control animate as iOS does, and the app never rebuilds them in JavaScript. Its own motion is small, fast, and earns its place. Animate only what a person sees occasionally or caused themselves, give each animation a purpose (feedback, where something came from, or a state change), and leave anything seen dozens of times a day still or nearly so. [Theme](../../src/constants/theme.ts) owns the durations and curves in `motion`, and [motion](../../src/components/ui/motion.tsx) builds on them:

- **Press.** Every custom pressable is a `Press`. Objects such as buttons, chips, cards, and the camera controls shrink to 97 % and dim slightly under the finger; rows and text links inside a card only dim (`feedback="highlight"`), because a row shrinking inside its card looks broken. The feedback starts on touch-down and takes `motion.press`, so it reads as instant. A disabled control fades through `faded()`.
- **Arrival.** Content a person asked for settles into place from a few points above with `useArrival`, as a `Disclosure`'s detail and Kamera's upload note do. The upload note leaves on its own, so it goes back the same way, faster, with `useDeparture`; a closing disclosure just closes. Detail that is open from the start does not animate.
- **State.** A `Disclosure` turns its chevron rather than swapping the symbol.
- **Gesture.** Swipe to approve in the inbox is the one custom gesture: a left swipe reveals the green approve action and saves when released past the threshold.

Curves come only from `motion`: the strong ease-out for anything arriving or answering a press, the ease-in-out for something turning in place, and never an ease-in, which starts slowly at the moment the person is watching. Animate only `transform` and `opacity`. Under Reduce Motion, keep fades and drop movement and scaling: `Press` only dims, and arrivals only fade. The app reads the setting at launch, so a change takes effect the next time it opens.

[Haptics](../../src/lib/haptics.ts) mark outcomes, not taps: a light impact for a confirmed decision, success when a receipt is approved or a product link is saved or undone, error when a save fails.

## Accessibility

This is the single home for accessibility rules; other pages link here.

- Everything tappable is at least 44 × 44 points, including chips and links.
- Large text changes layout instead of truncating. Past a font-scale threshold, segmented controls stack vertically, `Row` moves its value below the title, sheets open at full height, and side-by-side metrics stack; compact artwork disappears earlier. Read `fontScale` the way those components do, and reuse their thresholds.
- Labels are Norwegian and describe the action, such as "Ta bilde av kvitteringen" for the shutter.
- Errors in `Notice` are marked as alerts (`accessibilityRole="alert"`).
- Never rely on colour alone: status chips carry an icon and text.
