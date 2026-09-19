import type { ConfigContext, ExpoConfig } from "expo/config";

/** Reject an export that would move an installed app to a different backend. */
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const channel = process.env.EXPO_PUBLIC_RELEASE_CHANNEL;

  if (channel === "testflight") {
    if (
      process.env.EXPO_PUBLIC_CONVEX_URL !==
        "https://courteous-jay-215.eu-west-1.convex.cloud" ||
      process.env.EXPO_PUBLIC_CONVEX_SITE_URL !==
        "https://courteous-jay-215.eu-west-1.convex.site"
    )
      throw new Error(
        "TestFlight builds and OTA updates require the staging backend.",
      );
  } else if (channel && channel !== "development") {
    throw new Error(
      "Configure the production release environment before using this channel.",
    );
  }

  return {
    ...config,
    name: config.name ?? "kvitto",
    slug: config.slug ?? "kvitto",
  };
}
