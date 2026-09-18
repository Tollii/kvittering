import type { ReceiptLine } from "../domain/receipt";
import { compatibleProduct, matchingKey } from "../domain/product-matching";
import type { CatalogProduct, PhysicalStore } from "./model";
import { normalizeSearch } from "./policy";

/** Keep package evidence in the query so common brands return the relevant size. */
export function productSearch(name: string) {
  return normalizeSearch(name)
    .replace(/(\p{L})(\d)/gu, "$1 $2")
    .replace(/(\d)\s+(kg|g|ml|cl|l|stk|pk)\b/gi, "$1$2")
    .slice(0, 120);
}
export function compatibleCatalogProduct(
  line: ReceiptLine,
  product: CatalogProduct,
  allowMissingSize = false,
) {
  const size = line.name.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i);
  const isWeightOrVolume = /^(kg|g|ml|cl|l)$/i.test(line.packageUnit ?? "");
  const amount = isWeightOrVolume
    ? line.packageSize
    : size
      ? Number(size[1].replace(",", "."))
      : null;
  const unit = isWeightOrVolume
    ? line.packageUnit
    : (size?.[2]?.toLowerCase() ?? null);
  const packCount = (name: string) => {
    const match = normalizeSearch(name).match(
      /(\d+)\s*(?:pk|stk|bx)\b|\bx\s*(\d+)\b|(\d+)\s*x\s*\d/,
    );
    return match ? Number(match[1] ?? match[2] ?? match[3]) : null;
  };
  const count = /^(pk|stk|bx)$/i.test(line.packageUnit ?? "")
    ? line.packageSize
    : packCount(line.name);
  const targetCount = packCount(product.name);
  if ((count ?? 1) !== (targetCount ?? 1)) return false;
  const normalizeUnit = (value: number | null, unit: string | null) => ({
    packageSize:
      unit?.toLowerCase() === "cl" && value !== null ? value * 10 : value,
    packageUnit:
      unit?.toLowerCase() === "cl" ? "ml" : (unit?.toLowerCase() ?? null),
  });
  const brand = (value: string | null) =>
    value ? normalizeSearch(value).replace(/[^\p{L}\p{N}]/gu, "") : null;
  const variant = (name: string) => [
    /\b(light|lett)\b/.test(normalizeSearch(name)),
    /\b(koffeinfri|caffeine free|zero caffeine)\b/.test(normalizeSearch(name)),
  ];
  if (
    variant([line.name, ...line.attributes].join(" ")).some(
      (value, index) => value !== variant(product.name)[index],
    )
  )
    return false;
  return compatibleProduct(
    { ...line, brand: brand(line.brand), ...normalizeUnit(amount, unit) },
    {
      name: product.name,
      brand: brand(product.brand),
      ...normalizeUnit(product.weight, product.weightUnit),
      attributes: [],
    },
    allowMissingSize,
  );
}

/** Normalize text without removing flavour, variant or multipack evidence. */
function productWords(name: string) {
  return new Set(
    normalizeSearch(name)
      .replace(
        /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/g,
        (_, amount: string, unit: string) => {
          const value = Number(amount.replace(",", "."));
          const factor =
            unit === "kg" || unit === "l" ? 1000 : unit === "cl" ? 10 : 1;
          return ` ${Math.round(value * factor * 1000) / 1000}${unit === "kg" ? "g" : unit === "l" || unit === "cl" ? "ml" : unit} `;
        },
      )
      .replace(/\b(uten sukker|sugar free|sukkerfri)\b/g, "zero")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word && !["flaske", "boks", "pet"].includes(word)),
  );
}

/** Rank the entire result set before limiting candidates sent to the classifier. */
export function rankCatalogProducts(name: string, products: CatalogProduct[]) {
  const source = productWords(name);
  return products
    .map((product) => {
      const target = productWords(product.name);
      const common = [...source].filter((word) => target.has(word)).length;
      return { product, score: common / Math.max(source.size, target.size, 1) };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(!!b.product.ean) - Number(!!a.product.ean) ||
        a.product.key.localeCompare(b.product.key),
    );
}

/** A unique full text match can be linked without waiting for an AI response. */
export function automaticCatalogProduct(
  line: ReceiptLine,
  products: CatalogProduct[],
) {
  const matches = rankCatalogProducts(
    line.receiptName || line.name,
    products,
  ).filter(
    ({ product, score }) =>
      score === 1 && compatibleCatalogProduct(line, product),
  );
  // Single generic words such as “Agurk” do not establish a retail product.
  if (productWords(line.receiptName || line.name).size < 2) return null;
  const barcoded = matches.filter(({ product }) => product.ean);
  const candidates = barcoded.length ? barcoded : matches;
  const unique = [
    ...new Map(
      candidates.map(({ product }) => [product.key, product]),
    ).values(),
  ];
  return unique.length === 1 ? unique[0] : null;
}
export function retailerCode(store: string | null): string | null {
  const name = normalizeSearch(store ?? "");
  const known: [RegExp, string][] = [
    [/re ma|rema/, "REMA_1000"],
    [/kiwi/, "KIWI"],
    [/meny/, "MENY_NO"],
    [/spar/, "SPAR_NO"],
    [/joker/, "JOKER_NO"],
    [/bunnpris/, "BUNNPRIS"],
    [/coop.*extra|^extra/, "COOP_EXTRA"],
    [/coop.*mega/, "COOP_MEGA"],
    [/coop.*prix/, "COOP_PRIX"],
    [/coop.*obs/, "COOP_OBS"],
    [/coop/, "COOP_NO"],
    [/europris/, "EUROPRIS_NO"],
  ];
  return known.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}
export function exactPhysicalStore(
  branch: string,
  candidates: PhysicalStore[],
) {
  const words = (value: string) =>
    matchingKey(value).replace(/[^\p{L}\p{N}]/gu, "");
  const name = words(branch);
  if (name.length < 4) return null;
  const matches = candidates.filter((store) =>
    words(store.name).includes(name),
  );
  return matches.length === 1 ? matches[0] : null;
}
export function lineEvidenceKey(line: ReceiptLine) {
  return JSON.stringify([
    line.receiptName ?? line.name,
    line.name,
    line.brand,
    line.packageSize,
    line.packageUnit,
    line.attributes,
  ]);
}
