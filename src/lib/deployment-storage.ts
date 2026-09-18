/** Preserve existing personal storage; isolate every other backend on the device. */
export function deploymentStorageSuffix(url: string | undefined) {
  if (!url) return "";
  const host = new URL(url).hostname;
  return host === "agile-falcon-148.eu-west-1.convex.cloud" ? "" : `-${host}`;
}

export const storageSuffix = deploymentStorageSuffix(
  process.env.EXPO_PUBLIC_CONVEX_URL,
);
