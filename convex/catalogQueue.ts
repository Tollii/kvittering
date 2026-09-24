import { userError } from "./userErrors";
import { consumeWorkQuota, type QuotaActor } from "./rateLimits";
import { featureEnabled } from "./featureFlags";
import { v } from "convex/values";
import { Workpool, vOnCompleteArgs } from "@convex-dev/workpool";
import {
  createEvent,
  sendEvent,
  vEventId,
  vWorkflowId,
} from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalQuery, type MutationCtx } from "./_generated/server";
import { internalMutation } from "./serverFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  catalogRequestValidator,
  catalogResultValidator,
  emptyCatalogResult,
  type CatalogRequest,
  type CatalogProduct,
} from "../src/lib/catalog/model";
import {
  normalizeRequest,
  requestKey,
  resultLifetime,
} from "../src/lib/catalog/policy";

const pool = new Workpool(components.catalogWorkpool, {
  maxParallelism: 4,
  retryActionsByDefault: false,
});

async function enqueue(
  ctx: MutationCtx,
  id: Id<"catalogRequests">,
  runAt = Date.now(),
) {
  await ctx.db.patch("catalogRequests", id, {
    state: "pending",
    scheduledAt: runAt,
  });
  await pool.enqueueAction(
    ctx,
    internal.catalogWorker.execute,
    { id },
    {
      runAt,
      retry: false,
      onComplete: internal.catalogQueue.completed,
      onCompleteExcludeKinds: ["success"],
      context: { id },
    },
  );
}

/** One transactional cache entry is shared by all households and simultaneous requests. */
/** A pending or running request will produce a result; start no other. */
function isRequestInFlight(state: Doc<"catalogRequests">["state"]): boolean {
  return state === "pending" || state === "running";
}

export async function ensureRequest(
  ctx: MutationCtx,
  input: CatalogRequest,
  options?: { payer: QuotaActor; interactive?: boolean },
): Promise<Doc<"catalogRequests">> {
  if (!(await featureEnabled(ctx, "productLookup")))
    throw userError("Produktkatalogen er midlertidig satt på pause.");
  const request = normalizeRequest(input);
  const key = requestKey(request);

  const existing = await ctx.db
    .query("catalogRequests")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (
    existing &&
    (isRequestInFlight(existing.state) || existing.expiresAt > Date.now())
  ) {
    console.info("catalog.request_reused", {
      requestId: existing._id,
      kind: request.kind,
      state: existing.state,
    });

    return existing;
  }

  if (options?.interactive)
    await consumeWorkQuota(ctx, options.payer, "catalog");

  const values = {
    payer: options
      ? {
          identity: options.payer.identity,
          householdId: options.payer.householdId,
        }
      : undefined,
    key,
    request,
    state: "pending" as const,
    result: existing?.result ?? emptyCatalogResult(),
    fetchedAt: existing?.fetchedAt,
    expiresAt: 0,
    attempts: 0,
    scheduledAt: Date.now(),
  };

  const id = existing?._id ?? (await ctx.db.insert("catalogRequests", values));

  if (existing) await ctx.db.replace("catalogRequests", id, values);
  await enqueue(ctx, id);
  console.info("catalog.request_queued", {
    requestId: id,
    kind: request.kind,
    refresh: !!existing,
  });

  const saved = await ctx.db.get("catalogRequests", id);

  if (!saved) throw new Error("Catalog request was not saved.");

  return saved;
}

export const request = internalMutation({
  args: { request: catalogRequestValidator },
  returns: v.id("catalogRequests"),
  handler: async (ctx, { request }) => (await ensureRequest(ctx, request))._id,
});

export const requestForWorkflow = internalMutation({
  args: {
    request: catalogRequestValidator,
    workflowId: vWorkflowId,
    receiptId: v.id("receipts").optional(),
  },
  returns: v.object({
    id: v.id("catalogRequests"),
    eventId: v.union(vEventId(), v.null()),
  }),
  handler: async (ctx, args) => {
    const receipt = args.receiptId
      ? await ctx.db.get("receipts", args.receiptId)
      : null;

    if (args.receiptId && !receipt)
      throw new Error("Receipt no longer exists.");

    const request = await ensureRequest(
      ctx,
      args.request,
      receipt
        ? {
            payer: {
              identity: receipt.uploadedBy,
              householdId: receipt.householdId,
            },
          }
        : undefined,
    );

    if (request.state === "ready" || request.state === "error")
      return { id: request._id, eventId: null };

    const eventId = await createEvent(ctx, components.workflow, {
      name: "catalog-ready",
      workflowId: args.workflowId,
    });

    await ctx.db.insert("catalogRequestWaiters", {
      requestId: request._id,
      eventId,
    });

    return { id: request._id, eventId };
  },
});

export const read = internalQuery({
  args: { id: v.id("catalogRequests") },
  returns: v.union(schema.doc("catalogRequests"), v.null()),
  handler: (ctx, { id }) => ctx.db.get("catalogRequests", id),
});

export const claim = internalMutation({
  args: { id: v.id("catalogRequests") },
  returns: v.union(catalogRequestValidator, v.null()),
  handler: async (ctx, { id }) => {
    const request = await ctx.db.get("catalogRequests", id);

    if (!request || request.state !== "pending") return null;

    if (!(await featureEnabled(ctx, "productLookup"))) {
      await ctx.db.patch("catalogRequests", id, {
        state: "error",
        error: "Produktkatalogen er midlertidig satt på pause.",
        expiresAt: Date.now() + 60_000,
      });
      await ctx.scheduler.runAfter(0, internal.catalogQueue.notify, { id });

      return null;
    }

    await ctx.db.patch("catalogRequests", id, {
      state: "running",
      attempts: request.attempts + 1,
    });

    return request.request;
  },
});

export const notify = internalMutation({
  args: { id: v.id("catalogRequests") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const waiters = await ctx.db
      .query("catalogRequestWaiters")
      .withIndex("by_requestId", (q) => q.eq("requestId", id))
      .take(50);

    for (const waiter of waiters) {
      try {
        await sendEvent(ctx, components.workflow, { id: waiter.eventId });
      } catch (cause) {
        // The installed workflow API reports this when retention has removed the event.
        if (
          !(cause instanceof Error) ||
          !cause.message.includes(`Event not found: ${waiter.eventId}`)
        )
          throw cause;
      }

      await ctx.db.delete("catalogRequestWaiters", waiter._id);
    }

    if (waiters.length === 50)
      await ctx.scheduler.runAfter(0, internal.catalogQueue.notify, { id });

    return null;
  },
});

export const succeed = internalMutation({
  args: { id: v.id("catalogRequests"), result: catalogResultValidator },
  returns: v.null(),
  handler: async (ctx, { id, result }) => {
    const request = await ctx.db.get("catalogRequests", id);

    if (!request || request.state !== "running") return null;
    const now = Date.now();

    for (const product of result.products) {
      const existing = await ctx.db
        .query("catalogProducts")
        .withIndex("by_key", (q) => q.eq("key", product.key))
        .unique();

      const value = mergeCatalogProduct(
        existing,
        {
          kind: request.request.kind === "details" ? "details" : "summary",
          product,
        },
        now,
      );

      if (existing)
        await ctx.db.replace("catalogProducts", existing._id, value);
      else await ctx.db.insert("catalogProducts", value);
    }

    for (const store of result.stores) {
      const existing = await ctx.db
        .query("catalogStores")
        .withIndex("by_externalId", (q) => q.eq("externalId", store.id))
        .unique();

      const value = { externalId: store.id, store, fetchedAt: now };

      if (existing) await ctx.db.replace("catalogStores", existing._id, value);
      else await ctx.db.insert("catalogStores", value);
    }

    await ctx.db.patch("catalogRequests", id, {
      state: "ready",
      result,
      fetchedAt: now,
      expiresAt: now + resultLifetime(request.request, result),
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.catalogQueue.notify, { id });

    return null;
  },
});

async function failRequest(
  ctx: MutationCtx,
  id: Id<"catalogRequests">,
  status: number,
  retryAfterMs: number,
) {
  const request = await ctx.db.get("catalogRequests", id);

  if (!request || !isRequestInFlight(request.state)) return;
  const now = Date.now();
  const transient = status === 0 || status === 429 || status >= 500;

  const delay =
    status === 429
      ? Math.max(60000, retryAfterMs)
      : Math.max(5000 * 2 ** request.attempts, retryAfterMs);

  if (transient && request.attempts < 3) {
    await enqueue(ctx, id, now + delay);

    return;
  }

  await ctx.db.patch("catalogRequests", id, {
    state: "error",
    expiresAt: now + 10 * 60 * 1000,
    error:
      status === 401 || status === 403
        ? "Produktkatalogen er ikke tilgjengelig. Kontroller API-nøkkelen i Convex."
        : "Produktkatalogen er midlertidig utilgjengelig. Kvitteringen kan brukes uten produktkobling.",
  });
  await ctx.scheduler.runAfter(0, internal.catalogQueue.notify, { id });
}

export const fail = internalMutation({
  args: {
    id: v.id("catalogRequests"),
    status: v.number(),
    retryAfterMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await failRequest(ctx, args.id, args.status, args.retryAfterMs);

    return null;
  },
});

export const completed = internalMutation({
  args: vOnCompleteArgs(v.object({ id: v.id("catalogRequests") })),
  returns: v.null(),
  handler: async (ctx, { context, result }) => {
    if (result.kind !== "success") await failRequest(ctx, context.id, 0, 0);

    return null;
  },
});

type CatalogEntry = Pick<
  Doc<"catalogProducts">,
  "key" | "product" | "fetchedAt" | "detailsFetchedAt"
>;

/** Summary responses can fill gaps but cannot refresh or erase fetched details. */
export function mergeCatalogProduct(
  previous: CatalogEntry | null,
  response: { kind: "summary" | "details"; product: CatalogProduct },
  fetchedAt: number,
): CatalogEntry {
  const product = response.product;

  if (response.kind === "details")
    return {
      key: product.key,
      product,
      fetchedAt,
      detailsFetchedAt: fetchedAt,
    };

  if (!previous) return { key: product.key, product, fetchedAt };

  return {
    ...previous,
    fetchedAt,
    product: {
      ...product,
      ...previous.product,
      ids: [...new Set([...previous.product.ids, ...product.ids])],
      image: previous.product.image ?? product.image,
      brand: previous.product.brand ?? product.brand,
      ean: previous.product.ean ?? product.ean,
      ingredients: previous.product.ingredients ?? product.ingredients,
      description: previous.product.description ?? product.description,
      categories: previous.product.categories.length
        ? previous.product.categories
        : product.categories,
      nutrition: previous.product.nutrition.length
        ? previous.product.nutrition
        : product.nutrition,
      allergens: previous.product.allergens.length
        ? previous.product.allergens
        : product.allergens,
      labels: previous.product.labels.length
        ? previous.product.labels
        : product.labels,
    },
  };
}
