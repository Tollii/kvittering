import type { ClassificationEvidence } from "./classification";
import { productReferenceValidator } from "./product-reference";
import { parse as parseValue } from "convex-helpers/validators";
import { receiptIssueText, type ReceiptIssue } from "./receipt-issues";
import { v, type Infer } from "convex/values";
import { categoryById } from "./categories";
import {
  catalogIdentityValidator,
  physicalStoreValidator,
} from "../catalog/model";

const nullableString = v.union(v.string(), v.null());

const nullableNumber = v.union(v.number(), v.null());

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

export const lineValidator = v.object({
  id: v.string(),
  kind: v.union(...lineKinds.map((kind) => v.literal(kind))),
  originalText: v.string(),
  sourceImages: v.array(v.number()).optional(),
  name: v.string(),
  amountOre: nullableNumber,
  quantity: nullableNumber,
  unit: nullableString,
  unitPriceOre: nullableNumber,
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
  purchaseDate: nullableString,
  purchaseTime: nullableString,
  receiptNumber: nullableString,
  currency: nullableString,
  totalOre: nullableNumber,
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
    categoryId: "fallback.unclear",
    confidence: null,
    tags: [],
    issues: [],
    manual: true,
    productKey: null,
  };
}

export type MoneyInput =
  { kind: "amount"; ore: number | null } | { kind: "invalid"; message: string };

/** Read typed kroner. An empty field is an unknown amount, not zero. */
export function parseOre(text: string): MoneyInput {
  const value = text
    .trim()
    .replaceAll(/\s/g, "")
    .replace("−", "-")
    .replace(",", ".");

  if (!value) return { kind: "amount", ore: null };

  if (!/^-?\d+(\.\d{1,2})?$/.test(value))
    return {
      kind: "invalid",
      message: "Bruk et beløp med høyst to desimaler.",
    };
  const [whole, fraction = ""] = value.replace("-", "").split(".");

  const result =
    (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) *
    (value.startsWith("-") ? -1 : 1);

  if (!Number.isSafeInteger(result) || Math.abs(result) > 100_000_000)
    return { kind: "invalid", message: "Beløpet er for stort." };

  return { kind: "amount", ore: result };
}

export const formatMoney = (ore: number | null) =>
  ore === null
    ? "Ukjent"
    : new Intl.NumberFormat("nb-NO", {
        style: "currency",
        currency: "NOK",
      }).format(ore / 100);

export const moneyInput = (ore: number | null) =>
  ore === null ? "" : (ore / 100).toFixed(2).replace(".", ",");

export const osloDate = (time = Date.now()) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);

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

  // Older receipts use a separate category for energy drinks, now part of soft drinks.
  for (const line of data.lines)
    if (line.categoryId === "drinks.energy-drinks")
      line.categoryId = "drinks.soft-drinks";

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

    if (line.categoryId && !categoryById.has(line.categoryId))
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

  if (data.purchaseDate && !isCalendarDate(data.purchaseDate))
    return invalid("Ugyldig dato.");

  // SAFETY: The checks above establish all ParsedReceipt domain invariants.
  return { kind: "valid", receipt: data as ParsedReceipt };
}

/** A real calendar date in YYYY-MM-DD form, such as 2026-02-28 but not 2026-02-30. */
function isCalendarDate(value: string) {
  const date = new Date(value);

  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
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

  let products = 0,
    discounts = 0,
    deposits = 0,
    returns = 0,
    adjustments = 0,
    unknown = 0;

  for (const line of data.lines) {
    if (line.kind === "summary" || line.kind === "vat") continue;

    if (line.amountOre === null) {
      unknown++;
      continue;
    }

    if (line.kind === "product") products += line.amountOre;

    if (line.kind === "item_discount" || line.kind === "receipt_discount") {
      const key = JSON.stringify([
        line.kind,
        line.name,
        line.amountOre,
        line.relatedLineId,
      ]);

      if (discountsSeen.has(key))
        reviewIssues.push({ code: "duplicate_discount" });
      discountsSeen.add(key);
      discounts += line.amountOre;

      if (line.amountOre > 0) reviewIssues.push({ code: "positive_discount" });
    }

    if (line.kind === "deposit") deposits += line.amountOre;

    if (line.kind === "deposit_return") {
      returns += line.amountOre;

      if (line.amountOre > 0)
        reviewIssues.push({ code: "positive_deposit_return" });
    }

    if (line.kind === "adjustment") adjustments += line.amountOre;
  }

  const calculated = products + discounts + deposits + returns + adjustments;

  if (unknown) reviewIssues.push({ code: "amounts_missing", count: unknown });

  if (data.totalOre === null) reviewIssues.push({ code: "total_missing" });

  if (data.currency !== "NOK") reviewIssues.push({ code: "currency" });

  if (!data.purchaseDate) reviewIssues.push({ code: "date_missing" });
  const difference = data.totalOre === null ? null : calculated - data.totalOre;

  if (difference !== null && difference !== 0)
    reviewIssues.push({ code: "difference", amountOre: difference });

  return {
    products,
    discounts,
    deposits,
    returns,
    adjustments,
    productSpending: products + discounts + adjustments,
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
    .map((line) => ({ ...line, netOre: line.amountOre ?? 0 }));

  let unallocated = 0;

  for (const line of data.lines) {
    if (line.kind === "item_discount") {
      const product = products.find(
        (product) => product.id === line.relatedLineId,
      );

      if (product) product.netOre += line.amountOre ?? 0;
      else unallocated += line.amountOre ?? 0;
    }

    if (line.kind === "adjustment") unallocated += line.amountOre ?? 0;
  }

  const discount = data.lines
    .filter((line) => line.kind === "receipt_discount")
    .reduce((sum, line) => sum + (line.amountOre ?? 0), 0);

  const basis = products.reduce(
    (sum, line) => sum + Math.max(0, line.netOre),
    0,
  );

  let assigned = 0;
  products.forEach((line, index) => {
    const share =
      basis > 0
        ? index === products.length - 1
          ? discount - assigned
          : Math.trunc((discount * Math.max(0, line.netOre)) / basis)
        : 0;

    assigned += share;
    line.netOre += share;
  });
  unallocated += discount - assigned;

  return { products, unallocated };
}

export function batteryFixture(): ReceiptData {
  const product = {
    ...emptyLine("battery"),
    name: "BATTERY REMIX",
    originalText: "BATTERY REMIX 25,90",
    amountOre: 2590,
    categoryId: "drinks.soft-drinks",
    manual: false,
  };

  return {
    store: "Eksempelbutikk",
    branch: null,
    purchaseDate: "2026-09-17",
    purchaseTime: null,
    receiptNumber: null,
    currency: "NOK",
    totalOre: 2531,
    originalText: "BATTERY REMIX 25,90\nRABATT -2,59\nPANT 2,00\nBETALT 25,31",
    issues: [],
    lines: [
      product,
      {
        ...emptyLine("discount"),
        kind: "item_discount",
        name: "Produktrabatt",
        originalText: "RABATT -2,59",
        amountOre: -259,
        relatedLineId: "battery",
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("deposit"),
        kind: "deposit",
        name: "Pant",
        originalText: "PANT 2,00",
        amountOre: 200,
        categoryId: null,
        manual: false,
      },
    ],
  };
}

/**
 * A weekly shop as the reader typically returns it: several products, one
 * uncertain category, an item discount tied to a product, a receipt-level
 * discount, a deposit and its return, and an unread amount on one line.
 */
export function weeklyShopFixture(): ReceiptData {
  const product = (
    id: string,
    name: string,
    amountOre: number | null,
    categoryId: string,
    extra: Partial<ReceiptLine> = {},
  ): ReceiptLine => ({
    ...emptyLine(id),
    name,
    originalText:
      `${name} ${amountOre === null ? "" : (amountOre / 100).toFixed(2).replace(".", ",")}`.trim(),
    amountOre,
    categoryId,
    confidence: 0.9,
    manual: false,
    ...extra,
  });

  return {
    store: "REMA 1000",
    branch: "Kanalveien",
    purchaseDate: "2026-09-12",
    purchaseTime: "17:42",
    receiptNumber: "4711",
    currency: "NOK",
    totalOre: 41980,
    originalText: "",
    issues: [],
    lines: [
      product("milk", "TINE LETTMELK 1L", 2390, "dairy.milk"),
      product("bread", "KNEIPP", 3990, "bakery.bread"),
      product("chicken", "KYLLINGFILET 900G", 14990, "meat-fish.poultry", {
        packageSize: 900,
        packageUnit: "g",
      }),
      product("cheez", "CHEEZ DOODLES XL", 4290, "snacks.crisps", {
        confidence: 0.4,
        issues: ["Kategorien er usikker."],
      }),
      product("cola", "COCA-COLA10PK BX", 9490, "drinks.soft-drinks", {
        packageSize: 10,
        packageUnit: "pk",
      }),
      product("bag", "BÆREPOSE", 350, "other-purchases.bags"),
      product("unknown", "KAFFE EVERGOOD", null, "drinks.coffee"),
      {
        ...emptyLine("chicken-discount"),
        kind: "item_discount",
        name: "Rabatt kyllingfilet",
        originalText: "RABATT -30,00",
        amountOre: -3000,
        relatedLineId: "chicken",
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("member-discount"),
        kind: "receipt_discount",
        name: "Æ-rabatt",
        originalText: "Æ RABATT -12,20",
        amountOre: -1220,
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("deposit"),
        kind: "deposit",
        name: "Pant",
        originalText: "PANT 20,00",
        amountOre: 2000,
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("deposit-return"),
        kind: "deposit_return",
        name: "Pantretur",
        originalText: "PANTRETUR -43,00",
        amountOre: -4300,
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("vat"),
        kind: "vat",
        name: "MVA 15 %",
        originalText: "MVA 15% 40,12",
        amountOre: 4012,
        categoryId: null,
        manual: false,
      },
    ],
  };
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
