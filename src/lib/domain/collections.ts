/** The only element of a list, or undefined when it has none or several. */
export function soleElement<T>(items: readonly T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

export type NonEmpty<T> = readonly [T, ...T[]];

/** The list as a non-empty tuple, or undefined when it is empty. */
export function nonEmpty<T>(items: readonly T[]): NonEmpty<T> | undefined {
  const [first, ...rest] = items;

  return first === undefined ? undefined : [first, ...rest];
}
