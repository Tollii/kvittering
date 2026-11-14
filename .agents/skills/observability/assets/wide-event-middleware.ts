// Template for the wide-event middleware, shown for a Hono-style framework.
// Adapt it to the project's framework, schema and logger. The same shape wraps
// every other unit of work: a job run, a consumed message, a webhook, a CLI
// command.

import { trace } from "@opentelemetry/api";
import type { Context, Next } from "hono";
import { logger } from "./logger"; // the project's one logger, single-line JSON

type FieldValue = string | number | boolean;
type WideEvent = Record<string, FieldValue | undefined>;

const SLOW_MS = Number(process.env.WIDE_EVENT_SLOW_MS ?? 2000); // start near the p99
const SAMPLE_RATE = Number(process.env.WIDE_EVENT_SAMPLE_RATE ?? 1); // keep everything by default

export const wideEvent = () => async (c: Context, next: Next) => {
  const start = Date.now();
  const event = newEvent(c);
  c.set("event", event);
  try {
    await next();
    event.status_code = c.res.status;
    event.outcome = c.res.status < 500 ? "success" : "error";
  } catch (err) {
    event.status_code = 500;
    event.outcome = "error";
    Object.assign(event, describe(err));
    throw err;
  } finally {
    // Exactly one event per request, on success and on failure alike.
    event.duration_ms = Date.now() - start;
    if (shouldKeep(event)) logger.info(event);
  }
};

/** Request, deployment and trace fields. Handlers add the business fields. */
function newEvent(c: Context): WideEvent {
  const span = trace.getActiveSpan()?.spanContext();
  return {
    timestamp: new Date().toISOString(),
    request_id: c.req.header("x-request-id") ?? crypto.randomUUID(),
    trace_id: span?.traceId,
    span_id: span?.spanId,
    method: c.req.method,
    route: c.req.routePath, // the pattern, never the raw path
    service: process.env.OTEL_SERVICE_NAME,
    version: process.env.SERVICE_VERSION,
    commit: process.env.COMMIT_SHA,
    environment: process.env.NODE_ENV,
    region: process.env.REGION,
  };
}

/**
 * The one function handlers call. It writes each field to the wide event and
 * to the root span, so the trace and the event always agree.
 */
export function enrich(c: Context, fields: Record<string, FieldValue>): void {
  Object.assign(c.get("event") as WideEvent, fields);
  // Assumes the middleware runs inside the request's root span. If handlers
  // run in child spans, keep a reference to the root span in request context.
  trace.getActiveSpan()?.setAttributes(fields);
}

/** Error fields. Ids and codes, never bodies, headers or secrets. */
function describe(err: unknown): WideEvent {
  const error = err instanceof Error ? err : new Error(String(err));
  const details = error as Error & { code?: string; retriable?: boolean };
  return {
    error_type: error.name,
    error_message: error.message,
    error_code: details.code,
    error_retriable: details.retriable,
  };
}

/**
 * Decided after the request ends. Errors, slow requests and flagged cases are
 * always kept; the sample rate applies only to the rest.
 */
function shouldKeep(event: WideEvent): boolean {
  if (event.outcome === "error") return true;
  if (Number(event.duration_ms) >= SLOW_MS) return true;
  if (event.keep === true) return true; // set through enrich() for flagged tenants, test accounts, rollouts
  return Math.random() < SAMPLE_RATE;
}
