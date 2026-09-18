import { receiptMonth, type Receipt } from "./insights";
import { spendingLines, type ReceiptLine } from "./receipt";

export type PriceSignal = {
  key: string;
  name: string;
  /** Net unit price paid on this line. */
  currentOre: number;
  /** Median net unit price across the household's other purchases. */
  typicalOre: number;
  /** currentOre / typicalOre. */
  ratio: number;
  observations: number;
  receipt: Receipt;
  line: ReceiptLine;
};

/** Enough history to call a price unusual, and how far off it must be. */
export const priceSignalMinimumObservations = 3;
export const priceSignalThreshold = 0.15;

/** Linked identity only: the same catalog product or the same saved product. */
function identity(line: ReceiptLine) {
  return line.catalogProduct?.key ?? line.productId ?? null;
}

function unitOre(line: ReceiptLine & { netOre: number }) {
  const quantity = line.quantity && line.quantity > 0 ? line.quantity : 1;
  return Math.round(line.netOre / quantity);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Every priced, linked product line in the household, grouped by identity. */
function observations(receipts: Receipt[]) {
  const byKey = new Map<
    string,
    { receiptId: string; unitOre: number; name: string }[]
  >();
  for (const receipt of receipts) {
    if (!receipt.data || receipt.excluded || receipt.data.currency !== "NOK")
      continue;
    for (const line of spendingLines(receipt.data).products) {
      const key = identity(line);
      if (!key || line.netOre <= 0) continue;
      byKey.set(key, [
        ...(byKey.get(key) ?? []),
        {
          receiptId: receipt._id,
          unitOre: unitOre(line),
          name: line.catalogProduct?.name ?? line.productName ?? line.name,
        },
      ]);
    }
  }
  return byKey;
}

/**
 * Lines on `receipt` whose unit price departs from what the household usually
 * pays for the same product on other receipts.
 */
export function priceSignals(
  receipts: Receipt[],
  receipt: Receipt,
): Map<string, PriceSignal> {
  const result = new Map<string, PriceSignal>();
  if (!receipt.data) return result;
  const history = observations(receipts);
  for (const line of spendingLines(receipt.data).products) {
    const key = identity(line);
    if (!key || line.netOre <= 0) continue;
    const others = (history.get(key) ?? []).filter(
      (item) => item.receiptId !== receipt._id,
    );
    if (others.length < priceSignalMinimumObservations) continue;
    const typicalOre = median(others.map((item) => item.unitOre));
    if (typicalOre <= 0) continue;
    const currentOre = unitOre(line);
    const ratio = currentOre / typicalOre;
    if (Math.abs(ratio - 1) < priceSignalThreshold) continue;
    result.set(line.id, {
      key,
      name: line.catalogProduct?.name ?? line.productName ?? line.name,
      currentOre,
      typicalOre,
      ratio,
      observations: others.length,
      receipt,
      line,
    });
  }
  return result;
}

/** All unusual prices paid in a month, most expensive surprises first. */
export function monthPriceSignals(receipts: Receipt[], month: string) {
  const signals: PriceSignal[] = [];
  for (const receipt of receipts) {
    if (receiptMonth(receipt) !== month) continue;
    signals.push(...priceSignals(receipts, receipt).values());
  }
  return signals.sort(
    (a, b) =>
      (b.currentOre - b.typicalOre) * (b.line.quantity ?? 1) -
      (a.currentOre - a.typicalOre) * (a.line.quantity ?? 1),
  );
}

export function priceSignalLabel(signal: PriceSignal) {
  const percent = Math.round(Math.abs(signal.ratio - 1) * 100);
  return signal.ratio > 1
    ? `+${percent} % vs vanlig`
    : `−${percent} % vs vanlig`;
}
