# Voice and copy

Every string the app writes is Norwegian Bokmål; system controls, such as the Sign in with Apple button, follow the device language. Copy lives in the components that show it; there is no string catalogue. Write it the way the app already speaks: plain, calm, and specific about what happened and what the person can do next.

## Tone

- **Plain and short.** "Uten nett", "Ingen treff", "Prøv igjen". Prefer one clear sentence to an explanation.
- **Calm about errors.** Say what failed and what still holds: "Importen er ikke fullført. Filene venter på nytt forsøk." Do not blame the person or apologise.
- **Honest about uncertainty.** Reports describe household purchases, not consumption, and unknown values stay unknown: "Ukjent", "Dato ukjent", "Summene er foreløpige." Never show a guessed value as fact.
- **No pressure.** Optional work is called optional: "Produktkobling er valgfritt."

## Address

Use **du** for the person using the app: "Alle kvitteringene dine er behandlet", "Dine ulagrede endringer blir fjernet." Use **dere** for the household's shopping: "Se hvor dere handler, og hva dere bruker per butikk", "Hvilket produkt kjøpte dere?" The app never speaks as "vi": there is no team behind the screen, so a sentence names what does the work instead. "Nye rettelser lagres fra nå av", not "Vi lagrer nye rettelser"; "Sammenligningen trenger kjøp fra forrige periode", not "Vi trenger …".

## Mechanics

- **Sentence case** everywhere, including buttons, tab names, and titles. The one all-caps string is the eyebrow "DAGLIGVARER" on the Forbruk hero.
- **Full stops** end sentences in messages, notices, hints, and alert bodies. Titles, buttons, labels, chips, and status lines have none.
- **Ellipsis** is the single character "…" after a space, for work in progress: "Henter …", "Lagrer …", "Sletter kvittering …".
- **Middle dot** " · " separates facts on one line: "23. sep. 2026 · Oslo", "3 kvitteringer · 412,40 kr".
- **Plurals** are written out: "1 kvittering", "2 kvitteringer"; spell "Én" when it starts a sentence: "Én kvittering venter på kontroll".
- **Percent** has a space before the sign: "12 %".

## Numbers and dates

Format through the domain helpers, never by hand, so every screen agrees:

- Money: `Ore.format` ([øre](../../src/lib/domain/ore.ts)) gives Norwegian kroner with a comma decimal and non-breaking spaces, and "Ukjent" for an unknown amount. Amount inputs take the same format; `MoneyField` explains invalid input in Norwegian.
- Dates: `CalendarDate.format` ([calendar](../../src/lib/domain/calendar.ts)) gives "23. sep. 2026" and "Dato ukjent". A month inside a sentence uses `CalendarMonth.format`, "september 2026"; a month that stands alone, as a heading, a menu label, or a menu item, uses `CalendarMonth.title`, "September 2026".
- Time: "kl. 14:32" after the date.

## Patterns

| Situation           | Pattern                                                                                                                                 | Examples                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Button              | Imperative verb, sentence case. Name the object when the screen has several actions.                                                    | "Lagre og godkjenn", "Legg til flere bilder", "Vis flere kvitteringer"                                                                      |
| Navigation button   | "Til" plus the destination.                                                                                                             | "Til innboksen", "Til kvitteringene"                                                                                                        |
| Confirmation alert  | Infinitive question as the title, a body that says what is lost or kept, the imperative verb on the confirm button, "Avbryt" to cancel. | "Slette kvitteringen?" / "Kvitteringen og bildene blir slettet." / "Slett"; "Forkaste endringene?", "Lage ny kode?", "Hente siste versjon?" |
| Discard choice      | Offer staying as the safe option.                                                                                                       | "Forkast" and "Fortsett å redigere"                                                                                                         |
| Failure             | "Kunne ikke" plus the action, then the next step.                                                                                       | "Kunne ikke lagre.", "Kunne ikke godkjenne" / "Prøv igjen."                                                                                 |
| Retry               | "Prøv … igjen".                                                                                                                         | "Prøv igjen", "Prøv importen igjen", "Prøv produktsøk igjen"                                                                                |
| Empty state         | Title says what is missing or what will appear; message says how it fills.                                                              | "Historikken begynner her" / "Lagrede kvitteringer vises her når de er behandlet."                                                          |
| Progress            | Present-tense verb with ellipsis, naming the object.                                                                                    | "Henter kvittering …", "Laster opp …", "Leser på nytt …"                                                                                    |
| Next step           | Title names the open question as a status; message says in one imperative sentence how to settle it, then "Deretter:" the ones after.   | "Betalt beløp mangler" / "Skriv inn beløpet som ble betalt. Deretter: Dato mangler."                                                        |
| Offline             | "Uten nett" notice; queued work says it is waiting.                                                                                     | "Venter på nett"                                                                                                                            |
| Accessibility label | What the control does, not what it looks like.                                                                                          | "Ta bilde av kvitteringen", "Husstanden og innstillinger"                                                                                   |

Show errors through `failureMessage(cause, operation, fallback)` ([failure message](../../src/lib/failure-message.ts)) with a Norwegian fallback, never a caught error's raw message; lint enforces this in screens and features.

## Vocabulary

Use these words for these things, and keep them consistent across screens and notifications.

| Word                      | Meaning                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| Kvitto                    | The app.                                                                                                 |
| kvittering                | A receipt, the main object.                                                                              |
| husstand, husstanden      | The household that shares receipts.                                                                      |
| innboks                   | Receipts that need a person or are still being processed.                                                |
| til kontroll, kontrollere | A receipt that needs review; reviewing it.                                                               |
| godkjenne, godkjent       | Approving the receipt's facts; see [receipt flow](../architecture.md#receipt-flow) for what it confirms. |
| kontrollert               | The status of a reviewed receipt; "Godkjent automatisk" when no person was needed.                       |
| linje                     | A line on a receipt.                                                                                     |
| vare                      | An item as bought.                                                                                       |
| produkt, produktkobling   | A catalogue product, and linking a line to it.                                                           |
| kategori                  | Spending category of a line.                                                                             |
| forbruk                   | Spending in reports. It means purchases, not what was consumed.                                          |
| utelatt                   | A receipt left out of spending ("Utelat fra forbruk").                                                   |
| rettelse                  | A correction the household made, which can teach future suggestions.                                     |
| lese, lesing              | Reading a receipt image: "Leser kvitteringen", "Les bildene på nytt".                                    |
| Oda                       | The grocery service, by name.                                                                            |
