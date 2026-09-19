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

/** A model may repair words, but must retain numbers, units and explicit variants. */
export function validateSearchSuggestion(
  original: string,
  suggestion: unknown,
): string | null {
  if (typeof suggestion !== "string") return null;
  const source = productSearch(original);
  const search = productSearch(suggestion);
  if (search.length < 3 || search.length > 120 || search === source)
    return null;
  const numbers = (value: string) => value.match(/\d+(?:\.\d+)?/g) ?? [];
  const units = (value: string) =>
    value.match(/\d+(?:\.\d+)?(?:kg|g|ml|cl|dl|l|stk|pk|bx)\b/g) ?? [];
  if (
    JSON.stringify(numbers(source)) !== JSON.stringify(numbers(search)) ||
    JSON.stringify(units(source)) !== JSON.stringify(units(search))
  )
    return null;
  const variants = (value: string) =>
    value.match(
      /\b(?:zero|light|lett|sukkerfri|uten sukker|sugar free|koffeinfri|caffeine free)\b/g,
    ) ?? [];
  if (JSON.stringify(variants(source)) !== JSON.stringify(variants(search)))
    return null;
  // Keep an identifiable part of each source word. Do not accept unrelated rewrites.
  const words = source.match(/\p{L}+/gu) ?? [];
  const targetWords = search.match(/\p{L}+/gu) ?? [];
  const target = search.replace(/[^\p{L}]/gu, "");
  if (
    !words.every(
      (word) =>
        target.includes(word) ||
        (word.length >= 5 &&
          targetWords.some((candidate) =>
            oneCharacterDifference(word, candidate),
          )),
    )
  )
    return null;
  return search;
}

function oneCharacterDifference(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let a = 0,
    b = 0,
    differences = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) {
      a++;
      b++;
      continue;
    }
    if (++differences > 1) return false;
    if (left.length >= right.length) a++;
    if (right.length >= left.length) b++;
  }
  return differences + (left.length - a) + (right.length - b) <= 1;
}
