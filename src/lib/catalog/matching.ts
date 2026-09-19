import type { ReceiptLine } from "../domain/receipt";
import { compatibleProduct, matchingKey } from "../domain/product-matching";
import type { CatalogProduct, PhysicalStore } from "./model";
import { normalizeSearch } from "./policy";
import { productSearch } from "./search";
export { productSearch } from "./search";

export function compatibleCatalogProduct(
  line: ReceiptLine,
  product: CatalogProduct,
  allowMissingSize = false,
) {
  const size = productSearch(line.name).match(
    /\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i,
  );
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
    const match = productSearch(name).match(
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
      brand: brand(product.brand ?? null),
      ...normalizeUnit(product.weight ?? null, product.weightUnit ?? null),
      attributes: [],
    },
    allowMissingSize,
  );
}

/** Normalize text without removing flavour, variant or multipack evidence. */
function productWords(name: string) {
  return new Set(
    productSearch(name)
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

/**
 * Words a catalog name may add without changing which product it is: sizes,
 * pack counts, packaging, and markers for the ordinary (non-Zero) variant.
 */
function neutralWord(word: string) {
  return (
    /^\d+(?:[.,]\d+)?(?:g|ml|pk|stk|bx|x)?$/.test(word) ||
    [
      "x",
      "pk",
      "stk",
      "bx",
      "sugar",
      "sukker",
      "original",
      "classic",
      "regular",
      "sleek",
      "glass",
      "kartong",
      "beger",
      "pose",
    ].includes(word)
  );
}

/**
 * Link without waiting for an AI response when the text leaves no doubt: a
 * unique full match, or the only compatible product that contains every
 * receipt word and adds nothing but size, pack or packaging words.
 */
export function automaticCatalogProduct(
  line: ReceiptLine,
  products: CatalogProduct[],
) {
  const name = line.receiptName || line.name;
  const source = productWords(name);
  // Single generic words such as “Agurk” do not establish a retail product.
  if (source.size < 2) return null;
  const unique = (items: CatalogProduct[]) => {
    const barcoded = items.filter((product) => product.ean);
    return [
      ...new Map(
        (barcoded.length ? barcoded : items).map((product) => [
          product.key,
          product,
        ]),
      ).values(),
    ];
  };
  const ranked = rankCatalogProducts(name, products);
  const exact = unique(
    ranked
      .filter(
        ({ product, score }) =>
          score === 1 && compatibleCatalogProduct(line, product),
      )
      .map(({ product }) => product),
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const contained = unique(
    ranked
      .filter(({ product }) => {
        const target = productWords(product.name);
        return (
          [...source].every((word) => target.has(word)) &&
          [...target].every((word) => source.has(word) || neutralWord(word)) &&
          compatibleCatalogProduct(line, product, true)
        );
      })
      .map(({ product }) => product),
  );
  return contained.length === 1 ? contained[0] : null;
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
