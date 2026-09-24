/** Return the value stored for a key, creating and storing it on first use. */
export function getOrInsert<K, V extends NonNullable<unknown> | null>(
  map: Map<K, V>,
  key: K,
  create: (key: K) => V,
): V {
  const stored = map.get(key);

  if (stored !== undefined) return stored;
  const value = create(key);
  map.set(key, value);

  return value;
}
