import { CalendarDate } from "./calendar";
import { categoryOf } from "./categories";
import type { Receipt } from "./insights";
import { Ore } from "./ore";
import { isTotalsLine, lineLabels, type ReceiptLine } from "./receipt";
import {
  extractedReceipt,
  hasReceiptBeenRead,
  type ExtractedReceipt,
} from "./receipt-state";

const header = [
  "Dato",
  "Butikk",
  "Vare",
  "Linjetype",
  "Kategori",
  "Kategorigruppe",
  "Antall",
  "Enhet",
  "Beløp",
  "Valuta",
  "Status",
  "Kvittering",
];

type Cell = Readonly<{ text: string; kind: "text" | "number" }>;

const text = (value: string | null | undefined): Cell => ({
  text: value ?? "",
  kind: "text",
});

const number = (value: string): Cell => ({ text: value, kind: "number" });

export type ReceiptExport = Readonly<{
  receipts: number;
  rows: readonly (readonly Cell[])[];
}>;

/**
 * One row per printed line of every read receipt that counts as spending,
 * oldest first. Totals and VAT lines restate the receipt and are left out, so
 * the amounts of a receipt's rows add up to what its lines say was paid.
 * Unknown values stay empty rather than becoming zero.
 */
export function receiptExport(receipts: readonly Receipt[]): ReceiptExport {
  const included = receipts
    .flatMap((row) => {
      const receipt = extractedReceipt(row);

      return receipt && !receipt.excluded && hasReceiptBeenRead(receipt.status)
        ? [receipt]
        : [];
    })
    .sort(
      (left, right) =>
        CalendarDate.compare(left.data.purchaseDate, right.data.purchaseDate) ||
        left._creationTime - right._creationTime,
    );

  return {
    receipts: included.length,
    rows: included.flatMap((receipt) =>
      receipt.data.lines
        .filter((line) => !isTotalsLine(line.kind))
        .map((line) => lineRow(receipt, line)),
    ),
  };
}

function lineRow(receipt: ExtractedReceipt, line: ReceiptLine): Cell[] {
  const { data } = receipt;
  const category = line.kind === "product" ? categoryOf(line.categoryId) : null;

  return [
    text(data.purchaseDate),
    text(data.store),
    text(line.name),
    text(lineLabels[line.kind]),
    text(category?.name),
    text(category?.groupName),
    number(line.quantity === null ? "" : decimal(line.quantity)),
    text(line.unit),
    number(Ore.formatInput(line.amountOre)),
    text(data.currency),
    text(receipt.status === "reviewed" ? "Kontrollert" : "Til kontroll"),
    text(receipt._id),
  ];
}

const decimal = (value: number) => String(value).replace(".", ",");

/**
 * Semicolons and decimal commas, as Norwegian Excel expects; a byte order mark
 * so Excel reads æøå as UTF-8. Numbers and Google Sheets read the same file.
 */
export function exportCsv({ rows }: ReceiptExport): string {
  return `﻿${[header.map(text), ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n")}\r\n`;
}

function csvCell(cell: Cell): string {
  // A spreadsheet runs text that starts like a formula; a leading apostrophe
  // keeps a printed name such as "=SUM(...)" as text.
  const value =
    cell.kind === "text" && /^[=+\-@\t\r]/.test(cell.text)
      ? `'${cell.text}`
      : cell.text;

  return /[";\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
