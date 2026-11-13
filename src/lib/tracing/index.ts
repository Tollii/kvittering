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
export type RequestContext = { attributes: Attributes };

export const requestContextKey = createContextKey("kvitto.request");

let ambientRequest: RequestContext | undefined;

/**
 * The app has one person at a time, so its spans share one request context
 * instead of one per request. The backend never sets this: its requests run
 * side by side and must not share attributes.
 */
export function shareRequestContext() {
  ambientRequest ??= { attributes: {} };

  return ambientRequest;
}

/** The request context of a span's parent, or the app's shared one. */
export function requestContextOf(parent: Context) {
  // SAFETY: only tracedRequest stores a value under this key, a RequestContext.
  const request = parent.getValue(requestContextKey) as
    | RequestContext
    | undefined;

  return request ?? ambientRequest;
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
 * so attributes set during the request never reach another one.
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
  const request: RequestContext = { attributes: {} };

  return tracer.startActiveSpan(
    name,
    { kind, attributes },
    parent.setValue(requestContextKey, request),
    (span) => settle(span, () => run(span), outcome),
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
  return propagation.extract(context.active(), headers, {
    keys: (carrier) => [...carrier.keys()],
    get: (carrier, key) => carrier.get(key) ?? undefined,
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

export type FetchTracing = {
  /**
   * Whether to send W3C trace headers. Leave them off for services that
   * ignore them where a browser would ask the service to allow a new header.
   */
  propagate: boolean;
};

/**
 * `fetch` with a client span that forwards the trace to the called service.
 * The span names the host and method, never the path or query, which can
 * carry identifiers or tokens.
 */
export function tracedFetchWith(
  request: typeof fetch,
  tracing: FetchTracing = { propagate: true },
): typeof fetch {
  return traced(
    "http.request",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      // Hermes loses the active span at the first await.
      const span = trace.getActiveSpan();

      const response = await request(
        input,
        tracing.propagate
          ? withTraceHeaders(input, init, traceHeaders())
          : init,
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
      outcome: (response) =>
        response.status >= 500
          ? "failure"
          : response.status >= 400
            ? "expected_failure"
            : "success",
    },
  );
}

// Resolved per call, so tests can replace the global.
const globalFetch: typeof fetch = (input, init) => fetch(input, init);

/** The global `fetch`, traced, forwarding the trace to the called service. */
export const tracedFetch = tracedFetchWith(globalFetch);

/** The global `fetch`, traced, for services that ignore trace headers. */
export const tracedFetchWithoutHeaders = tracedFetchWith(globalFetch, {
  propagate: false,
});
