# Design system

Kvitto's visual language, components, screen patterns, and voice, as the app does them today. Read it before you build or change anything a person sees. The code remains the source of truth for exact values: [theme](../../src/constants/theme.ts) owns colours and radii, and [`src/components/ui`](../../src/components/ui) owns the shared components. These pages explain which to use, when, and why.

## Character

Cobalt ink on warm paper. A cobalt header and summary band carry the screen's identity and its key number; content sits below on paper in flat white cards. Native iOS controls do the work wherever they exist: tabs, stack headers, sheets, menus, search, segmented controls, and forms. Artwork, the arch mark and the monument scenes, adds texture to headers and empty screens, while controls stay plain. Every string is Norwegian.

## Rules of thumb

- Use theme tokens through `useTheme()`; never write a colour literal. The [widgets](foundations.md#widgets) are the one exception.
- Build from the shared components, and extend one when it cannot express what you need instead of restyling a `View`.
- Use native iOS presentation first: a `Sheet` for choices and short edits, a system alert for confirmations, a native menu for pickers.
- Keep touch targets at 44 points and check layouts at the largest text size.
- Show what is known and say what is not. Unknown amounts and dates read "Ukjent" and "Dato ukjent"; provisional totals say so.
- Write sentence-case Norwegian that tells the person what happened and what to do next.

## Pages

- [Foundations](foundations.md): colour, typography, spacing, shape, elevation, icons, motion, haptics, and accessibility.
- [Components](components.md): the shared components, their variants and states.
- [Screens and flows](patterns.md): navigation, screen anatomy, required states, the main flows, and a screenshot of each screen.
- [Voice and copy](voice.md): tone, mechanics, number and date formats, copy patterns, and vocabulary.
- [Open questions](open-questions.md): inconsistencies in the app today, recorded rather than resolved.

## Changing the system

Change the token or component, then the page that describes it, in the same pull request. A change people can see needs screenshots in the pull request, as [AGENTS.md](../../AGENTS.md#ui-changes) describes. Resolve an open question by changing the code and removing the question.
