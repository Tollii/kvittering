import { expect, it } from "vitest";
import { date } from "../testing/calendar";
import { receiptFixture } from "../testing/receipts";
import { Ore } from "./ore";
import { emptyLine, type ReceiptData, type ReceiptLine } from "./receipt";
import { exportCsv, receiptExport } from "./receipt-export";

function line(id: string, overrides: Partial<ReceiptLine>): ReceiptLine {
  return { ...emptyLine(id), ...overrides };
}

function data(overrides: Partial<ReceiptData>): ReceiptData {
  return {
    store: "KIWI",
    branch: null,
    purchaseDate: date("2026-10-03"),
    purchaseTime: null,
    receiptNumber: null,
    currency: "NOK",
    totalOre: null,
    originalText: "",
    lines: [],
    issues: [],
    ...overrides,
  };
}

const rows = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

it("writes one row per counted line with unknown values left empty", () => {
  const receipt = receiptFixture({
    _id: "r1",
    status: "needs_review",
    data: data({
      lines: [
        line("milk", {
          name: "Lettmelk",
          categoryId: "dairy.milk",
          quantity: 2,
          unit: "stk",
          amountOre: Ore.of(4590),
        }),
        line("discount", {
          kind: "item_discount",
          name: "Rabatt",
          relatedLineId: "milk",
          amountOre: Ore.of(-1000),
        }),
        line("bag", { name: "Pose", quantity: 0.5, amountOre: null }),
        line("sum", { kind: "summary", name: "Sum", amountOre: Ore.of(3590) }),
        line("vat", { kind: "vat", name: "MVA 15 %", amountOre: Ore.of(468) }),
      ],
    }),
  });

  const csv = exportCsv(receiptExport([receipt]));

  expect(csv.startsWith("﻿")).toBe(true);
  expect(rows(csv)).toEqual([
    "Dato;Butikk;Vare;Linjetype;Kategori;Kategorigruppe;Antall;Enhet;Beløp;Valuta;Status;Kvittering",
    "2026-10-03;KIWI;Lettmelk;Vare;Melk;Meieri og alternativer;2;stk;45,90;NOK;Til kontroll;r1",
    "2026-10-03;KIWI;Rabatt;Varerabatt;;;;;-10,00;NOK;Til kontroll;r1",
    "2026-10-03;KIWI;Pose;Vare;Ukjent vare;Uavklart;0,5;;;NOK;Til kontroll;r1",
    "",
  ]);
});

it("exports the receipts Forbruk counts, oldest first and undated before dated", () => {
  const product = [line("a", { name: "Vare", amountOre: Ore.of(100) })];

  const receipts = [
    receiptFixture({
      _id: "late",
      data: data({ purchaseDate: date("2026-10-05"), lines: product }),
    }),
    receiptFixture({
      _id: "early",
      _creationTime: 2,
      data: data({ purchaseDate: date("2026-10-01"), lines: product }),
    }),
    receiptFixture({
      _id: "undated",
      data: data({ purchaseDate: null, lines: product }),
    }),
    receiptFixture({
      _id: "excluded",
      excluded: true,
      data: data({ lines: product }),
    }),
    receiptFixture({
      _id: "rereading",
      _creationTime: 1,
      status: "processing",
      data: data({ purchaseDate: date("2026-10-01"), lines: product }),
    }),
    receiptFixture({ _id: "failed", status: "failed" }),
  ];

  const result = receiptExport(receipts);

  expect(result.receipts).toBe(4);
  expect(
    rows(exportCsv(result))
      .slice(1, -1)
      .map((row) => row.split(";").slice(-2).reverse().join(";")),
  ).toEqual([
    "undated;Kontrollert",
    "rereading;Leses på nytt",
    "early;Kontrollert",
    "late;Kontrollert",
  ]);
});

it("keeps names with separators, quotes and formula characters as plain text", () => {
  const receipt = receiptFixture({
    _id: "r1",
    data: data({
      store: 'Bakeriet "Brød; og sånn"',
      lines: [
        line("formula", { name: "=HYPERLINK(1)", amountOre: Ore.of(-250) }),
        line("dash", { name: "-50 % rabatt\npå alt", amountOre: Ore.of(100) }),
      ],
    }),
  });

  expect(rows(exportCsv(receiptExport([receipt]))).slice(1, 3)).toEqual([
    `2026-10-03;"Bakeriet ""Brød; og sånn""";'=HYPERLINK(1);Vare;Ukjent vare;Uavklart;;;-2,50;NOK;Kontrollert;r1`,
    `2026-10-03;"Bakeriet ""Brød; og sånn""";"'-50 % rabatt\npå alt";Vare;Ukjent vare;Uavklart;;;1,00;NOK;Kontrollert;r1`,
  ]);
});

it("gives each line its own amount, so a receipt's rows add up to the paid total", () => {
  const receipt = receiptFixture({
    data: data({
      totalOre: Ore.of(10_150),
      lines: [
        line("beer", { name: "Øl", amountOre: Ore.of(9000) }),
        line("deposit", {
          kind: "deposit",
          name: "Pant",
          amountOre: Ore.of(300),
        }),
        line("return", {
          kind: "deposit_return",
          name: "Pantretur",
          amountOre: Ore.of(-200),
        }),
        line("member", {
          kind: "receipt_discount",
          name: "Medlemsrabatt",
          amountOre: Ore.of(-450),
        }),
        line("fee", {
          kind: "adjustment",
          name: "Pose",
          amountOre: Ore.of(1500),
        }),
        line("sum", {
          kind: "summary",
          name: "Totalt",
          amountOre: Ore.of(10_150),
        }),
      ],
    }),
  });

  const amounts = rows(exportCsv(receiptExport([receipt])))
    .slice(1, -1)
    .map((row) => Number(row.split(";")[8]?.replace(",", ".")));

  expect(amounts).toEqual([90, 3, -2, -4.5, 15]);
  expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(101.5);
});
