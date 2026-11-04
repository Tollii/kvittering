import PostHog from "posthog-react-native";
import * as Updates from "expo-updates";
import { redactExceptions } from "./posthog-event";

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;

// Read here rather than from the release client, which reports through
// observability and so would import this module back.
const channel = Updates.channel ?? process.env.EXPO_PUBLIC_RELEASE_CHANNEL;

/**
 * PostHog for product analytics, errors and logs. Events say what someone did,
 * never what a receipt says: no store names, amounts, products, images or free
 * text. Session replay and tap autocapture stay off. Only TestFlight and
 * production builds with the project token send anything.
 */
export const analytics =
  projectToken &&
  !__DEV__ &&
  (channel === "testflight" || channel === "production")
    ? new PostHog(projectToken, {
        host:
          process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
        disableGeoip: true,
        enableSessionReplay: false,
        disableSurveys: true,
        // Convex owns the app's feature flags.
        preloadFeatureFlags: false,
        capturePushNotificationSubscriptions: false,
        capturePushNotificationOpened: false,
        errorTracking: {
          autocapture: { uncaughtExceptions: true, unhandledRejections: true },
        },
        logs: { serviceName: "kvitto-app", environment: channel },
        before_send: redactExceptions,
      })
    : undefined;
