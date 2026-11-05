import PostHog from "posthog-react-native";
import { redactExceptions } from "./posthog-event";
import { installedRelease, telemetryEnabled } from "./releases/installed";

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;

/**
 * PostHog for product analytics, errors and logs. Events say what someone did,
 * never what a receipt says: no store names, amounts, products, images or free
 * text. Session replay and tap autocapture stay off. Only TestFlight and
 * production builds with the project token send anything.
 */
export const analytics =
  projectToken && telemetryEnabled
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
          // Hermes keeps one promise rejection tracker, and Sentry starts later and takes it, so rejections reach only Sentry until it is removed.
          autocapture: { uncaughtExceptions: true, unhandledRejections: true },
        },
        logs: {
          serviceName: "kvitto-app",
          environment: installedRelease.channel,
        },
        before_send: redactExceptions,
      })
    : undefined;
