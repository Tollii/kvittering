import {
  parseProductEvidence,
  normalizeMeasureText,
} from "../domain/product-evidence";
import type { ReceiptLine } from "../domain/receipt";
import {
  compatibleProduct,
  matchingKey,
  type ProductEvidence,
} from "../domain/product-matching";
import type { CatalogProduct, PhysicalStore } from "./model";
import { normalizeSearch } from "./policy";
import { productSearch } from "./search";
export { productSearch } from "./search";

export function compatibleCatalogProduct(
  line: ProductEvidence,
  product: CatalogProduct,
) {
  const source = parseProductEvidence({ ...line, source: "receipt" });
  const target = parseProductEvidence({
    source: "catalog",
    name: product.name,
    packageSize: product.weight,
    packageUnit: product.weightUnit,
  });
  const size = source.measures[0];
  const targetSize = target.measures[0];
  if (
    source.counts.length > 1 ||
    target.counts.length > 1 ||
    (source.counts[0] !== undefined &&
      target.counts[0] !== undefined &&
      source.counts[0] !== target.counts[0])
  )
    return false;
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
    {
      ...line,
      brand: brand(line.brand),
      packageSize: size?.amount ?? null,
      packageUnit: size?.unit ?? null,
    },
    {
      name: product.name,
      brand: brand(product.brand ?? null),
      packageSize: targetSize?.amount ?? null,
      packageUnit: targetSize?.unit ?? null,
      attributes: [],
    },
  );
}

/** Normalize text without removing flavour, variant or multipack evidence. */
function productWords(name: string) {
  return new Set(
    normalizeMeasureText(productSearch(name))
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
 * packaging, and markers for the ordinary (non-Zero) variant. Pack counts
 * must also agree before an automatic link can be made.
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
 * Link a unique full match, a compatible name with neutral additions, or a
 * single compatible barcode supported by the receipt's brand and product words.
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
  const sourceCount = parseProductEvidence({ ...line, source: "receipt" })
    .counts[0];
  // Missing counts keep candidates eligible for the model, but do not prove pack identity.
  const hasUnresolvedCount = (product: CatalogProduct) =>
    sourceCount !==
    parseProductEvidence({
      source: "catalog",
      name: product.name,
      packageSize: product.weight,
      packageUnit: product.weightUnit,
    }).counts[0];
  const contained = unique(
    ranked
      .filter(({ product }) => {
        const target = productWords(product.name);
        return (
          [...source].every((word) => target.has(word)) &&
          [...target].every((word) => source.has(word) || neutralWord(word)) &&
          compatibleCatalogProduct(line, product)
        );
      })
      .map(({ product }) => product),
  );
  if (contained.length)
    return contained.length === 1 && !hasUnresolvedCount(contained[0])
      ? contained[0]
      : null;
  const candidates = unique(
    ranked
      .filter(({ product }) => {
        const target = productWords(product.name);
        return (
          [...source].every((word) => target.has(word)) &&
          compatibleCatalogProduct(line, product)
        );
      })
      .map(({ product }) => product),
  );
  if (candidates.length !== 1) return null;
  const candidate = candidates[0];
  if (!candidate.ean || !candidate.brand || hasUnresolvedCount(candidate))
    return null;
  const brandWords = productWords(candidate.brand);
  return brandWords.size > 0 &&
    [...brandWords].every((word) => source.has(word)) &&
    [...source].some((word) => !brandWords.has(word) && !neutralWord(word))
    ? candidate
    : null;
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
