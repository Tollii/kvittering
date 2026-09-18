# Category analysis — 19 September 2026

The category changes are deployed to the development backend `agile-falcon-148`.

## Category decisions

- Soda and energy drinks share **Brus** (`drinks.soft-drinks`).
- Keep the existing protein categories, including pork, beef, poultry, lamb, fish and seafood.
- Add **Ferske ferdigretter og varmmat** for fresh ready-to-eat meals from grocery counters, including fresh pizza.
- Keep filled baguettes, sandwiches and wraps together. Keep prepared meal salads separate from plain lettuce and vegetables. Frozen pizza and packaged chilled meals retain their categories.
- Add **Vitaminer og kosttilskudd** under personal care, including melatonin. These purchases remain part of spending totals, as do cleaning products and other non-food groceries.
- Keep the remaining category detail until there is more correction evidence.

No existing receipts were changed or deleted. Andreas will delete the old test entries. Saved memories that refer to a removed category are ignored, so they cannot restore that category on a new receipt.

## Observed correction history

The read-only development snapshot contained 9 receipts, 48 product lines, 11 revision snapshots, 4 explicit aliases and no category-memory records. Counts describe saved test data, not distinct shopping trips.

One category change was visible between saved revisions: **JORDAN INDIVIDUAL** changed from `fallback.non-food` to `personal-care.oral`, with the resulting line marked manual. The explicit aliases covered two energy drinks and two descriptions of Stratos chocolate.

Four current lines had category uncertainty flags:

| Product | Saved category | Interpretation to test |
| --- | --- | --- |
| Gulrot Snack 24X150 Gr R No | Potetgull | Snack carrots remain vegetables |
| Sandwich French Herbs 30g Wasa | Prepared sandwiches | Packaged crispbread sandwich |
| Sandwich Cheese&gressløk 37g Wasa | Prepared sandwiches | Packaged crispbread sandwich |
| Dream Yoghurtis Frappe Uten 450ml | Yoghurt | Yoghurt ice cream |

These are diagnostic examples, not additional confirmed user corrections. The classifier descriptions now explain these boundaries. They also distinguish plain Crispi lettuce from prepared meal salads.

This sample is too small for a category error rate or a ranked list of unreliable categories. Revision snapshots do not record every automatic category change or identify its cause. Category memory stores the current count, not a history of resets. No historical reset rate can be recovered from that table.

## Live classifier check

The existing `providers:classify` action evaluated the 12 product names below with `jev-latest`. Each input contained only the product name. All selected categories matched the expected categories. The final batch took 974 ms inside the action; this excludes CLI and network overhead.

This is a focused check of revised rules, including examples used to write those rules. It is not a held-out accuracy measurement. Choice confidence measures concentration among the available categories, not a measured probability that the application is correct.

| Input name | Expected and returned category | Choice confidence |
| --- | --- | --- |
| BATTERY REMIX | `drinks.soft-drinks` | 0.96 |
| COCA-COLA10PK BX | `drinks.soft-drinks` | 1.00 |
| TACOBAGUETTE HUSETS | `convenience.sandwiches` | 1.00 |
| Nystekt pizza fra varmdisken | `convenience.fresh-meals` | 1.00 |
| Ferdig kyllingsalat med pasta | `convenience.salads` | 0.99 |
| BIGONE BBQ CHICKEN | `convenience.frozen-pizza` | 0.97 |
| Melatonin 1 mg | `personal-care.supplements` | 1.00 |
| JORDAN INDIVIDUAL | `personal-care.oral` | 0.92 |
| Gulrot Snack 24X150 Gr R No | `produce.vegetables` | 0.96 |
| Sandwich French Herbs 30g Wasa | `bakery.crispbread` | 0.99 |
| Dream Yoghurtis Frappe Uten 450ml | `snacks.ice-cream` | 0.83 |
| SALAT CRISPI | `produce.vegetables` | 0.90 |

The first check returned BigOne as a sandwich. Clearer frozen-pizza criteria corrected that result on the second check. No confidence thresholds were changed.

## Validation

Type checking, lint without cache, and all 120 tests passed. Tests cover the existing two-approval learning path and the new rejection of removed categories. Existing manual-override tests still use different categories for the automatic and manual choices.
