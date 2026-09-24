/** The middle value, averaging the two middle ones; undefined when empty. */
export function median(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  const lower = sorted[middle - 1];

  if (upper === undefined) return undefined;

  return sorted.length % 2 || lower === undefined ? upper : (lower + upper) / 2;
}
