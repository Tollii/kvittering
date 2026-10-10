# Foundations

Colour, type, shape, and feedback as the app uses them today. [Theme](../../src/constants/theme.ts) owns the values; this page explains which token to choose and why. Read a token from `useTheme()` and never write a colour literal: lint rejects hex and `rgb()` literals outside [widgets](#widgets).

## Colour

The palette is cobalt ink on warm paper. Light and dark share token names, so a screen that uses tokens gets dark mode for free. Choose by role, not by appearance.

### Surfaces

| Token           | Role                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `background`    | Screen and sheet backdrop.                                                                                               |
| `surface`       | Cards (`Panel`), text fields, footer action bars.                                                                        |
| `surfaceRaised` | A quieter card (`Panel tone="plain"`) and inset boxes such as the invitation code.                                       |
| `muted`         | Fill for secondary buttons, chips, segmented-control track, progress tracks.                                             |
| `line`          | Dividers between rows, field borders, footer top border.                                                                 |
| `hero`          | Cobalt header and summary band. It stays dark in both schemes, so text on it uses `onHero`, never `text`.                |
| `heroControl`   | Translucent disc behind a control on the hero, such as the settings button or the receipt's edit button.                 |
| `heroTrack`     | Track of a bar drawn on the hero (budget pace). `heroMarker` is the "today" tick; `heroWarning` is the over-budget fill. |

### Content

| Token                   | Role                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `text`                  | Body copy and titles on light surfaces.                                                 |
| `secondary`             | Supporting copy (`Copy muted`), placeholders, trailing chevrons.                        |
| `primary`               | Interactive tint: links, icons, selected states, primary buttons, focused field border. |
| `primarySoft`           | Soft cobalt fill: `tint` buttons, info notices, icon tiles in rows, empty-state disc.   |
| `onPrimary`             | Text and icons on a `primary` fill.                                                     |
| `onHero`, `onHeroMuted` | Text on `hero`; muted for dates, eyebrows, and subtitles.                               |

### Status

Each status has a strong and a soft token. Use the soft one as a fill and the strong one for the text and icon on it, as `Notice` and `Chip` do.

| Status  | Strong / soft             | Use                                                          |
| ------- | ------------------------- | ------------------------------------------------------------ |
| Success | `success` / `successSoft` | Reviewed receipt, completed upload, swipe-to-approve action. |
| Warning | `warning` / `warningSoft` | Unsaved changes, reading issues, retry pending.              |
| Danger  | `danger` / `dangerSoft`   | Errors, destructive buttons, failed upload.                  |

### Charts

`chart` is a four-step cobalt ramp, strongest first; `onChart` is the readable label colour on each step. Spending bars colour the top rows with the first steps and every later row with the last; a negative amount, such as a deposit return, uses `warning`. The shopping calendar uses the ramp as a heat scale on a `muted` empty day. Keep series distinguishable by label and position, not by hue alone, because the ramp is one hue.

### Fixed-context colours

Some backdrops do not follow the colour scheme, so their tokens do not either:

- **Camera** (`cameraBackground`, `onCamera`, `onCameraMuted`, `cameraOverlay`, `cameraOverlayStrong`, `cameraGuide`): the viewfinder stays dark so it reads as a photo. Controls over the camera sit on `cameraOverlay` discs. On the simulator there is no camera feed, so these controls blend into an empty dark view.
- **Product photos** (`productImageBackground`, `productImagePlaceholder`): catalogue images have white backgrounds, so their frame stays white in dark mode. `imageOutline` draws a faint edge around any image.

### Widgets

`expo-widgets` turns each widget function into a string, so code in [widgets](../../src/widgets) cannot read the theme and keeps literal colours. Keep those literals equal to a theme token's light value and say which token in a comment when you add one.

## Typography

The app uses the system font (San Francisco) through `Copy`. There is no named type scale; `Copy` takes a `size` and `weight`, then derives line height and tracking:

- Line height is 1.12 × size at 28 pt and above, 1.2 × from 22 pt, and 1.32 × below.
- `tracking(size)` tightens large text (−1.2 at 40 pt) and loosens small text (+0.15 at 12 pt). Use it for any text you style outside `Copy`.
- Every `Copy` sets tabular numerals, so amounts align in columns.

The sizes in use cluster into these roles. Use the role's size and weight for new text.

| Role                 | Size / weight | Examples                                                      |
| -------------------- | ------------- | ------------------------------------------------------------- |
| Hero amount          | 36 / 600      | Month total on Forbruk, paid amount on a receipt.             |
| Detail amount        | 34 / 800      | Total in a spending-detail sheet, analysis headline.          |
| Authentication title | 32 / 700      | Welcome and sign-in screens.                                  |
| Screen title         | 24 / 600      | Hero header title (`Screen title`), camera empty-state title. |
| Empty-state title    | 20 / 700      | `Empty`; the illustrated variant uses 25 / 600.               |
| Sheet title          | 20 / 700      | `Sheet` header.                                               |
| Section title        | 19 / 700      | `SectionTitle`.                                               |
| Card title           | 17 / 600–700  | Store and amount in `ReceiptCard`.                            |
| List value           | 15 / 500–600  | Name and amount in spending bars.                             |
| Body                 | 16 / 400      | `Copy` default, `Row` title (600), buttons (600).             |
| Field input          | 17 / 400      | Text inside `Field`.                                          |
| Notice               | 15 / 400      | `Notice` text.                                                |
| Supporting           | 14 / 600      | Chips, `SectionTitle` action, segmented labels.               |
| Detail               | 13 / 400      | `Row` detail, field labels (600), toggle detail.              |
| Caption and eyebrow  | 12 / 400–600  | Hints, "Sveip for å godkjenne", the hero eyebrow.             |

Weights are 400 for reading, 600 for labels and interactive text, 700 for titles, and 800 only for large amounts. Mark each title with `accessibilityRole="header"`.

## Spacing

There are no spacing tokens. The values in use follow a 4-point rhythm with a few 2-point adjustments:

- Screen content: 20 horizontal padding, 16 between blocks. Sheets: 16 padding, 16 between blocks.
- Inside a card (`Panel`): 16 padding, 10 between items. A list card uses `gap: 0` with 4 vertical padding and dividers between rows.
- Rows and inline groups: 12 between an icon and its text, 8 between buttons, 4–6 between a title and its detail.
- Footer action bar: 16 horizontal, 12 top, and the safe-area inset (at least 12) at the bottom.
- Content is capped at 760 points wide and centred, so the iPad layout stays readable.

## Shape

| Token            | Value source                          | Use                                                       |
| ---------------- | ------------------------------------- | --------------------------------------------------------- |
| `radius.card`    | [theme](../../src/constants/theme.ts) | `Panel`, `Empty`, swipe action.                           |
| `radius.control` | theme                                 | `Button`, `Field`, `Notice`, segmented track.             |
| `radius.chip`    | theme                                 | `Chip`.                                                   |
| `radius.inner`   | theme                                 | Images inside a card.                                     |
| `radius.sheet`   | theme                                 | Defined but unused; native sheets draw their own corners. |

Always add `borderCurve: "continuous"` with a radius, as iOS does. Circular controls (44-point icon discs, the shutter) use half their size. Many components still use literal radii; see [open questions](open-questions.md#radii-outside-the-scale).

## Elevation

The app is flat. Cards separate from the background by colour (`surface` on `background`), not by shadow, and the hero separates by its cobalt fill. The `shadow` and `scrim` tokens exist but nothing uses them. Native sheets and menus bring the system's own depth.

## Iconography

Icons are SF Symbols through `Icon`, tinted `primary` by default and hidden from VoiceOver, so the control that holds an icon carries the label. Prefer the outline symbol and let the tab bar use the `.fill` variant for its selected state.

| Context                       | Size         |
| ----------------------------- | ------------ |
| Icon button, camera controls  | 17–22        |
| Row leading icon in a 32 tile | 16, semibold |
| Notice icon                   | 16           |
| Chip icon, chevrons           | 9–13         |
| Empty-state icon in a 64 disc | 28           |
| Full-screen state icon        | 44–52        |

Recurring meanings: `wifi.slash` offline, `checkmark.seal` reviewed or approve, `exclamationmark.triangle` warning, `exclamationmark.circle` error, `arrow.clockwise` retry, `barcode` product linking, `person.2` household and settings, `xmark` close, `chevron.right` navigates, `chevron.down` opens a menu or picker.

Illustrations are separate from icons. [Monument artwork](../../src/components/monument-artwork.tsx) supplies two decorative scenes (inbox nave, history monument) under arched masks, and `ArchMark` is the small arch logo in hero headers. Artwork is decorative: it is hidden from VoiceOver and disappears in compact layouts on narrow screens or with large text.

## Motion and feedback

Motion is mostly native: tab switches, stack pushes, sheet presentation, context menus, and the segmented control animate as iOS does. The app adds little of its own:

- Press feedback lowers opacity. `pressed()` uses 0.72; several components use 0.6. Opacity, unlike scaling or sliding, is acceptable under Reduce Motion.
- Disabled controls drop to 0.35–0.45 opacity.
- Swipe to approve in the inbox is the one custom gesture: a left swipe reveals the green approve action and saves when released past the threshold.
- An upload success note fades out on its own after eight seconds once the upload lands.

[Haptics](../../src/lib/haptics.ts) mark outcomes, not taps: a light impact for a confirmed decision, success when a receipt is approved, error when a save fails.

## Accessibility

- Touch targets are at least 44 × 44 points, including chips and links; `Row` is at least 52 high.
- Large text changes layout instead of truncating. Above a font scale of 1.3, segmented controls stack vertically, `Row` moves its value below the title, sheets open at full height, and multi-column metrics stack. Above 1.2, compact artwork disappears.
- Labels are Norwegian and describe the action, such as "Ta bilde av kvitteringen" for the shutter.
- Errors in `Notice` are announced (`accessibilityRole="alert"`).
- Never rely on colour alone: status chips carry an icon and text.
