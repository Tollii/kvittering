import { Ore } from "./domain/ore";
import { CalendarDate } from "./domain/calendar";
import type { CategoryId } from "./domain/categories";
import {
  emptyLine,
  type ReceiptData,
  type ReceiptLine,
} from "./domain/receipt";

// Sample receipts for tests and the explicitly configured mock receipt reader.

export function batteryFixture(): ReceiptData {
  const product = {
    ...emptyLine("battery"),
    name: "BATTERY REMIX",
    originalText: "BATTERY REMIX 25,90",
    amountOre: Ore.of(2590),
    categoryId: "drinks.soft-drinks",
    manual: false,
  };

  return {
    store: "Eksempelbutikk",
    branch: null,
    purchaseDate: CalendarDate.of(2026, 9, 17),
    purchaseTime: null,
    receiptNumber: null,
    currency: "NOK",
    totalOre: Ore.of(2531),
    originalText: "BATTERY REMIX 25,90\nRABATT -2,59\nPANT 2,00\nBETALT 25,31",
    issues: [],
    lines: [
      product,
      {
        ...emptyLine("discount"),
        kind: "item_discount",
        name: "Produktrabatt",
        originalText: "RABATT -2,59",
        amountOre: Ore.of(-259),
        relatedLineId: "battery",
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("deposit"),
        kind: "deposit",
        name: "Pant",
        originalText: "PANT 2,00",
        amountOre: Ore.of(200),
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
    amountOre: Ore | null,
    categoryId: CategoryId,
    extra: Partial<ReceiptLine> = {},
  ): ReceiptLine => ({
    ...emptyLine(id),
    name,
    originalText: `${name} ${Ore.formatInput(amountOre)}`.trim(),
    amountOre,
    categoryId,
    confidence: 0.9,
    manual: false,
    ...extra,
  });

  return {
    store: "REMA 1000",
    branch: "Kanalveien",
    purchaseDate: CalendarDate.of(2026, 9, 12),
    purchaseTime: "17:42",
    receiptNumber: "4711",
    currency: "NOK",
    totalOre: Ore.of(41980),
    originalText: "",
    issues: [],
    lines: [
      product("milk", "TINE LETTMELK 1L", Ore.of(2390), "dairy.milk"),
      product("bread", "KNEIPP", Ore.of(3990), "bakery.bread"),
      product(
        "chicken",
        "KYLLINGFILET 900G",
        Ore.of(14990),
        "meat-fish.poultry",
        {
          packageSize: 900,
          packageUnit: "g",
        },
      ),
      product("cheez", "CHEEZ DOODLES XL", Ore.of(4290), "snacks.crisps", {
        confidence: 0.4,
        issues: ["Kategorien er usikker."],
      }),
      product("cola", "COCA-COLA10PK BX", Ore.of(9490), "drinks.soft-drinks", {
        packageSize: 10,
        packageUnit: "pk",
      }),
      product("bag", "BÆREPOSE", Ore.of(350), "other-purchases.bags"),
      product("unknown", "KAFFE EVERGOOD", null, "drinks.coffee"),
      {
        ...emptyLine("chicken-discount"),
        kind: "item_discount",
        name: "Rabatt kyllingfilet",
        originalText: "RABATT -30,00",
        amountOre: Ore.of(-3000),
        relatedLineId: "chicken",
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("member-discount"),
        kind: "receipt_discount",
        name: "Æ-rabatt",
        originalText: "Æ RABATT -12,20",
        amountOre: Ore.of(-1220),
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("deposit"),
        kind: "deposit",
        name: "Pant",
        originalText: "PANT 20,00",
        amountOre: Ore.of(2000),
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("deposit-return"),
        kind: "deposit_return",
        name: "Pantretur",
        originalText: "PANTRETUR -43,00",
        amountOre: Ore.of(-4300),
        categoryId: null,
        manual: false,
      },
      {
        ...emptyLine("vat"),
        kind: "vat",
        name: "MVA 15 %",
        originalText: "MVA 15% 40,12",
        amountOre: Ore.of(4012),
        categoryId: null,
        manual: false,
      },
    ],
  };
}
