import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { SpanKind, context, type Span } from "@opentelemetry/api";
import { getFunctionAddress } from "convex/server";
import type { Value } from "convex/values";
import {
  query as rawQuery,
  internalQuery as rawInternalQuery,
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
  action as rawAction,
  internalAction as rawInternalAction,
  httpAction as rawHttpAction,
  type ActionCtx,
} from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { updateReceiptReadModel } from "./receiptReadModel";
import "./tracing";
import {
  incomingTraceContext,
  setRequestAttributes,
  traced,
  type RequestAttributes,
  tracedRequest,
} from "../src/lib/tracing";

/**
 * The application's Convex function builders. Each one traces its handler
 * where the function is defined: a root span per call, named after the
 * function, with its outcome and request context. Import these instead of
 * the generated builders; the `kvitto/traced-exports` lint rule enforces it.
 */

type FunctionKind = "query" | "mutation" | "action";

type Metadata = {
  getFunctionMetadata(): Promise<{ name: string; visibility: string }>;
  getRequestMetadata?(): Promise<{
    requestId: string;
    scheduledFunctionId: string | null;
  }>;
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

    if (metadata) {
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
    console.warn("trace.metadata_unavailable", { error: String(error) });
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
        parent: context.active(),
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

function tracedBuilder<Builder>(kind: FunctionKind, builder: Builder): Builder {
  // SAFETY: every Convex builder takes a handler or a definition with one.
  const build = builder as Build;

  const tracedBuild: Build = (definition) =>
    build(tracedDefinition(kind, definition));

  // SAFETY: the traced builder accepts and returns exactly what the wrapped one does.
  return tracedBuild as Builder;
}

const triggers = new Triggers<DataModel>();

triggers.register("receipts", async (ctx, change) => {
  await updateReceiptReadModel(
    ctx,
    change.newDoc ?? change.oldDoc,
    change.operation === "delete",
  );
});

// A deleted receipt takes its imported evidence with it.
triggers.register("receipts", async (ctx, change) => {
  if (change.operation !== "delete") return;

  const imported = await ctx.db
    .query("receiptImports")
    .withIndex("by_receiptId", (q) => q.eq("receiptId", change.id))
    .unique();

  if (!imported) return;

  switch (imported.provider) {
    case "oda":
      // The order number stays, so the next sync does not bring the receipt back.
      await ctx.db.patch("receiptImports", imported._id, {
        receiptId: undefined,
        data: undefined,
      });
      break;
    case "manual":
      await ctx.db.delete("receiptImports", imported._id);
      break;
  }
});

export const query = tracedBuilder("query", rawQuery);

export const internalQuery = tracedBuilder("query", rawInternalQuery);

export const mutation = tracedBuilder(
  "mutation",
  customMutation(rawMutation, customCtx(triggers.wrapDB)),
);

export const internalMutation = tracedBuilder(
  "mutation",
  customMutation(rawInternalMutation, customCtx(triggers.wrapDB)),
);

export const action = tracedBuilder("action", rawAction);

export const internalAction = tracedBuilder("action", rawInternalAction);

function httpOutcome(response: Response) {
  if (response.status >= 500) return "failure";

  return response.status >= 400 ? "expected_failure" : "success";
}

type HttpHandler = (ctx: ActionCtx, request: Request) => Promise<Response>;

/**
 * An HTTP action that continues the caller's trace from its W3C
 * `traceparent` header. The span names the method and path; query strings
 * stay out because they carry ids and tokens.
 */
export function httpAction(handler: HttpHandler) {
  return rawHttpAction((ctx, request) => {
    const path = /^[a-z]+:\/\/[^/]+(\/[^?#]*)/i.exec(request.url)?.[1] ?? "/";

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
        outcome: httpOutcome,
      },
      async (span) => {
        const account = await caller(ctx);

        if (account) setRequestAttributes({ "user.id": account });

        const response = await handler(withTracedCalls(ctx), request);

        span.setAttribute("http.response.status_code", response.status);

        return response;
      },
    );
  });
}
