export type ReceiptIssue =
  | {
      code:
        | "category_uncertain"
        | "amount_missing"
        | "name_missing"
        | "store_missing"
        | "no_lines"
        | "duplicate_discount"
        | "positive_discount"
        | "positive_deposit_return"
        | "total_missing"
        | "currency"
        | "date_missing";
    }
  | { code: "amounts_missing"; count: number }
  | { code: "difference"; amountOre: number }
  | { code: "reader_issue"; message: string };

export const categoryUncertainIssue = "category_uncertain";

/** Decode the previous persisted sentence only at the compatibility boundary. */
export function parseReceiptIssue(value: string): ReceiptIssue {
  return value === categoryUncertainIssue || value === "Kategorien er usikker."
    ? { code: "category_uncertain" }
    : { code: "reader_issue", message: value };
}

export const isCategoryUncertain = (value: string) =>
  parseReceiptIssue(value).code === "category_uncertain";

export function receiptIssueText(issue: ReceiptIssue): string {
  switch (issue.code) {
    case "category_uncertain":
      return "Kategorien er usikker.";
    case "amount_missing":
      return "Beløpet mangler.";
    case "name_missing":
      return "Varenavnet mangler.";
    case "store_missing":
      return "Butikken mangler.";
    case "no_lines":
      return "Ingen varer er lest.";
    case "duplicate_discount":
      return "Like rabattlinjer må kontrolleres.";
    case "positive_discount":
      return "En rabatt er positiv.";
    case "positive_deposit_return":
      return "En pantretur er positiv.";
    case "total_missing":
      return "Betalt beløp er ukjent.";
    case "currency":
      return "Valuta må kontrolleres.";
    case "date_missing":
      return "Kjøpsdato er ukjent.";
    case "amounts_missing":
      return `${issue.count} linje(r) mangler beløp.`;
    case "difference":
      return `Avvik mot betalt: ${new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(issue.amountOre / 100)}.`;
    case "reader_issue":
      return issue.message;
  }
}
