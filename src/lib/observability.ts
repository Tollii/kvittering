import { z } from "zod";
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

const errorMessageSchema = z.union([
  z.string(),
  z.object({ message: z.string() }).transform((value) => value.message),
]);

type ErrorTags = {
  operation: string;
  error_type: string;
  error_code?: string;
  request_id?: string;
};

const reported = new WeakSet<object>();

const recentFailures = new Map<string, number>();

/** Let Sentry retain the original stack and causes; redact text at the event boundary. */
export function reportError(
  cause: unknown,
  operation: string,
  fields: DiagnosticFields = {},
) {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Deduplication requires the original object identity, including objects without a prototype.
  if (cause && typeof cause === "object") {
    if (reported.has(cause)) return;
    reported.add(cause);
  }

  const { expected, ...details } = errorDetails(cause);

  const text = errorMessageSchema.safeParse(cause).data;

  const message = diagnosticText(
    text ?? `${operation} failed (${details.code ?? details.errorType}).`,
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
  const diagnostic = cause instanceof Error ? cause : new Error(message);

  const tags: ErrorTags = { operation, error_type: details.errorType };

  if (details.code) tags.error_code = details.code;

  if (details.requestId) tags.request_id = details.requestId;

  const eventId = Sentry.captureException(diagnostic, {
    tags,
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
