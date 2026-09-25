import { Ore, oreValidator } from "./ore";
import type { ClassificationEvidence } from "./classification";
import { productReferenceValidator } from "./product-reference";
import { parse as parseValue } from "convex-helpers/validators";
import { receiptIssueText, type ReceiptIssue } from "./receipt-issues";
import { v, type Infer } from "convex/values";
import { isCategoryId, parseCategoryId, unclearCategoryId } from "./categories";
import { CalendarDate, calendarDateValidator } from "./calendar";
import {
  catalogIdentityValidator,
  physicalStoreValidator,
} from "../catalog/model";

const nullableString = v.union(v.string(), v.null());

const nullableNumber = v.union(v.number(), v.null());

const nullableOre = v.union(oreValidator, v.null());

export const lineKinds = [
  "product",
  "item_discount",
  "receipt_discount",
  "deposit",
  "deposit_return",
  "adjustment",
  "summary",
  "vat",
] as const;

export type LineKind = (typeof lineKinds)[number];

/** Summary and VAT lines restate totals printed on the receipt; they are not purchases. */
export function isTotalsLine(kind: LineKind): boolean {
  return kind === "summary" || kind === "vat";
}

export function isDiscountLine(kind: LineKind): boolean {
  return kind === "item_discount" || kind === "receipt_discount";
}

export const lineValidator = v.object({
  id: v.string(),
  kind: v.union(...lineKinds.map((kind) => v.literal(kind))),
  originalText: v.string(),
  sourceImages: v.array(v.number()).optional(),
  name: v.string(),
  amountOre: nullableOre,
  quantity: nullableNumber,
  unit: nullableString,
  unitPriceOre: nullableOre,
  packageSize: nullableNumber,
  packageUnit: nullableString,
  brand: nullableString,
  attributes: v.array(v.string()),
  relatedLineId: nullableString,
  categoryId: nullableString,
  confidence: nullableNumber,
  tags: v.array(v.string()),
  issues: v.array(v.string()),
  manual: v.boolean(),
  productKey: nullableString,
  categoryAliasKey: nullableString.optional(),
  productReference: productReferenceValidator.optional(),
  receiptName: v.string().optional(),
  productId: v.union(v.id("products"), v.null()).optional(),
  productName: v.string().optional(),
  productMatchManual: v.boolean().optional(),
  catalogProduct: v.union(catalogIdentityValidator, v.null()).optional(),
});

export const receiptDataValidator = v.object({
  physicalStore: v.union(physicalStoreValidator, v.null()).optional(),
  physicalStoreManual: v.boolean().optional(),
  store: nullableString,
  branch: nullableString,
  purchaseDate: v.union(calendarDateValidator, v.null()),
  purchaseTime: nullableString,
  receiptNumber: nullableString,
  currency: nullableString,
  totalOre: nullableOre,
  originalText: v.string(),
  lines: v.array(lineValidator),
  issues: v.array(v.string()),
});

export type ReceiptLine = Infer<typeof lineValidator>;

export type ReceiptData = Infer<typeof receiptDataValidator>;

export function emptyLine(id: string = crypto.randomUUID()): ReceiptLine {
  return {
    id,
    kind: "product",
    originalText: "",
    name: "",
    amountOre: null,
    quantity: null,
    unit: null,
    unitPriceOre: null,
    packageSize: null,
    packageUnit: null,
    brand: null,
    attributes: [],
    relatedLineId: null,
    categoryId: unclearCategoryId,
    confidence: null,
    tags: [],
    issues: [],
    manual: true,
    productKey: null,
  };
}

export const normalizeAlias = (text: string) =>
  text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("nb-NO");

export function aliasKey(data: ReceiptData, line: ReceiptLine): string | null {
  if (!data.store || !line.name.trim()) return null;

  return JSON.stringify([
    normalizeAlias(data.store),
    normalizeAlias(line.name),
    line.brand ? normalizeAlias(line.brand) : null,
    line.packageSize,
    line.packageUnit,
    line.unit,
  ]);
}

declare const parsedReceipt: unique symbol;

export type ParsedReceipt = ReceiptData & { readonly [parsedReceipt]: true };

export type ReceiptParseOutcome =
  | { kind: "parsed"; receipt: ParsedReceipt }
  | { kind: "rejected"; issue: { code: "invalid_receipt"; message: string } };

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary parser validates external input before returning a domain value.
export function parseReceipt(input: unknown): ReceiptParseOutcome {
  let data: ReceiptData;

  try {
    data = structuredClone(parseValue(receiptDataValidator, input));
  } catch (cause) {
    return rejectedReceipt(
      cause instanceof Error ? cause.message : "Ugyldig kvittering.",
    );
  }

  // Older receipts may store category ids that have since been merged.
  for (const line of data.lines)
    line.categoryId = parseCategoryId(line.categoryId) ?? line.categoryId;

  const checked = checkReceipt(data);

  return checked.kind === "valid"
    ? { kind: "parsed", receipt: checked.receipt }
    : rejectedReceipt(checked.message);
}

const rejectedReceipt = (message: string): ReceiptParseOutcome => ({
  kind: "rejected",
  issue: { code: "invalid_receipt", message },
});

export type ReceiptCheck =
  | { kind: "valid"; receipt: ParsedReceipt }
  | { kind: "invalid"; message: string };

/** Check the domain invariants of well-formed receipt data. */
export function checkReceipt(data: ReceiptData): ReceiptCheck {
  const invalid = (message: string) => ({ kind: "invalid", message }) as const;

  if (data.lines.length > 300 || data.originalText.length > 60000)
    return invalid("Kvitteringen er for stor. Del den opp.");
  const ids = new Set<string>();

  for (const line of data.lines) {
    if (ids.has(line.id)) return invalid("Varelinjene må ha ulike ID-er.");
    ids.add(line.id);

    for (const value of [line.amountOre, line.unitPriceOre])
      if (
        value !== null &&
        (!Number.isSafeInteger(value) || Math.abs(value) > 100_000_000)
      )
        return invalid("Beløp må være hele øre.");

    for (const value of [line.quantity, line.packageSize])
      if (value !== null && (!Number.isFinite(value) || value <= 0))
        return invalid("Mengde må være større enn null.");

    if (line.categoryId && !isCategoryId(line.categoryId))
      return invalid("Ukjent kategori.");

    if (
      line.name.length > 500 ||
      line.originalText.length > 1500 ||
      line.tags.length > 10
    )
      return invalid("Varelinjen er for lang.");
  }

  if (
    data.totalOre !== null &&
    (!Number.isSafeInteger(data.totalOre) ||
      Math.abs(data.totalOre) > 100_000_000)
  )
    return invalid("Totalen må være hele øre.");

  if (data.purchaseDate && !CalendarDate.parse(data.purchaseDate))
    return invalid("Ugyldig dato.");

  // SAFETY: The checks above establish all ParsedReceipt domain invariants.
  return { kind: "valid", receipt: data as ParsedReceipt };
}

/** For background steps where invalid data is a failure of that step. */
export function validateReceipt(data: ReceiptData): ParsedReceipt {
  const checked = checkReceipt(data);

  if (checked.kind === "invalid") throw new Error(checked.message);

  return checked.receipt;
}

export function reconcile(data: ReceiptData) {
  const reviewIssues: ReceiptIssue[] = [];
  const discountsSeen = new Set<string>();

  let products = Ore.zero,
    discounts = Ore.zero,
    deposits = Ore.zero,
    returns = Ore.zero,
    adjustments = Ore.zero,
    unknown = 0;

  for (const line of data.lines) {
    if (isTotalsLine(line.kind)) continue;

    if (line.amountOre === null) {
      unknown++;
      continue;
    }

    if (line.kind === "product") products = Ore.add(products, line.amountOre);

    if (isDiscountLine(line.kind)) {
      const key = JSON.stringify([
        line.kind,
        line.name,
        line.amountOre,
        line.relatedLineId,
      ]);

      if (discountsSeen.has(key))
        reviewIssues.push({ code: "duplicate_discount" });
      discountsSeen.add(key);
      discounts = Ore.add(discounts, line.amountOre);

      if (line.amountOre > 0) reviewIssues.push({ code: "positive_discount" });
    }

    if (line.kind === "deposit") deposits = Ore.add(deposits, line.amountOre);

    if (line.kind === "deposit_return") {
      returns = Ore.add(returns, line.amountOre);

      if (line.amountOre > 0)
        reviewIssues.push({ code: "positive_deposit_return" });
    }

    if (line.kind === "adjustment")
      adjustments = Ore.add(adjustments, line.amountOre);
  }

  const calculated = Ore.sum([
    products,
    discounts,
    deposits,
    returns,
    adjustments,
  ]);

  if (unknown) reviewIssues.push({ code: "amounts_missing", count: unknown });

  if (data.totalOre === null) reviewIssues.push({ code: "total_missing" });

  if (data.currency !== "NOK") reviewIssues.push({ code: "currency" });

  if (!data.purchaseDate) reviewIssues.push({ code: "date_missing" });

  const difference =
    data.totalOre === null ? null : Ore.subtract(calculated, data.totalOre);

  if (difference !== null && difference !== 0)
    reviewIssues.push({ code: "difference", amountOre: difference });

  return {
    products,
    discounts,
    deposits,
    returns,
    adjustments,
    productSpending: Ore.sum([products, discounts, adjustments]),
    calculated,
    difference,
    unknown,
    reviewIssues,
    issues: reviewIssues.map(receiptIssueText),
  };
}

/** Allocate receipt discounts in whole øre. Keep unlinked adjustments visible. */
export function spendingLines(data: ReceiptData) {
  const products = data.lines
    .filter((line) => line.kind === "product")
    .map((line) => ({ ...line, netOre: line.amountOre ?? Ore.zero }));

  let unallocated = Ore.zero;

  for (const line of data.lines) {
    const amount = line.amountOre ?? Ore.zero;

    if (line.kind === "item_discount") {
      const product = products.find(
        (product) => product.id === line.relatedLineId,
      );

      if (product) product.netOre = Ore.add(product.netOre, amount);
      else unallocated = Ore.add(unallocated, amount);
    }

    if (line.kind === "adjustment") unallocated = Ore.add(unallocated, amount);
  }

  const discount = Ore.sum(
    data.lines
      .filter((line) => line.kind === "receipt_discount")
      .map((line) => line.amountOre ?? Ore.zero),
  );

  const basis = Ore.sum(
    products.map((line) => Ore.of(Math.max(0, line.netOre))),
  );

  let assigned = Ore.zero;
  products.forEach((line, index) => {
    const share =
      basis > 0
        ? index === products.length - 1
          ? Ore.subtract(discount, assigned)
          : Ore.of(
              Math.trunc(
                Ore.ratio(Ore.scale(discount, Math.max(0, line.netOre)), basis),
              ),
            )
        : Ore.zero;

    assigned = Ore.add(assigned, share);
    line.netOre = Ore.add(line.netOre, share);
  });
  unallocated = Ore.add(unallocated, Ore.subtract(discount, assigned));

  return { products, unallocated };
}

/** Send only product evidence to the classifier, including a linked offer's product description. */
export function classificationInputs(
  data: ReceiptData,
): { id: string; evidence: ClassificationEvidence }[] {
  return data.lines
    .filter(
      (line) =>
        line.kind === "product" && !(line.categoryAliasKey ?? line.productKey),
    )
    .map((line) => {
      const evidence: ClassificationEvidence = {
        name: line.name,
        relatedProductDescriptions: data.lines.flatMap((other) =>
          other.relatedLineId === line.id && other.kind === "item_discount"
            ? [other.name.replace(/(?<![\d.,])\d+(?:[.,]\d+)?\s*%/g, "").trim()]
            : [],
        ),
      };

      if (line.brand !== null) evidence.brand = line.brand;

      if (line.packageSize !== null) evidence.packageSize = line.packageSize;

      if (line.packageUnit !== null) evidence.packageUnit = line.packageUnit;

      if (line.attributes.length) evidence.attributes = line.attributes;

      return { id: line.id, evidence };
    });
}
