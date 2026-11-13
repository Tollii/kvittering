import { z } from "zod";
import * as Sentry from "@sentry/react-native";
import { errorDetails, type DiagnosticFields } from "./diagnostics";
import { diagnosticText } from "./sentry-event";
import { analytics } from "./analytics";
import { setRequestAttributes } from "./tracing";

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

  const method = level === "warning" ? "warn" : "info";

  Sentry.logger[method](event, fields);
  analytics?.logger[method](event, fields);
}

/** Report the visible screen by route name, without ids. Returns the cleanup for when it closes. */
export function recordScreen(screen: string) {
  Sentry.getCurrentScope().setTag("screen", screen);
  recordEvent("navigation.opened", { screen });
  void analytics?.screen(screen);

  return () => {
    Sentry.getCurrentScope().setTag("screen", "unknown");
  };
}

/** Tie PostHog events to the internal account id. Returns the cleanup for sign-out or an account switch. */
export function identifyAccount(owner: string) {
  analytics?.identify(owner);
  setRequestAttributes({ "user.id": owner });

  return () => {
    analytics?.reset();
    setRequestAttributes({ "user.id": undefined });
  };
}

/** Tag later PostHog events with the household. Returns the cleanup for leaving it. */
export function tagHousehold(householdId: string) {
  void analytics?.register({ household_id: householdId });
  setRequestAttributes({ "kvitto.household.id": householdId });

  return () => {
    void analytics?.unregister("household_id");
    setRequestAttributes({ "kvitto.household.id": undefined });
  };
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
    if (reported.has(cause)) return undefined;
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

  if (expected || fields.status === 429) return undefined;
  // Background uploads retry. Report a repeated failure at most once per five minutes.
  const key = `${operation}:${details.errorType}:${details.code ?? details.status ?? fields.status ?? ""}:${fields.receiptId ?? ""}:${message}`;
  const now = Date.now();

  if (now - (recentFailures.get(key) ?? -Infinity) < 5 * 60_000)
    return undefined;

  const oldest = recentFailures.keys().next();

  if (recentFailures.size >= 100 && !oldest.done)
    recentFailures.delete(oldest.value);
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
  analytics?.captureException(diagnostic, { ...fields, ...details, operation });

  return eventId;
}
