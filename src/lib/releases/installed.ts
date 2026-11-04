import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { apiVersion, type ClientRelease } from "./policy";

const channel = Updates.channel ?? process.env.EXPO_PUBLIC_RELEASE_CHANNEL;

/** The running build. Reporting code imports this, so it imports no reporting. */
export const installedRelease: ClientRelease = {
  version: Application.nativeApplicationVersion ?? "0.0.0",
  build: Application.nativeBuildVersion ?? "0",
  platform: Platform.OS === "android" ? "android" : "ios",
  channel:
    channel === "testflight" || channel === "production"
      ? channel
      : "development",
  apiVersion,
  updateId: Updates.updateId,
  runtimeVersion: Updates.runtimeVersion,
};

/** Release builds report to Sentry and PostHog; development builds do not. */
export const telemetryEnabled =
  !__DEV__ && installedRelease.channel !== "development";
