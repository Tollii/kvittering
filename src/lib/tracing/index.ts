import {
  context,
  createContextKey,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
} from "@opentelemetry/api";
import { errorDetails } from "../diagnostics";

/**
 * Tracing for the app and the backend. Functions are traced where they are
 * defined: `traced` wraps an exported async function, and the backend's
 * function builders wrap every Convex handler. Spans carry identifiers and
 * measurements only, never receipt contents, error messages, or addresses.
 *
 * Without a registered tracer provider every span is a no-op, so tests and
 * development builds pay almost nothing.
 */

const tracer = trace.getTracer("kvitto");

/** How a traced call ended. Expected failures are ones a person can act on. */
export type Outcome = "success" | "expected_failure" | "failure";

/**
 * Attributes that describe the request a span belongs to, such as the
 * account and household. The span processor copies them onto every span
 * of the request, including spans that started before they were known.
 */
export type RequestContext = {
  attributes: Attributes;
  /** The backend request's wide event: business context for its root span only. */
  event?: Attributes;
};

export const requestContextKey = createContextKey("kvitto.request");

/** The request context of a span's parent. */
export function requestContextOf(parent: Context) {
  // SAFETY: tracedRequest and the app's root context store only RequestContext values under this key.
  return parent.getValue(requestContextKey) as RequestContext | undefined;
}

/**
 * Attach request attributes once they are known, for example the household
 * after an access check. `undefined` removes an attribute.
 */
export type RequestAttributes = Record<
  string,
  string | number | boolean | undefined
>;

export function setRequestAttributes(attributes: RequestAttributes) {
  const request = requestContextOf(context.active());

  for (const [key, value] of Object.entries(attributes)) {
    if (request) {
      if (value === undefined) delete request.attributes[key];
      else request.attributes[key] = value;
    }

    if (value !== undefined) trace.getActiveSpan()?.setAttribute(key, value);
  }
}

/**
 * The opaque account and household ids behind a request: the Better Auth
 * user id and the Convex household id, the same ids PostHog events use. The
 * household is Kvitto's tenant, the closest thing it has to a business id.
 */
export function setRequester(userId: string | undefined, householdId?: string) {
  setRequestAttributes({
    "user.id": userId,
    "kvitto.household.id": householdId,
  });
}

/**
 * A field of a backend request's wide event. Fields stay in Kvitto's own
 * namespace, which the export allowlist keeps, and hold identifiers, counts,
 * measurements, and settled states, never receipt text or error messages.
 */
export type EventFields = Partial<
  Record<`kvitto.${string}`, string | number | boolean | undefined>
>;

function requestEvent() {
  return requestContextOf(context.active())?.event;
}

/**
 * Adds business context to the wide event of the backend request that is
 * running: one log line per function call, written when it ends, instead of
 * a line for each step. A later value replaces an earlier one, and
 * `undefined` removes it. Outside a backend request it does nothing.
 */
export function annotate(fields: EventFields) {
  const event = requestEvent();

  if (!event) return;

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete event[key];
    else event[key] = value;
  }
}

/** Adds to a count on the wide event, for work a request repeats, such as each model call. */
export function count(key: `kvitto.${string}`, amount = 1) {
  const event = requestEvent();

  if (!event) return;
  event[key] = Number(event[key] ?? 0) + amount;
}

/**
 * Records a failure the request handled and outlived, such as a provider it
 * fell back from. The request keeps its outcome, but its line is logged as a
 * warning. Pass the caught error, or a code for a failure without one; only
 * the error's type, code, and status are kept.
 */
export function annotateFailure(operation: string, cause: unknown) {
  const details =
    cause instanceof Object
      ? errorDetails(cause)
      : { errorType: String(cause), code: undefined, status: undefined };

  annotate({
    [`kvitto.${operation}.error.type`]: details.code ?? details.errorType,
    [`kvitto.${operation}.error.status`]: details.status,
  });
  count("kvitto.failures.handled");
}

export function outcomeOf(cause: unknown): Outcome {
  return errorDetails(cause).expected ? "expected_failure" : "failure";
}

function recordFailure(span: Span, cause: unknown) {
  const details = errorDetails(cause);

  span.setAttribute("kvitto.outcome", outcomeOf(cause));
  span.setAttribute("error.type", details.code ?? details.errorType);

  if (details.status !== undefined)
    span.setAttribute("kvitto.error.status", details.status);

  if (details.requestId)
    span.setAttribute("convex.request.id", details.requestId);

  // A person can act on an expected failure, so it is not a defect. Error
  // messages stay out: provider and model messages can quote receipt text.
  if (!details.expected) span.setStatus({ code: SpanStatusCode.ERROR });
}

/**
 * Ends the span when the work settles and records how it ended. A function
 * that throws before returning its promise rejects instead, as an async one would.
 */
async function settle<T>(
  span: Span,
  run: () => PromiseLike<T>,
  outcome?: (result: T) => Outcome,
): Promise<T> {
  try {
    const result = await run();
    const ended = outcome?.(result) ?? "success";

    span.setAttribute("kvitto.outcome", ended);

    if (ended === "failure") span.setStatus({ code: SpanStatusCode.ERROR });

    return result;
  } catch (cause) {
    recordFailure(span, cause);
    throw cause;
  } finally {
    span.end();
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-returns -- traced accepts any async function and keeps its exact type.
type AsyncFunction = (...args: never[]) => PromiseLike<unknown>;

type Result<F extends AsyncFunction> = Awaited<ReturnType<F>>;

export type TraceOptions<F extends AsyncFunction> = {
  kind?: SpanKind;
  /** Names the span from the call, for example by the Convex function it calls. */
  name?: (args: Parameters<F>) => string;
  attributes?: (args: Parameters<F>) => Attributes;
  outcome?: (result: Result<F>) => Outcome;
};

/**
 * Wraps an async function where it is defined, so every call records a span
 * with its outcome. The span is active while the call runs, so traced
 * functions it calls become children. Hermes has no async context, so in the
 * app only calls made before the first `await` find their parent; later ones
 * start their own trace with the same request attributes.
 */
export function traced<F extends AsyncFunction>(
  name: string,
  fn: F,
  options: TraceOptions<F> = {},
): F {
  function tracedCall(this: ThisParameterType<F>, ...args: Parameters<F>) {
    const attributes: Attributes = {
      "code.function.name": name,
      ...options.attributes?.(args),
    };

    return tracer.startActiveSpan(
      options.name?.(args) ?? name,
      { kind: options.kind ?? SpanKind.INTERNAL, attributes },
      (span) =>
        settle(
          span,
          // SAFETY: fn is F, so its promise resolves to F's result.
          () => fn.apply(this, args) as PromiseLike<Result<F>>,
          options.outcome,
        ),
    );
  }

  // SAFETY: tracedCall takes F's parameters and returns a promise of F's result.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- TypeScript cannot relate a wrapper to an arbitrary function type.
  return tracedCall as unknown as F;
}

/**
 * Starts the root span of one backend request with its own request context,
 * so attributes set during the request never reach another one. The root
 * span is the request's wide event: `annotate` adds to it while it runs.
 */
export function tracedRequest<T>(
  name: string,
  {
    kind,
    parent,
    attributes,
    outcome,
  }: {
    kind: SpanKind;
    parent: Context;
    attributes: Attributes;
    outcome?: (result: T) => Outcome;
  },
  run: (span: Span) => Promise<T>,
): Promise<T> {
  const request: RequestContext = { attributes: {}, event: {} };

  return tracer.startActiveSpan(
    name,
    { kind, attributes },
    parent.setValue(requestContextKey, request),
    (span) =>
      settle(
        span,
        async () => {
          try {
            return await run(span);
          } finally {
            span.setAttributes(request.event ?? {});
          }
        },
        outcome,
      ),
  );
}

/**
 * W3C trace headers for the active span. Read them before the first `await`
 * in the app, where the active span is lost after it.
 */
export function traceHeaders() {
  const headers: Record<string, string> = {};

  propagation.inject(context.active(), headers);

  return headers;
}

/** The context that an incoming request's W3C trace headers continue. */
export function incomingTraceContext(headers: Headers) {
  // A caller's `tracestate` is not passed on to the services this request calls.
  return propagation.extract(context.active(), headers, {
    keys: (carrier) => [...carrier.keys()],
    get: (carrier, key) =>
      key === "tracestate" ? undefined : (carrier.get(key) ?? undefined),
  });
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
}

const host = /^[a-z][a-z\d+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]+)/i;

/** The host only; React Native's URL implementation lacks some getters. */
function requestHost(input: RequestInfo | URL) {
  const address =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : input;

  return host.exec(address)?.[1]?.toLowerCase() ?? "unknown";
}

/** Merges the trace headers in without dropping the caller's headers in any HeadersInit form. */
function withTraceHeaders(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  headers: Record<string, string>,
) {
  const merged = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );

  for (const [key, value] of Object.entries(headers)) merged.set(key, value);

  return { ...init, headers: merged };
}

/** The outcome of a response this process sends: a refused request is the caller's to fix. */
export function httpOutcome(status: number): Outcome {
  if (status >= 500) return "failure";

  return status >= 400 ? "expected_failure" : "success";
}

/**
 * The outcome of a response this process received. A service that refuses
 * our request as malformed or unauthorized points at a fault here, so only
 * a missing resource, a conflict, or a rate limit counts as expected.
 */
function responseOutcome(status: number): Outcome {
  if (status < 400) return "success";

  return [404, 409, 429].includes(status) ? "expected_failure" : "failure";
}

export type Fetch = typeof fetch;

/**
 * The global `fetch` with a client span. The span names the host and
 * method, never the path or query, which can carry identifiers or tokens.
 * `propagate` sends the W3C trace headers to the called service.
 */
function fetchTracer(propagate: boolean): Fetch {
  return traced(
    "http.request",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      // Hermes loses the active span at the first await.
      const span = trace.getActiveSpan();

      // Resolved per call, so tests can replace the global.
      const response = await fetch(
        input,
        propagate ? withTraceHeaders(input, init, traceHeaders()) : init,
      );

      span?.setAttribute("http.response.status_code", response.status);

      return response;
    },
    {
      kind: SpanKind.CLIENT,
      name: ([input, init]) => `HTTP ${requestMethod(input, init)}`,
      attributes: ([input, init]) => ({
        "http.request.method": requestMethod(input, init),
        "server.address": requestHost(input),
      }),
      outcome: (response) => responseOutcome(response.status),
    },
  );
}

/** `fetch`, traced, forwarding the trace to the called service. */
export const tracedFetch = fetchTracer(true);

/**
 * `fetch`, traced, without trace headers: for services that ignore them,
 * where a browser would ask the service to allow a new header.
 */
export const tracedFetchWithoutHeaders = fetchTracer(false);
