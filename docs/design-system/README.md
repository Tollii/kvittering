# Design system

Kvitto's visual language, components, screen patterns, and voice, as the app does them today. Read it before you build or change anything a person sees. The code remains the source of truth for exact values: [theme](../../src/constants/theme.ts) owns colours and radii, and [`src/components/ui`](../../src/components/ui) owns the shared components. These pages explain which to use, when, and why.

## Character

Cobalt ink on warm paper. A cobalt header and summary band carry the screen's identity and its key number; content sits below on paper in flat white cards. Native iOS controls do the work wherever they exist: tabs, stack headers, sheets, menus, search, segmented controls, and forms. Artwork, the arch mark and the monument scenes, adds texture to headers and empty screens, while controls stay plain. Every string the app writes is Norwegian.

## Rules of thumb

- Use theme tokens through `useTheme()`; never write a colour literal. The [widgets](foundations.md#widgets) are the one exception.
- Build from the shared components, and extend one when it cannot express what you need instead of restyling a `View`.
- Put a component where its reach says: the presentation catalogue in `src/components/ui`, a domain component that several screens share in `src/components`, and a component that one screen or sheet uses next to that screen in `src/features`. See [where components live](components.md#where-components-live).
- Every list sits in a `List` card; every large amount is an `Amount`; every cobalt band is a `SummaryBand`. When two screens need the same thing, they share the component rather than the styles.
- Use native iOS presentation first: a `Sheet` for choices and short edits, a system alert for confirmations, a native menu for a short fixed list such as the month menu, and `Select` or a sheet for a long or searchable list.
- Keep touch targets at 44 points and check layouts at the largest text size.
- Keep motion native, small, and purposeful: build tappable surfaces on `Press` and take durations and curves from the theme. See [motion and feedback](foundations.md#motion-and-feedback).
- Show what is known and say what is not. Unknown amounts and dates read "Ukjent" and "Dato ukjent"; provisional totals say so.
- Write sentence-case Norwegian that tells the person what happened and what to do next.

## Pages

- [Foundations](foundations.md): colour, typography, spacing, shape, elevation, icons, motion, haptics, and accessibility.
- [Components](components.md): the shared components, their variants and states.
- [Screens and flows](patterns.md): navigation, screen anatomy, required states, the main flows, and a screenshot of each screen.
- [Voice and copy](voice.md): tone, mechanics, number and date formats, copy patterns, and vocabulary.

## Designing ahead

The [Kvitto design system on claude.ai](https://claude.ai/artifact/N6izBtD3XSNnFXQdHVqSxi) is a browsable copy of these pages with the tokens, the logo and artwork, and web renditions of the components, for mocking up a feature on a design canvas before building it. It is a snapshot synced from this code at the commit it names; when they differ, the code wins.

## Design skills

The [design engineering](../../.agents/skills/emil-design-eng/SKILL.md), [Apple design](../../.agents/skills/apple-design/SKILL.md), and [Expo animation](../../.agents/skills/animate-expo/SKILL.md) skills, with their siblings for reviewing, auditing, and stress-testing UI, are Emil Kowalski's, vendored unchanged. Use them to judge interaction and motion; several speak in web terms, so translate CSS to React Native and Reanimated. Where they and these pages differ, these pages win. Their recipes sometimes install a package with `npx expo install`; a new native package needs a new TestFlight build, so prefer what the app already ships.

## Changing the system

When a screen needs something the system does not have, add it to the shared component or the theme, use it from every place that needs it, and describe it on the page it belongs to in the same change. Where the app once did the same thing in more than one way, these pages now state the one way; a new exception needs a reason written next to it.
