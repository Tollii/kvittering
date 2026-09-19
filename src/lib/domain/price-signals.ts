import { productIdentityKey } from "./product-reference";
import { receiptMonth, type Receipt } from "./insights";
import { type ReceiptLine } from "./receipt";
import {
  preparePurchases,
  comparisonPurchasePolicy,
  type PreparedPurchase,
} from "./purchase-projection";
import type { PurchaseQuantity } from "./product-families";

export type PriceSignal = {
  key: string;
  basis: keyof PurchaseQuantity;
  quantity: number;
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
  return productIdentityKey(line);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

type Observation = {
  purchase: PreparedPurchase;
  key: string;
  basis: keyof PurchaseQuantity;
  quantity: number;
  ore: number;
};
const bases = ["packages", "units", "grams", "millilitres"] as const;
function observations(purchases: PreparedPurchase[]) {
  return purchases.flatMap((purchase) => {
    const key = identity(purchase.line);
    if (
      !key ||
      purchase.amountOre <= 0 ||
      purchase.line.amountOre === null ||
      !purchase.analysis
    )
      return [];
    return bases.flatMap((basis) => {
      const quantity = purchase.analysis!.quantity[basis];
      return quantity !== null && Number.isFinite(quantity) && quantity > 0
        ? [
            {
              purchase,
              key,
              basis,
              quantity,
              ore: purchase.amountOre / quantity,
            },
          ]
        : [];
    });
  });
}
function priceHistory(purchases: PreparedPurchase[]) {
  const history = new Map<string, Observation[]>();
  for (const observation of observations(purchases)) {
    const key = `${observation.key}:${observation.basis}`;
    const values = history.get(key) ?? [];
    values.push(observation);
    history.set(key, values);
  }
  return history;
}
function comparePrices(
  history: Map<string, Observation[]>,
  purchases: PreparedPurchase[],
) {
  const result = new Map<string, PriceSignal>();
  for (const observation of observations(purchases)) {
    const {
      purchase: { receipt, line },
      key,
      basis,
      quantity,
      ore,
    } = observation;
    if (result.has(line.id)) continue;
    const others = (history.get(`${key}:${basis}`) ?? []).filter(
      (item) => item.purchase.receipt._id !== receipt._id,
    );
    if (others.length < priceSignalMinimumObservations) continue;
    const typicalOre = median(others.map((item) => item.ore));
    if (typicalOre <= 0) continue;
    const ratio = ore / typicalOre;
    if (Math.abs(ratio - 1) < priceSignalThreshold) continue;
    result.set(line.id, {
      key,
      basis,
      quantity,
      name: line.catalogProduct?.name ?? line.productName ?? line.name,
      currentOre: ore,
      typicalOre,
      ratio,
      observations: others.length,
      receipt,
      line,
    });
  }
  return result;
}

/** Compare current, known quantities for the same linked identity and measure. */
export function priceSignals(
  receipts: Receipt[],
  receipt: Receipt,
): Map<string, PriceSignal> {
  const history = priceHistory(
    preparePurchases(receipts, comparisonPurchasePolicy).flatMap(
      (item) => item.purchases,
    ),
  );
  return comparePrices(
    history,
    preparePurchases([receipt], comparisonPurchasePolicy).flatMap(
      (item) => item.purchases,
    ),
  );
}

/** Build history once, then compare eligible purchases in the selected month. */
export function monthPriceSignals(receipts: Receipt[], month: string) {
  const prepared = preparePurchases(receipts, comparisonPurchasePolicy);
  const history = priceHistory(prepared.flatMap((item) => item.purchases));
  return prepared
    .filter((item) => receiptMonth(item.receipt) === month)
    .flatMap((item) => [...comparePrices(history, item.purchases).values()])
    .sort(
      (a, b) =>
        (b.currentOre - b.typicalOre) * b.quantity -
        (a.currentOre - a.typicalOre) * a.quantity,
    );
}

export function priceSignalLabel(signal: PriceSignal) {
  const percent = Math.round(Math.abs(signal.ratio - 1) * 100);
  return signal.ratio > 1
    ? `+${percent} % vs vanlig`
    : `−${percent} % vs vanlig`;
}
