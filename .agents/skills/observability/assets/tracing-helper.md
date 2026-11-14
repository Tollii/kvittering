# Tracing helper template

A starting point for the project's tracing module, the only file that touches the tracer: `traced()`, the root span for a unit of work, the request context, and the wrapper for outgoing calls. Adapt the names and fields; in another language, use its idiom for the same idea (a decorator, middleware, `defer`).

Type-checked, linted and tested on 2026-11-14 in a trial project with `@opentelemetry/api` 1.10, `@opentelemetry/sdk-trace` 3.1 and Node's `AsyncLocalStorage`. Nothing checks it since, and other versions differ: confirm every import and constructor against the versions the project installs.

Three things in it are easy to get wrong:

- **The SDK package must match `@opentelemetry/api`.** Current majors use `@opentelemetry/sdk-trace`; older ones use `@opentelemetry/sdk-trace-base`. The two cannot be installed side by side, so use the one that resolves against the installed `api`.
- **`setRequestContext` also writes to spans that already started.** A span processor only sees spans as they start, so without this the root span and the auth span never get the user id.
- **The root span is kept in the store**, so the final outcome, and later `enrich()`, can reach it from inside child spans.

```ts
// The only module that touches the tracer. Everything else traces by wrapping
// a definition in `traced(...)`, or by calling `runServerSpan` / `tracedFetch`.

import { AsyncLocalStorage } from "node:async_hooks";
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type { Context, Span } from "@opentelemetry/api";
import type { SpanProcessor } from "@opentelemetry/sdk-trace";
import type { ReadableSpan, Span as SdkSpan } from "@opentelemetry/sdk-trace";

const tracer = trace.getTracer("app");

/** What identifies the request. Add the ids of the domain's main entities. */
export type RequestContext = {
  "request.id"?: string;
  "user.id"?: string;
  "tenant.id"?: string;
  "http.route"?: string;
};

type Store = { fields: RequestContext; rootSpan: Span };
const requestContext = new AsyncLocalStorage<Store>();

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

/**
 * Run one unit of work (an inbound HTTP request) under a root span that
 * continues the caller's trace when `headers` carries a `traceparent`.
 * The request context starts here and the root span carries all of it.
 */
export function runServerSpan<R>(
  options: { name: string; headers: Headers; initial: RequestContext },
  run: (span: Span) => Promise<R>,
): Promise<R> {
  const carrier: Record<string, string> = {};
  options.headers.forEach((value, key) => {
    carrier[key] = value;
  });
  const parent = propagation.extract(context.active(), carrier);
  return tracer.startActiveSpan(
    options.name,
    { kind: SpanKind.SERVER },
    parent,
    (span) =>
      requestContext.run({ fields: { ...options.initial }, rootSpan: span }, async () => {
        span.setAttributes(options.initial);
        try {
          return await run(span);
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
        }
      }),
  );
}

/**
 * Call as soon as a field is known, for example right after auth. Spans that
 * start later carry it; the root span and the active span get it immediately.
 */
export function setRequestContext(fields: RequestContext): void {
  const store = requestContext.getStore();
  if (!store) return;
  Object.assign(store.fields, fields);
  store.rootSpan.setAttributes(fields);
  trace.getActiveSpan()?.setAttributes(fields);
}

/** Record the final outcome on the root span of the current request. */
export function setRootOutcome(attributes: Record<string, string | number | boolean>): void {
  requestContext.getStore()?.rootSpan.setAttributes(attributes);
}

/** Rename the root span once the route pattern is known. */
export function renameRootSpan(name: string): void {
  requestContext.getStore()?.rootSpan.updateName(name);
}

/**
 * The project's one outgoing HTTP call. Creates a client span and injects the
 * W3C `traceparent` header so the callee joins the trace.
 */
// Opt-out comment for the lint rule goes here, with its reason: this function
// is the tracing and opens its own client span.
export async function tracedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const target = new URL(url);
  return tracer.startActiveSpan(
    `HTTP ${method}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "http.request.method": method,
        "server.address": target.hostname,
        "url.full": `${target.origin}${target.pathname}`,
      },
    },
    async (span) => {
      try {
        const carrier: Record<string, string> = {};
        propagation.inject(context.active(), carrier);
        const headers = new Headers(init.headers);
        for (const [key, value] of Object.entries(carrier)) headers.set(key, value);
        const response = await fetch(url, { ...init, headers });
        span.setAttribute("http.response.status_code", response.status);
        if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
        return response;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

/** Register with the SDK so that every span starts with the request context. */
export class RequestContextProcessor implements SpanProcessor {
  onStart(span: SdkSpan, _parent: Context): void {
    const store = requestContext.getStore();
    if (store) span.setAttributes(store.fields);
  }
  onEnd(_span: ReadableSpan): void {}
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
```
