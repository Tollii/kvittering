/**
 * The share extension opens the app with `kvitto://dataUrl=…`. That is not a
 * route; expo-share-intent reads the payload itself, so land on the camera tab.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return path.includes("dataUrl=") ? "/" : path;
}
