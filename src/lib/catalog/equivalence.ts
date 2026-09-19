import {
  parseProductEvidence,
  removePackageText,
} from "../domain/product-evidence";
import { normalizeSearch } from "./policy";
import type { CatalogProduct } from "./model";

/** Packaging descriptions do not identify a different recipe or food variety. */
function equivalentName(name: string) {
  return removePackageText(name)
    .replace(
      /\b(flaske|flasker|boks|bokser|pet|sleek|flowpk|flowpack|pakke|pakning|pose|beger|kartong)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function organicProduct(name: string, labels: readonly string[] = []) {
  return /(?:^|[^\p{L}])(?:økologisk|okologisk|organic|øko)(?:$|[^\p{L}])/iu.test(
    [name, ...labels].join(" "),
  );
}

function descriptor(product: CatalogProduct) {
  const evidence = parseProductEvidence({
    source: "catalog",
    name: product.name,
    packageSize: product.weight,
    packageUnit: product.weightUnit,
  });
  const sizes = [
    ...new Set(evidence.measures.map(({ amount, unit }) => `${amount}${unit}`)),
  ];
  const words = [
    ...new Set(
      normalizeSearch(equivalentName(product.name))
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    ),
  ].sort();
  return {
    product,
    // Conflicting size evidence and generic single words cannot establish equivalence.
    family: JSON.stringify([
      words,
      organicProduct(product.name, product.labels),
      evidence.counts,
      sizes.length > 1 || evidence.counts.length > 1 || words.length < 2
        ? product.key
        : null,
    ]),
    brand: normalizeSearch(product.brand ?? ""),
    size: sizes.length === 1 ? sizes[0] : "",
  };
}
type Descriptor = ReturnType<typeof descriptor>;
const includesEvidence = (specific: Descriptor, general: Descriptor) =>
  specific.family === general.family &&
  (!general.brand || specific.brand === general.brand) &&
  (!general.size || specific.size === general.size);

/**
 * Group equal product names across catalog records. Missing metadata joins only
 * one unambiguous group; it never bridges different brands or package sizes.
 * Returned representatives are scoring evidence, not persisted purchase facts.
 */
export function groupCatalogProducts(
  products: CatalogProduct[],
): CatalogProduct[] {
  const unique = [
    ...new Map(products.map((product) => [product.key, product])).values(),
  ];
  const descriptors = unique
    .filter((product) => !product.equivalence)
    .map(descriptor);
  const groups = new Map<string, CatalogProduct[]>();
  for (const item of descriptors) {
    const possible = descriptors.filter((other) =>
      includesEvidence(other, item),
    );
    const specific = possible.filter(
      (candidate) =>
        !possible.some(
          (other) =>
            includesEvidence(other, candidate) &&
            (other.brand !== candidate.brand || other.size !== candidate.size),
        ),
    );
    const signatures = new Map(
      specific.map((candidate) => [
        JSON.stringify([candidate.family, candidate.brand, candidate.size]),
        candidate,
      ]),
    );
    const key =
      signatures.size === 1
        ? signatures.keys().next().value!
        : JSON.stringify([item.family, item.brand, item.size]);
    groups.set(key, [...(groups.get(key) ?? []), item.product]);
  }
  const completeness = (product: CatalogProduct) =>
    Number(!!product.image) * 4 +
    Number(!!product.brand) * 2 +
    Number(!!product.weight && !!product.weightUnit);
  return [
    ...unique.filter((product) => product.equivalence),
    ...[...groups].map(([key, members]) => {
      if (members.length === 1) return members[0];
      const representative = [...members].sort(
        (a, b) =>
          completeness(b) - completeness(a) || a.key.localeCompare(b.key),
      )[0];
      const size = members.flatMap(
        (member) =>
          parseProductEvidence({
            source: "catalog",
            name: member.name,
            packageSize: member.weight,
            packageUnit: member.weightUnit,
          }).measures,
      )[0];
      return {
        ...representative,
        brand: members.find((member) => member.brand)?.brand,
        weight: size?.amount,
        weightUnit: size?.unit,
        key: `equivalent:${key}`,
        equivalence: {
          representativeKey: representative.key,
          candidateKeys: members.map((product) => product.key).sort(),
        },
      };
    }),
  ];
}

/** A representative supplies an image, never an unconfirmed barcode or package. */
export function equivalentCatalogProduct(
  product: CatalogProduct,
): CatalogProduct {
  if (!product.equivalence) return product;
  const name = equivalentName(product.name);
  return {
    key: product.key,
    name:
      organicProduct(product.name, product.labels) && !organicProduct(name)
        ? `${name} Økologisk`
        : name,
    image: product.image,
    equivalence: product.equivalence,
    ids: [],
    categories: product.categories,
    nutrition: [],
    allergens: [],
    labels: [],
  };
}
