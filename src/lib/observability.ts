import * as Sentry from "@sentry/react-native";
import { errorDetails, type DiagnosticFields } from "./diagnostics";
import { diagnosticText } from "./sentry-event";

/** Record deliberate milestones; do not pass request arguments or response bodies. */
export function recordEvent(
  event: string,
  fields: DiagnosticFields = {},
  level: "info" | "warning" = "info",
) {
  Sentry.addBreadcrumb({
    category: "kvitto",
    message: event,
    data: fields,
    level,
  });
  if (level === "warning") Sentry.logger.warn(event, fields);
  else Sentry.logger.info(event, fields);
}

const reported = new WeakSet<object>();
const recentFailures = new Map<string, number>();

/** Let Sentry retain the original stack and causes; redact text at the event boundary. */
export function reportError(
  error: unknown,
  operation: string,
  fields: DiagnosticFields = {},
) {
  if (error && typeof error === "object") {
    if (reported.has(error)) return;
    reported.add(error);
  }
  const { expected, ...details } = errorDetails(error);
  const message = diagnosticText(
    typeof error === "string"
      ? error
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : `${operation} failed (${details.code ?? details.errorType}).`,
  );
  recordEvent(
    `${operation}.failed`,
    { ...fields, ...details, operation },
    "warning",
  );
  if (expected || fields.status === 429) return;
  // Background uploads retry. Report a repeated failure at most once per five minutes.
  const key = `${operation}:${details.errorType}:${details.code ?? details.status ?? fields.status ?? ""}:${fields.receiptId ?? ""}:${message}`;
  const now = Date.now();
  if (now - (recentFailures.get(key) ?? -Infinity) < 5 * 60_000) return;
  if (recentFailures.size >= 100)
    recentFailures.delete(recentFailures.keys().next().value!);
  recentFailures.set(key, now);
  const diagnostic = error instanceof Error ? error : new Error(message);
  const eventId = Sentry.captureException(diagnostic, {
    tags: {
      operation,
      error_type: details.errorType,
      ...(details.code ? { error_code: details.code } : {}),
      ...(details.requestId ? { request_id: details.requestId } : {}),
    },
    contexts: { operation: { ...fields, ...details } },
  });
  Sentry.logger.error(message, {
    ...fields,
    ...details,
    operation,
    sentry_event_id: eventId,
  });
  return eventId;
}
