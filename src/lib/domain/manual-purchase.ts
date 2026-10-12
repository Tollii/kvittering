import { v, type Infer } from "convex/values";
import { calendarDateValidator } from "./calendar";
import { unclearCategoryId } from "./categories";
import { Ore, oreValidator } from "./ore";
import {
  checkReceipt,
  emptyLine,
  type ReceiptCheck,
  type ReceiptLine,
} from "./receipt";

/** A purchase a person types in, such as a cash purchase or a lost receipt. */
export const manualPurchaseValidator = v.object({
  store: v.string(),
  purchaseDate: calendarDateValidator,
  totalOre: oreValidator,
  lines: v.array(
    v.object({
      name: v.string(),
      amountOre: v.union(oreValidator, v.null()),
    }),
  ),
});

export type ManualPurchase = Infer<typeof manualPurchaseValidator>;

/** The one line of a purchase entered without lines. What was bought stays unknown. */
export const unspecifiedPurchaseName = "Uspesifisert kjøp";

/**
 * The purchase as receipt evidence. Typed names stand in for printed text, so
 * classification and household memory treat them as they treat a receipt's,
 * and the receipt passes the same review rules as a photographed one. A
 * purchase without lines gets one line for the paid amount, because review
 * needs a product line and the products are unknown.
 */
export function manualPurchaseReceipt(purchase: ManualPurchase): ReceiptCheck {
  const store = purchase.store.trim();

  if (!store) return { kind: "invalid", message: "Skriv inn butikken." };

  if (purchase.totalOre <= 0)
    return { kind: "invalid", message: "Betalt beløp må være over null." };

  const typed = purchase.lines.length
    ? purchase.lines
    : [{ name: unspecifiedPurchaseName, amountOre: purchase.totalOre }];

  const lines: ReceiptLine[] = typed.map((line, index) => ({
    ...emptyLine(`manual-${index + 1}`),
    name: line.name.trim(),
    receiptName: line.name.trim(),
    amountOre: line.amountOre,
    // A person typed the name, not the category, so memory may still settle it.
    manual: false,
    categoryId: unclearCategoryId,
  }));

  return checkReceipt({
    physicalStore: null,
    store,
    branch: null,
    purchaseDate: purchase.purchaseDate,
    purchaseTime: null,
    receiptNumber: null,
    currency: "NOK",
    totalOre: purchase.totalOre,
    originalText: [
      `${store}, lagt inn uten kvittering`,
      ...lines.map(
        (line) => `${line.name}  ${Ore.formatInput(line.amountOre ?? null)}`,
      ),
      `Betalt ${Ore.formatInput(purchase.totalOre)}`,
    ].join("\n"),
    lines,
    issues: [],
  });
}
