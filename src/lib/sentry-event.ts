import { z } from "zod";
import type { Breadcrumb, ErrorEvent, StackFrame } from "@sentry/react-native";

const httpBreadcrumbSchema = z.object({
  url: z.string().optional().catch(undefined),
  method: z.string().optional().catch(undefined),
  status_code: z.number().optional().catch(undefined),
});

/** Keep the failure explanation, but remove credentials, URL parameters and payload dumps. */
export function diagnosticText(value: string) {
  const text = value
    .replace(/https?:\/\/[^\s<>"')]+/gi, (url) => {
      try {
        const parsed = new URL(url);

        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[invalid URL]";
      }
    })
    .replace(/\b(Bearer|Basic)\s+[\w.+/=-]+/gi, "$1 [Filtered]")
    .replace(/\b(?:prod|dev|preview):[\w-]+\|[\w+/=-]+/g, "[Filtered]")
    .replace(/\b(?:sntrys_|sntryu_|sk-)[\w-]+/g, "[Filtered]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[Filtered]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[Filtered]")
    .replace(
      // eslint-disable-next-line sonarjs/regex-complexity -- One credential pattern must consume quoted values with spaces before unquoted values.
      /\b(authorization|cookie|password|token|secret|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=[Filtered]",
    )
    .replace(
      /\b(Arguments|Args|Request body|Response body|Object):[\s\S]*/gi,
      "$1: [Filtered]",
    );

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  const filtered =
    firstBrace >= 0 && lastBrace > firstBrace
      ? text.slice(0, firstBrace) +
        "[Filtered payload]" +
        text.slice(lastBrace + 1)
      : text;

  return filtered.slice(0, 2000);
}

const networkCategories = new Set(["http", "fetch", "xhr"]);

/** HTTP breadcrumbs retain method, endpoint and status, never bodies or query parameters. */
export function diagnosticBreadcrumb(
  breadcrumb: Breadcrumb,
): Breadcrumb | null {
  if (breadcrumb.category === "kvitto") return breadcrumb;

  if (!networkCategories.has(breadcrumb.category ?? "")) return null;
  const data = breadcrumb.data ?? {};
  const safeData = httpBreadcrumbSchema.parse(data);

  if (safeData.url) safeData.url = diagnosticText(safeData.url);

  return {
    timestamp: breadcrumb.timestamp,
    category: "http",
    type: "http",
    level: breadcrumb.level,
    data: safeData,
  };
}

/** Run after SDK stack parsing and linked-error processing, including native causes. */
export function prepareErrorEvent(
  event: ErrorEvent,
  captureFrames: StackFrame[] = [],
) {
  const primary = event.exception?.values?.[0];

  if (primary) {
    const originalStack = !!primary.stacktrace?.frames?.length;

    if (!originalStack && captureFrames.length)
      primary.stacktrace = { frames: captureFrames };
    event.contexts = {
      ...event.contexts,
      diagnostics: {
        stack_source: originalStack
          ? "original"
          : captureFrames.length
            ? "capture"
            : "unavailable",
      },
    };
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = diagnosticText(exception.value);
  }

  event.breadcrumbs = event.breadcrumbs
    ?.map(diagnosticBreadcrumb)
    .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);

  // Unhandled non-Error rejections can otherwise serialize an entire response or request.
  if (event.extra) delete event.extra.__serialized__;

  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? diagnosticText(event.request.url) : undefined,
    };
  }

  return event;
}
