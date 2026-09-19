import * as Sentry from "@sentry/react-native";
import { errorDetails, type DiagnosticFields } from "./diagnostics";

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

/** Keep the stack, but replace messages that may contain server arguments or OCR text. */
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
  // Background uploads retry. Report a repeated failure at most once per five minutes.
  const key = `${operation}:${details.errorType}:${details.code ?? details.status ?? fields.status ?? ""}:${fields.receiptId ?? ""}`;
  const now = Date.now();
  if (now - (recentFailures.get(key) ?? -Infinity) < 5 * 60_000) return;
  if (recentFailures.size >= 100)
    recentFailures.delete(recentFailures.keys().next().value!);
  recentFailures.set(key, now);
  recordEvent(
    `${operation}.failed`,
    { ...fields, ...details, operation },
    "warning",
  );
  if (expected || fields.status === 429) return;
  const diagnostic = new Error(
    `${operation} failed (${details.code ?? details.errorType}).`,
  );
  if (error instanceof Error && error.stack) {
    diagnostic.stack = `${diagnostic.name}: ${diagnostic.message}\n${error.stack
      .split("\n")
      .filter((line) => /^\s*at |^[^\s]+@/.test(line))
      .join("\n")}`;
  }
  Sentry.captureException(diagnostic, {
    tags: { operation, error_type: details.errorType },
    contexts: { operation: { ...fields, ...details } },
  });
}
