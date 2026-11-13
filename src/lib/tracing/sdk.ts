import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type ContextManager,
} from "@opentelemetry/api";
import {
  W3CTraceContextPropagator,
  hrTimeToMilliseconds,
} from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AlwaysOnSampler,
  TracerProvider,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace";
import { requestContextOf, type RequestContext } from "./index";

/** Copies the request's attributes onto each of its spans when it starts and again when it ends. */
class RequestContextProcessor implements SpanProcessor {
  #requests = new WeakMap<Span, RequestContext>();

  onStart(span: Span, parent: Context) {
    const request = requestContextOf(parent);

    if (!request) return;
    this.#requests.set(span, request);
    span.setAttributes(request.attributes);
  }

  // Attributes learned after the span started, such as the household. In the
  // app the context outlives an account, so a span that started under another
  // account keeps what it had.
  onEnding(span: Span) {
    const request = this.#requests.get(span);
    const account = span.attributes["user.id"];

    if (
      request &&
      (account === undefined || account === request.attributes["user.id"])
    )
      span.setAttributes(request.attributes);
  }

  onEnd() {}

  forceFlush() {
    return Promise.resolve();
  }

  shutdown() {
    return Promise.resolve();
  }
}

/**
 * Attributes a span may export. Libraries such as Better Auth add their own
 * spans, so everything else stays behind: headers, addresses, queries, and
 * free text can carry personal data.
 */
const exportedAttribute =
  /^(kvitto\.|code\.function\.name$|error\.type$|convex\.|user\.id$|http\.request\.method$|http\.response\.status_code$|http\.route$|server\.address$|url\.path$|db\.collection\.name$|db\.operation\.name$|better_auth\.(operation_id|hook\.type)$)/;

export function exportedAttributes(attributes: Attributes) {
  return Object.fromEntries(
    Object.entries(attributes).filter(([key]) => exportedAttribute.test(key)),
  );
}

/**
 * The parts of a finished span that leave the process: identifiers, timing,
 * status without its message, and allowed attributes. Events stay behind
 * because recorded exceptions carry error messages.
 */
export function spanRecord(span: ReadableSpan) {
  const { traceId, spanId } = span.spanContext();

  return {
    traceId,
    spanId,
    parentSpanId: span.parentSpanContext?.spanId,
    name: span.name,
    kind: SpanKind[span.kind],
    start: span.startTime,
    end: span.endTime,
    durationMs: Math.round(hrTimeToMilliseconds(span.duration) * 1000) / 1000,
    failed: span.status.code === SpanStatusCode.ERROR,
    attributes: exportedAttributes(span.attributes),
  };
}

export type TracingSetup = {
  resource: Attributes;
  contextManager: ContextManager;
  processor: SpanProcessor;
};

/**
 * Registers the process-wide tracer provider, context manager, and W3C trace
 * context propagation. Every span is recorded: each runtime decides in its
 * processor what leaves the process.
 */
export function installTracing(setup: TracingSetup) {
  const provider = new TracerProvider({
    resource: resourceFromAttributes(setup.resource),
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new RequestContextProcessor(), setup.processor],
  });

  context.setGlobalContextManager(setup.contextManager.enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(provider);

  return provider;
}
