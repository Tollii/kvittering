/** Normalize search text without changing the receipt description or product identity. */
export function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("nb-NO")
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
