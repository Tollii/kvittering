---
name: make-interfaces-feel-better
description: "Review or refine UI consistency, typography, surfaces, icons, and feedback within the existing design system. Use for a requested visual or interaction improvement."
---

# Interface refinement

Identify the affected user path and the existing styling and component system. Express changes through that system. Do not add a styling or animation dependency for an isolated visual change.

Inspect relevant default, focus, pressed, disabled, loading, empty, and failure states. Match scope to the request: a local adjustment does not require a full application review. For motion, check interruption and reduced-motion behavior; slow playback can help diagnose a visible problem.

Read only the relevant reference:

- [Typography](typography.md): hierarchy, wrapping, and changing numbers.
- [Surfaces](surfaces.md): spacing, nested radii, depth, and hit areas.
- [Animations](animations.md): state transitions and restraint.
- [Icons](icons.md): optical weight, state, and direction.
- [Performance](performance.md): animation properties and rendering cost.

Use the reference defaults for the relevant design decision. Preserve existing tokens and accessibility requirements; explain a necessary deviation instead of silently replacing the guidance. Preserve clear focus indicators, legibility, target separation, and static feedback. Motion must not delay frequent work.

For physical gesture design, use `apple-design` when available; do not require it for ordinary typography or spacing work.

Report actionable findings with location, user impact, and a concrete correction. State what was inspected and tested. Do not invent rejected candidates, fill a finding quota, or block a useful change on optional cosmetic preferences. When implementing, verify the changed states and report any remaining limitation.

## Core principles and common mistakes

The following defaults apply to the relevant platform and design decision. Use the detailed category references for implementation examples. Adapt web mechanisms to native equivalents and preserve existing accessibility requirements.

### 1. Concentric Border Radius

Outer radius = inner radius + padding. Mismatched radii on nested elements is the most common thing that makes interfaces feel off.

### 2. Optical Over Geometric Alignment

When geometric centering looks off, align optically. Buttons with icons, play triangles, and asymmetric icons all need manual adjustment.

### 3. Shadows for Elevation, Borders for Structure

For buttons, cards, and containers whose border exists only to create depth, prefer layered transparent `box-shadow` values. Keep borders that communicate structure or state: dividers, layout separators, and selected or focus states.

### 4. Interruptible Animations

Use CSS transitions for interactive state changes — they can be interrupted mid-animation. Reserve keyframes for staged sequences that run once.

### 5. Split and Stagger Enter Animations

For an infrequent staged entrance where sequence helps communicate hierarchy, break content into semantic chunks and stagger them by ~100ms instead of animating one container. Do not stagger routine, high-frequency interactions.

### 6. Subtle Exit Animations

Use a small fixed `translateY` instead of full height. Exits should be softer than enters. Use `ease-out` for both enter and exit transitions.

### 7. Contextual Icon Animations

Animate icons with `opacity`, `scale`, and `blur` instead of toggling visibility. Use exactly these values: scale from `0.25` to `1`, opacity from `0` to `1`, blur from `4px` to `0px`. If the project has `motion` or `framer-motion` in `package.json`, match that package's import path (or the established nearby imports when both exist) and use `transition: { type: "spring", duration: 0.3, bounce: 0 }` — bounce must always be `0`. If no motion library is installed, keep both icons in the DOM (one absolute-positioned) and cross-fade with CSS transitions using `cubic-bezier(0.2, 0, 0, 1)` — this gives both enter and exit animations without any dependency.

### 8. Font Smoothing

Apply `-webkit-font-smoothing: antialiased` to the root layout on macOS for crisper text.

### 9. Tabular Numbers

Use `font-variant-numeric: tabular-nums` for any dynamically updating numbers to prevent layout shift.

### 10. Text Wrapping

Use `text-wrap: balance` on headings. Use `text-wrap: pretty` for body text to avoid orphans.

### 11. Image Outlines

Add a subtle `1px` outline with low opacity to images for consistent depth. The color must be pure black in light mode (`oklch(0 0 0 / 0.1)`) and pure white in dark mode (`oklch(1 0 0 / 0.1)`), never a near-black like slate, zinc, or any tinted neutral. A tinted outline picks up the surface color underneath it and reads as dirt on the image edge.

### 12. Scale on Press

A subtle `scale(0.96)` on click gives buttons tactile feedback. Always use `0.96`. Never use a value smaller than `0.95` — anything below feels exaggerated. Add a `static` prop to disable it when motion would be distracting.

### 13. Skip Animation on Page Load

Use `initial={false}` on `AnimatePresence` to prevent enter animations on first render. Verify it doesn't break intentional entrance animations.

### 14. Never Use `transition: all`

Always specify exact properties: `transition-property: scale, opacity`. Tailwind's `transition-transform` covers `transform, translate, scale, rotate`.

### 15. Use `will-change` Sparingly

Only for `transform`, `opacity`, `filter` — properties the GPU can composite. Never use `will-change: all`. Only add when you notice first-frame stutter.

### 16. Minimum Hit Area

Interactive elements should prefer a 44×44px hit area for touch or mobile contexts. In dense desktop interfaces, use at least 40×40px. Extend with a pseudo-element if the visible element is smaller. Never let hit areas of two elements overlap.

### 17. Match Icon Stroke to Text Weight

An icon next to text carries the text's optical weight: `1.5px` stroke beside regular (400) text, `2px` beside semibold (600). One stroke weight per icon set; never mix libraries on one surface.

### 18. One SVG, Recolored per State

Icons use `currentColor` and get their states (hover, selected, disabled) from CSS color and opacity, never from separate assets. Outline variant is the default; fill variant marks the active state.

### 19. Motion Restraint

No custom animation on high-frequency interactions: the attention cost repeats on every trigger. Motion is never the only feedback channel; every animated state change also needs a static cue such as color, icon, or label.

## Common Mistakes

| Mistake                                        | Fix                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Same border radius on parent and child         | Calculate `outerRadius = innerRadius + padding`                                                   |
| Icons look off-center                          | Adjust optically with padding or fix SVG directly                                                 |
| Border used only to fake elevation             | Use layered `box-shadow` with transparency; keep structural and state borders                     |
| Jarring staged entrance or contextual exit     | Stagger infrequent entrances and keep context-preserving exits subtle                             |
| Numbers cause layout shift                     | Apply `tabular-nums`                                                                              |
| Heavy text on macOS                            | Apply `antialiased` to root                                                                       |
| Animation plays on page load                   | Add `initial={false}` to `AnimatePresence`                                                        |
| `transition: all` on elements                  | Specify exact properties                                                                          |
| First-frame animation stutter                  | Add `will-change: transform` (sparingly)                                                          |
| Tiny hit areas on small controls               | Extend with a pseudo-element to 44×44px for touch/mobile, or at least 40×40px in dense desktop UI |
| Hairline icon beside bold text                 | Match the stroke width to the text weight                                                         |
| Separate icon assets per state                 | One `currentColor` SVG, states via CSS                                                            |
| Filled icons everywhere                        | Outline as default, fill only for the active state                                                |
| Entrance animation on every hover or keystroke | Instant feedback or ≤150ms opacity/color transition                                               |
