import type { CatalogIdentity } from "./model";

/** Try the catalog image first, then the public EAN image when its supplier URL is broken. */
export function catalogImageSources(
  product: Pick<CatalogIdentity, "image" | "ean">,
) {
  const sources = product.image ? [product.image] : [];

  if (product.ean && /^\d{8,14}$/.test(product.ean))
    sources.push(`https://bilder.ngdata.no/${product.ean}/meny/large.jpg`);

  return [...new Set(sources)];
}
