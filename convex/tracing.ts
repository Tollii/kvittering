import { AsyncLocalStorage } from "node:async_hooks";
import {
  ROOT_CONTEXT,
  SpanKind,
  context as otelContext,
  type Context,
  type ContextManager,
  type Span,
} from "@opentelemetry/api";
import {
  StackContextManager,
  type ReadableSpan,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace";
import {
  getFunctionAddress,
  type FunctionMetadata,
  type RequestMetadata,
} from "convex/server";
import type { Value } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { errorDetails } from "../src/lib/diagnostics";
import {
  annotateFailure,
  defectKey,
  handledFailuresKey,
  httpOutcome,
  incomingTraceContext,
  setRequestAttributes,
  traced,
  type RequestContext,
  tracedRequest,
  type RequestAttributes,
} from "../src/lib/tracing";
import {
  installTracing,
  requestContextOfSpan,
  spanRecord,
} from "../src/lib/tracing/sdk";

/**
 * Backend telemetry stays in the Convex logs; the free plan has no log
 * streams, and queries and mutations cannot make network requests. Each
 * function call writes one wide event, a `request.completed` line with its
 * outcome, timing, account, household, and the business context its handler
 * added with `annotate`. Search the logs by trace id to follow one request,
 * including the app's half of it, which carries the same trace id.
 * `OTEL_TRACES_EXPORTER=none` turns the lines off; spans are still recorded
 * so trace context keeps flowing.
 */

/**
 * Keeps the active span across `await`. Convex provides AsyncLocalStorage in
 * both runtimes: the isolate as a global that the bundler maps
 * `node:async_hooks` to, and Node actions natively.
 */
class AsyncContextManager implements ContextManager {
  #storage = new AsyncLocalStorage<Context>();

  active() {
    return this.#storage.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.#storage.run(context, () => fn.apply(thisArg, args));
  }

  bind<T>(context: Context, target: T): T {
    if (!(target instanceof Function)) return target;

    const run = (...args: unknown[]) =>
      // oxlint-disable-next-line typescript/no-unsafe-return -- bind forwards any function's result unchanged.
      this.with(context, () => target.apply(undefined, args));

    // SAFETY: run forwards target's arguments and result unchanged.
    return run as T;
  }

  enable() {
    return this;
  }

  disable() {
    this.#storage.disable();

    return this;
  }
}

/**
 * An isolate without the global makes the constructor throw; then spans keep
 * their parent only until the first await, and requests still log.
 */
function contextManager(): ContextManager {
  try {
    return new AsyncContextManager();
  } catch (error) {
    console.error("trace.async_context_unavailable", {
      errorType: errorDetails(error).errorType,
    });

    return new StackContextManager();
  }
}

/**
 * Inner spans one request may keep for its log. Convex keeps a bounded
 * number of log lines per execution, and a request that saves hundreds of
 * rows must not crowd out its own diagnostics.
 */
const loggedInnerSpans = 64;

/** A request at least this slow logs its inner spans. Queries and mutations run on a frozen clock and never are. */
const slowRequestMs = 2000;

/**
 * The share of ordinary requests that log their inner spans too. The choice
 * follows the trace id, so the app's half of a sampled trace matches.
 */
const detailSampleRate = 0.05;

type SpanLine = Omit<ReturnType<typeof spanRecord>, "start" | "end">;

type RequestDetail = { spans: SpanLine[]; omitted: number; failed: boolean };

function sampled(traceId: string) {
  return Number.parseInt(traceId.slice(-8), 16) / 2 ** 32 < detailSampleRate;
}

/**
 * Writes one wide event per request: its root span, enriched with the
 * request's business context and the deployed commit, as a
 * `request.completed` line. Inner spans are
 * tail-sampled once the request ends: a failed span logs right away, and the
 * rest log only when the request failed, handled a failure, was slow, or is
 * in the sample. The root counts the spans it left out.
 */
class LogSpanProcessor implements SpanProcessor {
  #details = new WeakMap<RequestContext, RequestDetail>();

  /** Requests whose line is written; a span that ends after it logs on its own. */
  #finished = new WeakSet<RequestContext>();

  onStart() {}

  onEnd(span: ReadableSpan) {
    if (process.env.OTEL_TRACES_EXPORTER === "none") return;

    const request = requestContextOfSpan(span);
    const { start: _start, end: _end, ...record } = spanRecord(span);

    // Only a request's own spans are held; a span outside one logs as it ends.
    if (!request || this.#finished.has(request))
      console.info("trace.span", record);
    else if (!span.parentSpanContext || span.parentSpanContext.isRemote) {
      const detail = this.#details.get(request);

      this.#details.delete(request);
      this.#finished.add(request);
      this.#logRequest(span, record, detail);
    } else this.#holdInner(request, record);
  }

  /** Logs a failed inner span right away and holds the rest until the request ends. */
  #holdInner(request: RequestContext, record: SpanLine) {
    const detail = this.#details.get(request) ?? {
      spans: [],
      omitted: 0,
      failed: false,
    };

    this.#details.set(request, detail);

    if (record.failed) {
      detail.failed = true;
      console.info("trace.span", record);
    } else if (detail.spans.length < loggedInnerSpans)
      detail.spans.push(record);
    else detail.omitted += 1;
  }

  #logRequest(span: ReadableSpan, record: SpanLine, detail?: RequestDetail) {
    if (detail) {
      const handled = Number(record.attributes[handledFailuresKey] ?? 0);

      // A failed request's outcome is a failure too.
      const keep =
        detail.failed ||
        handled > 0 ||
        record.attributes["kvitto.outcome"] !== "success" ||
        record.durationMs >= slowRequestMs ||
        sampled(span.spanContext().traceId);

      if (keep) {
        for (const inner of detail.spans) console.info("trace.span", inner);

        if (detail.omitted)
          record.attributes["kvitto.spans.omitted"] = detail.omitted;
      } else
        record.attributes["kvitto.spans.unlogged"] =
          detail.spans.length + detail.omitted;
    }

    const { attributes: resource } = span.resource;

    const line = {
      ...record,
      service: resource["service.name"],
      commit: resource["service.version"],
      environment: resource["deployment.environment.name"],
    };

    // Two levels: error for a defect, info for everything else, including
    // refusals and handled failures, which the line's fields describe.
    if (record.failed || record.attributes[defectKey] === true)
      console.error("request.completed", line);
    else console.info("request.completed", line);
  }

  forceFlush() {
    return Promise.resolve();
  }

  shutdown() {
    return Promise.resolve();
  }
}

installTracing({
  resource: {
    "service.name": "kvitto-backend",
    // The release tool sets it after each deploy; development has none.
    "service.version": process.env.BACKEND_COMMIT ?? "unknown",
    // Read without validation: a bad value must not stop every function from loading.
    "deployment.environment.name": process.env.RELEASE_CHANNEL ?? "development",
  },
  contextManager: contextManager(),
  processor: new LogSpanProcessor(),
});

type FunctionKind = "query" | "mutation" | "action";

/**
 * Convex's metadata API. Queries have no request metadata, and convex-test
 * leaves out some fields, so every part is read as optional.
 */
type Metadata = {
  getFunctionMetadata(): Promise<Partial<FunctionMetadata>>;
  getRequestMetadata?(): Promise<Partial<RequestMetadata>>;
};

/** What the tracing reads from any function's context. */
type TracedCtx = {
  meta?: Metadata;
  auth: { getUserIdentity(): Promise<{ subject: string } | null> };
  runQuery?: ActionCtx["runQuery"];
  runMutation?: ActionCtx["runMutation"];
  runAction?: ActionCtx["runAction"];
};

type Handler = (ctx: TracedCtx, ...args: never[]) => Promise<Value | undefined>;

type Definition = Handler | { handler: Handler };

type Build = (definition: Definition) => object;

/** Names the span and attaches what the request says about itself. */
async function describe(span: Span, kind: FunctionKind, ctx: TracedCtx) {
  const attributes: RequestAttributes = {};

  try {
    const metadata = await ctx.meta?.getFunctionMetadata();

    if (metadata?.name) {
      span.updateName(metadata.name);
      attributes["kvitto.function.name"] = metadata.name;
      attributes["kvitto.function.visibility"] = metadata.visibility;
    }

    // Queries have no request metadata.
    const request =
      kind === "query" ? undefined : await ctx.meta?.getRequestMetadata?.();

    if (request) {
      attributes["convex.request.id"] = request.requestId;

      if (request.scheduledFunctionId)
        attributes["kvitto.scheduled_function.id"] =
          request.scheduledFunctionId;
    }
  } catch (error) {
    // Handled: a runtime without metadata still runs the function, unnamed.
    annotateFailure("trace.metadata", error);
  }

  // Queries learn the account from the access check instead, so a query that
  // never reads the identity stays shared across accounts in Convex's cache.
  if (kind !== "query") {
    const account = await caller(ctx);

    if (account) attributes["user.id"] = account;
  }

  setRequestAttributes(attributes);
}

/** The called function's name, including functions of components such as Better Auth. */
function calledName(
  reference:
    | Parameters<ActionCtx["runQuery"]>[0]
    | Parameters<ActionCtx["runMutation"]>[0]
    | Parameters<ActionCtx["runAction"]>[0],
) {
  try {
    const address = getFunctionAddress(reference);

    if (address.name !== undefined) return String(address.name);

    return (
      address.reference?.replace(/^_reference\/childComponent\//, "") ??
      "function handle"
    );
  } catch {
    // Handled: the call itself reports a reference that is not a function.
    return "unknown";
  }
}

type CallArgs = readonly [Parameters<typeof calledName>[0], ...unknown[]];

function calledFunction(operation: string) {
  return {
    name: ([reference]: CallArgs) => `${operation} ${calledName(reference)}`,
    attributes: ([reference]: CallArgs) => ({
      "kvitto.function.called": calledName(reference),
    }),
  };
}

/** Calls to other Convex functions, each with its own span. */
function withTracedCalls<Ctx extends TracedCtx>(ctx: Ctx): Ctx {
  const { runQuery, runMutation, runAction } = ctx;

  return {
    ...ctx,
    ...(runQuery && {
      runQuery: traced(
        "convex.runQuery",
        runQuery,
        calledFunction("convex.runQuery"),
      ),
    }),
    ...(runMutation && {
      runMutation: traced(
        "convex.runMutation",
        runMutation,
        calledFunction("convex.runMutation"),
      ),
    }),
    ...(runAction && {
      runAction: traced(
        "convex.runAction",
        runAction,
        calledFunction("convex.runAction"),
      ),
    }),
  };
}

/** The account behind a call, or nothing when it has none or its token does not verify. */
async function caller(ctx: TracedCtx) {
  try {
    return (await ctx.auth.getUserIdentity())?.subject;
  } catch {
    // Handled: the handler's own access check decides what an unverified token may do.
    return undefined;
  }
}

function tracedHandler(kind: FunctionKind, handler: Handler): Handler {
  return (ctx, ...args) =>
    tracedRequest(
      kind,
      {
        kind: SpanKind.SERVER,
        parent: otelContext.active(),
        attributes: { "kvitto.function.type": kind },
      },
      async (span) => {
        await describe(span, kind, ctx);

        return handler(withTracedCalls(ctx), ...args);
      },
    );
}

function tracedDefinition(kind: FunctionKind, definition: Definition) {
  return definition instanceof Function
    ? tracedHandler(kind, definition)
    : { ...definition, handler: tracedHandler(kind, definition.handler) };
}

export function tracedBuilder<Builder>(
  kind: FunctionKind,
  builder: Builder,
): Builder {
  // SAFETY: every Convex builder takes a handler or a definition with one.
  const build = builder as Build;

  const tracedBuild: Build = (definition) =>
    build(tracedDefinition(kind, definition));

  // SAFETY: the traced builder accepts and returns exactly what the wrapped one does.
  return tracedBuild as Builder;
}

export type HttpHandler = (
  ctx: ActionCtx,
  request: Request,
) => Promise<Response>;

/**
 * An HTTP action that continues the caller's trace from its W3C
 * `traceparent` header. The span names the method and path; query strings
 * stay out because they carry ids and tokens.
 */
export function tracedHttpHandler(handler: HttpHandler): HttpHandler {
  return (ctx, request) => {
    const path = new URL(request.url).pathname;

    return tracedRequest(
      `HTTP ${request.method} ${path}`,
      {
        kind: SpanKind.SERVER,
        parent: incomingTraceContext(request.headers),
        attributes: {
          "kvitto.function.type": "http",
          "http.request.method": request.method,
          "url.path": path,
        },
        outcome: (response) => httpOutcome(response.status),
      },
      async (span) => {
        const account = await caller(ctx);

        if (account) setRequestAttributes({ "user.id": account });

        const response = await handler(withTracedCalls(ctx), request);

        span.setAttribute("http.response.status_code", response.status);

        return response;
      },
    );
  };
}
