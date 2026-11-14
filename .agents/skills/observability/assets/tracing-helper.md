# Tracing helper template

A starting point for the project's tracing module, the only file that touches the tracer. Adapt the names, fields and framework calls to the project; in another language, use its idiom for the same idea.

Nothing compiles or tests this code. Check the signatures against the OpenTelemetry versions the project installs before relying on it.

```ts
// Template for the project's tracing module, the only file that touches the
// tracer. Adapt names, the context fields, and the outcome values; in another
// language, use its idiom for the same idea (a decorator, middleware, `defer`).

import { AsyncLocalStorage } from "node:async_hooks";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { Context } from "@opentelemetry/api";
// The trace SDK package is named differently across major versions
// (`sdk-trace-base`, later `sdk-trace`). Import from the one that is installed.
import type { Span, SpanProcessor } from "@opentelemetry/sdk-trace-base";

const tracer = trace.getTracer("app");

/**
 * Wrap a function where it is defined:
 *
 *   export const getReceipt = traced("receipts.getReceipt", async (id: string) => { ... });
 *
 * Span names are stable and low-cardinality. Ids go in attributes.
 */
export function traced<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args) =>
    tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await fn(...args);
        span.setAttribute("outcome", "success");
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute("outcome", "error");
        throw err;
      } finally {
        span.end();
      }
    });
}

/** What identifies the request. Add the ids of the domain's main entities. */
export type RequestContext = {
  "request.id"?: string;
  "user.id"?: string;
  "tenant.id"?: string;
  "http.route"?: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

/** The server middleware calls this once per request, around the handler. */
export function withRequestContext<R>(initial: RequestContext, run: () => R): R {
  return requestContext.run({ ...initial }, run);
}

/**
 * Call as soon as a field is known, for example right after auth. Spans that
 * start later carry it; a span that started earlier does not.
 */
export function setRequestContext(fields: RequestContext): void {
  const current = requestContext.getStore();
  if (current) Object.assign(current, fields);
}

/** Register with the SDK so that every span starts with the request context. */
export class RequestContextProcessor implements SpanProcessor {
  onStart(span: Span, _parent: Context): void {
    const current = requestContext.getStore();
    if (current) span.setAttributes(current);
  }
  onEnd(): void {}
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
```
