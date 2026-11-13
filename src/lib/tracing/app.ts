import { AppState } from "react-native";
import { z } from "zod";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import {
  BatchSpanProcessor,
  NoopSpanProcessor,
  StackContextManager,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace";
import {
  ROOT_CONTEXT,
  type Attributes,
  type Context,
  type HrTime,
} from "@opentelemetry/api";
import { installedRelease, telemetryEnabled } from "../releases/installed";
import { requestContextKey, type RequestContext } from "./index";
import { exportedAttributes, installTracing } from "./sdk";

/**
 * The app's spans go to PostHog tracing over OTLP/HTTP JSON with the same
 * public project token as its events, and only from builds that report
 * PostHog events at all. Development builds still record spans and send
 * trace headers, so the backend's log lines carry the app's trace ids.
 */

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;

const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

const resource: Attributes = {
  "service.name": "kvitto-app",
  "service.version": `${installedRelease.version} (${installedRelease.build})`,
  "deployment.environment.name": installedRelease.channel,
};

const anyValue = z.union([
  z.boolean().transform((boolValue) => ({ boolValue })),
  z.int().transform((value) => ({ intValue: String(value) })),
  z.number().transform((doubleValue) => ({ doubleValue })),
  z.string().transform((stringValue) => ({ stringValue })),
]);

function keyValues(attributes: Attributes) {
  return Object.entries(attributes).flatMap(([key, raw]) => {
    const value = anyValue.safeParse(raw);

    return value.success ? [{ key, value: value.data }] : [];
  });
}

/** OTLP JSON wants nanoseconds as a decimal string; Hermes numbers lose precision there. */
function nanoseconds([seconds, nanos]: HrTime) {
  return `${seconds}${String(nanos).padStart(9, "0")}`;
}

/** OTLP numbers span kinds from 1, after its unspecified 0. */
function otlpSpan(span: ReadableSpan) {
  const { traceId, spanId } = span.spanContext();

  return {
    traceId,
    spanId,
    parentSpanId: span.parentSpanContext?.spanId,
    name: span.name,
    kind: span.kind + 1,
    startTimeUnixNano: nanoseconds(span.startTime),
    endTimeUnixNano: nanoseconds(span.endTime),
    attributes: keyValues(exportedAttributes(span.attributes)),
    // The status message stays behind with the events: both can quote errors.
    status: { code: span.status.code },
  };
}

class PostHogSpanExporter implements SpanExporter {
  #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  export(spans: ReadableSpan[], done: (result: ExportResult) => void) {
    const body = JSON.stringify({
      resourceSpans: [
        {
          resource: { attributes: keyValues(resource) },
          scopeSpans: [
            { scope: { name: "kvitto" }, spans: spans.map(otlpSpan) },
          ],
        },
      ],
    });

    // The exporter's own request is not traced, or each export would make a span to export.
    void fetch(`${host}/i/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.#token}`,
      },
      body,
    }).then(
      (response) =>
        done({
          code: response.ok
            ? ExportResultCode.SUCCESS
            : ExportResultCode.FAILED,
        }),
      (cause: unknown) =>
        done({
          code: ExportResultCode.FAILED,
          error:
            cause instanceof Error ? cause : new Error("Trace export failed."),
        }),
    );
  }

  shutdown() {
    return Promise.resolve();
  }
}

/**
 * The app has one person at a time, so all its spans share one request
 * context: the root context carries it, and spans without a parent get it.
 */
const appRequest: RequestContext = { attributes: {} };

class AppContextManager extends StackContextManager {
  #root: Context = ROOT_CONTEXT.setValue(requestContextKey, appRequest);

  override active() {
    const active = super.active();

    return active === ROOT_CONTEXT ? this.#root : active;
  }
}

const provider = installTracing({
  resource,
  contextManager: new AppContextManager(),
  processor:
    projectToken && telemetryEnabled
      ? new BatchSpanProcessor({
          exporter: new PostHogSpanExporter(projectToken),
        })
      : new NoopSpanProcessor(),
});

// iOS may suspend the app soon after it leaves the screen.
AppState.addEventListener("change", (state) => {
  if (state === "background") void provider.forceFlush();
});
