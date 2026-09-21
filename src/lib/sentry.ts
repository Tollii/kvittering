import * as Sentry from "@sentry/react-native";
import { installedRelease, setReleaseDiagnostics } from "./releases/client";
import { diagnosticBreadcrumb, prepareErrorEvent } from "./sentry-event";

export const sentryEnabled =
  !__DEV__ && installedRelease.channel !== "development";

if (sentryEnabled) {
  Sentry.init({
    // This public ingestion address identifies the project. It is not an API token.
    dsn: "https://367c807fd9918897c076cc5d1a9208c9@o4511198613274624.ingest.de.sentry.io/4512110188167248",
    environment: installedRelease.channel,
    sendDefaultPii: false,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.mobileReplayIntegration({
        maskAllText: true,
        maskAllImages: true,
        maskAllVectors: true,
        networkCaptureBodies: false,
      }),
    ],
    enableLogs: true,
    logsOrigin: "js",
    enableAutoConsoleLogs: false,
    maxBreadcrumbs: 60,
    attachStacktrace: true,
    maxValueLength: 2000,
    beforeBreadcrumb: diagnosticBreadcrumb,
    beforeSend: (event, hint) => {
      const parser = Sentry.getClient()?.getOptions().stackParser;

      return prepareErrorEvent(
        event,
        hint.syntheticException?.stack && parser && !Array.isArray(parser)
          ? parser(hint.syntheticException.stack)
          : [],
      );
    },
  });

  setReleaseDiagnostics(0);
}
