import { removePackageText } from "../domain/product-evidence";

/** Normalize search text without changing the receipt description or product identity. */
export function normalizeSearch(value: string) {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase("nb-NO")
      .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      // oxlint-disable-next-line eslint/no-control-regex -- Remove control characters from external search text.
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Separate a glued package description while preserving brand numbers such as B12. */
export function productSearch(name: string) {
  return normalizeSearch(name)
    .replace(
      /(\p{L})(\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|dl|l|stk|pk|bx)\b)/gu,
      "$1 $2",
    )
    .replace(/(\d)\s*[- ]\s*(kg|g|ml|cl|dl|l|stk|pk|bx)\b/g, "$1$2")
    .replace(/(\d),(\d)/g, "$1.$2");
}

/** Broaden retrieval once. The original receipt remains the matching evidence. */
export function broaderProductSearch(name: string): string | null {
  const original = productSearch(name);

  const search = normalizeSearch(
    removePackageText(original).replace(/\b(?:xl|xxl|pk|stk|bx)\b/g, " "),
  );

  const words = search.match(/\p{L}[\p{L}\p{N}]*/gu) ?? [];

  return search !== original && words.length >= 2 && search.length >= 3
    ? search
    : null;
}
