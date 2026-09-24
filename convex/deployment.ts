import type { Channel } from "../src/lib/releases/policy";

/** The release channel this backend deployment serves, from its environment. */
export function deploymentChannel(): Channel {
  const value = process.env.RELEASE_CHANNEL ?? "development";

  if (
    value !== "development" &&
    value !== "testflight" &&
    value !== "production"
  )
    throw new Error("Invalid RELEASE_CHANNEL.");

  return value;
}
