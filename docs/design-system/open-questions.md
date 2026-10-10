# Open questions

These are places where the app does the same thing in more than one way. Each records what the code does today; none is decided. Until one is, follow the most common form, which the other pages describe, and do not spread the minority form to new screens. When a question is settled, change the code and the page that describes it, and remove the question here.

## Two kinds of screen header

Innboks and Forbruk draw their own cobalt header through `Screen title` ([layout](../../src/components/ui/layout.tsx)): a 24-point title with the arch mark, the settings button, and room for a summary band. Historikk on iOS, the receipt, Forbruksanalyse, Rettelser, Koble produkter, and settings use the native stack header, coloured `hero` in the [root layout](../../src/app/_layout.tsx) and again by Historikk's stack layout and the Koble produkter screen, with a centred system title and native search or toolbar items, so Historikk's title sits centred where Innboks and Forbruk have a large left-aligned one. Kamera has no header. Should tab roots share one header style, and which?

## Lists in cards or on paper

Most lists are `Row`s inside a `Panel` with dividers: Varer in Historikk, the reports on Forbruk, and settings. The receipt list in Historikk is a flat list on paper with dividers under a month header, and the "Forbruksanalyse" row on Forbruk sits bare between two cards. Should every list sit in a card, and is the flat month list a deliberate exception?

## Month names in lower and upper case

`CalendarMonth.format` gives "september 2026". Historikk capitalises it in month headers ("September 2026"), while the month menu on Forbruk shows it in lower case. Which should a month label use when it stands alone?

## Sign-in follows the system, not the theme

The [authentication layout](../../src/features/authentication-layout.tsx) uses the system background and label colour on iOS instead of `background` and `text`, so sign-in is white and black where the app is warm paper and cobalt ink. [Sign-in](../../src/features/sign-in.tsx) also gives its buttons pill corners (28) and taller height (56), and its fields 14-point corners, where the rest of the app uses `radius.control`. Is sign-in meant to look like the system, or like Kvitto?

## Settings cards turn grey in dark mode

`NativeForm` draws SwiftUI's grouped form sections, so settings and Kvitteringsdetaljer use the system's section colour. In light mode it matches `surface`; in dark mode it is neutral grey, while every other card is the theme's navy `surface`. Should the form sections take the theme surface?

## Radii outside the scale

`radius` defines card, control, chip, and inner corners, but many components use literals: 14 for the camera overlay labels, the pending-receipts notice, capture review, the category picker, and editor panels; 10 and 12 for icon tiles and inset boxes; 18 for camera buttons; 20 for the store map; 9 for the `Row` icon tile. Should these join the scale (for example a "tile" radius), or move to existing tokens?

## Press and disabled opacity

`pressed()` lowers opacity to 0.72, but `IconButton`, `Row`, `Disclosure`, spending bars, and `AuthenticationLink` use 0.6, and the shutter uses 0.7. Disabled controls use 0.35 (`IconButton`), 0.4 (shutter), or 0.45 (`Button`, `AuthenticationLink`). Should there be one pressed and one disabled value?

## Unused and duplicate tokens

In [theme](../../src/constants/theme.ts), `primaryStrong`, `shadow`, `scrim`, and `radius.sheet` have no users, and neither have `Panel tone="soft"` or the `primary` and `accent` tones of `Chip`. `accent` and `accentSoft` equal `primary` and `primarySoft` in both schemes; spinners and upload progress use `accent`, everything else `primary`. Remove the unused ones, or give `accent` its own role?

## Colours that bypass the theme

The camera shutter draws its ring and disc with the named colour `"white"` (`src/app/(tabs)/index.tsx`), which the hex-literal lint rule does not catch. The Live Activity's compact icon uses `#7488FF` ([receipt activity widget](../../src/widgets/receipt-activity.tsx)), which matches no theme token, while the purchase widget's literals match the light `background` and `primary`. Should the shutter use `onCamera`, and which token should the Live Activity match?

## Amounts have no type scale

Large amounts appear at 36 / 600 in hero bands, 34 / 800 in detail sheets and analysis, 30 / 800 in the product-history sheet and family purchases, and 30 / 700 in store spending. Should amounts have two or three named sizes?

## Summary bands are rebuilt per screen

Forbruk, the receipt, and Koble produkter each build the cobalt summary band from `Panel tone="primary"` with `borderRadius: 0`, with different padding each time. Should `Screen` or a `SummaryBand` component own it?

## A tappable notice outside `Notice`

The pending-receipts banner on Forbruk (`src/app/(tabs)/spending.tsx`) is a pressable soft-cobalt box with its own 14-point radius and layout, next to `Notice`, which has 8-point corners and cannot be tapped. Should `Notice` take an `onPress`?

## Icon tiles differ

`Row` puts its icon in a 32-point tile with 9-point corners on `primarySoft`; the inbox upload queue uses a 36-point tile with 10-point corners on `accentSoft`; `Empty` uses a 64-point circle. Should there be one tile component with sizes?

## Empty-state titles

`Empty` titles are 20 / 700; `IllustratedEmpty` titles are 25 / 600. Is the difference intended?

## Offline notice on some screens

Kamera, Innboks, Forbruk, the receipt, and the catalogue product sheet show "Uten nett". Historikk, Forbruksanalyse, Rettelser, and settings show none, and Koble produkter says "Koble til nettet for å lagre produktvalg." instead. Should every screen that reads or writes household data show the same notice?

## Failed uploads in two colours

A failed upload shows a `warning` retry icon in the upload note on Kamera and a `danger` icon and progress bar in the Innboks queue. Which status colour does a failed upload take?

## The app sometimes says "vi"

The app addresses the person as "du" and the household as "dere", but a few explanations speak as "vi": the notes on Rettelser ("Vi lagrer …") and Forbruksanalyse ("Vi trenger …"). Should the app ever speak as "vi"?

## Confirmation titles mix verb forms

Alert titles use the imperative in "Slett kvitteringen?" and the infinitive in "Forkaste endringene?", "Lage ny kode?", and "Hente siste versjon?"; "Koble fra Oda?" reads as either. Which form should questions use?
