import * as Sentry from "@sentry/react-native";
import { installedRelease, setReleaseDiagnostics } from "./releases/client";

Sentry.init({
  // This public ingestion address identifies the project. It is not an API token.
  dsn: "https://367c807fd9918897c076cc5d1a9208c9@o4511198613274624.ingest.de.sentry.io/4512110188167248",
  environment: installedRelease.channel,
  sendDefaultPii: false,
  enableLogs: true,
  logsOrigin: "js",
  enableAutoConsoleLogs: false,
  maxBreadcrumbs: 60,
  // UI labels and HTTP URLs can contain receipt text or authentication parameters.
  beforeBreadcrumb: (breadcrumb) =>
    breadcrumb.category === "kvitto" ? breadcrumb : null,
});
setReleaseDiagnostics(0);
