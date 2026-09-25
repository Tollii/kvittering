import { userError } from "./userErrors";
import { isReceiptProcessing } from "../src/lib/domain/receipt-state";
import { consumeWorkQuota } from "./rateLimits";
import { trackWorkflow } from "./retention";
import { commitReceiptChange } from "./receiptChanges";
import { isCategoryUncertain } from "../src/lib/domain/receipt-issues";
import { featureEnabled } from "./featureFlags";
import { clientMutation as mutation } from "./clientFunctions";
import { v } from "convex/values";
import {
  WorkflowManager,
  start as startWorkflow,
  vWorkflowId,
} from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalQuery, env, type MutationCtx } from "./_generated/server";
import { internalMutation } from "./serverFunctions";
import { requireReceipt } from "./access";
import schema from "./schema";
import { findMapping } from "./products";
import { linkCatalogProduct, resolveCatalogMatch } from "./catalogLinks";
import {
  catalogProductValidator,
  type CatalogRequest,
} from "../src/lib/catalog/model";
import {
  productSearch,
  compatibleCatalogProduct,
  retailerCode,
  lineEvidenceKey,
  exactPhysicalStore,
} from "../src/lib/catalog/matching";
import { normalizeSearch } from "../src/lib/catalog/policy";
import { matchingKey } from "../src/lib/domain/product-matching";
import { isDecidedCategory } from "../src/lib/domain/categories";
import { lineValidator } from "../src/lib/domain/receipt";
import type { Id } from "./_generated/dataModel";

import { catalogDecision } from "../src/lib/catalog/decisions";

export { catalogDecision } from "../src/lib/catalog/decisions";

const workflow = new WorkflowManager(components.workflow);

export const process = workflow
  .define({
    args: { id: v.id("receipts"), generation: v.number() },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    try {
      const receipt = await step.runQuery(
        internal.catalogMatching.receipt,
        args,
      );

      if (!receipt?.data) return null;
      const inputs = await step.runQuery(internal.catalogMatching.inputs, args);
      const requests = new Map<string, CatalogRequest>();

      for (const item of inputs)
        if (!item.product && item.search.length >= 3) {
          const request: CatalogRequest = {
            kind: "products",
            search: item.search,
          };

          // Old workflow steps retain their original arguments, with no store field.
          if (item.store) request.store = item.store;
          requests.set(item.search, request);
        }

      const branch = receipt.data.branch?.trim();

      if (
        branch &&
        branch.length >= 3 &&
        !receipt.data.physicalStore &&
        !receipt.data.physicalStoreManual
      )
        requests.set("physical-store", {
          kind: "stores",
          search: branch.slice(0, 120),
          chain: retailerCode(receipt.data.store) ?? undefined,
        });

      // Register all missing lookups before waiting; identical requests share one API call.
      const entries = await Promise.all(
        [...requests].map(async ([key, request]) => {
          const result = await step.runMutation(
            internal.catalogQueue.requestForWorkflow,
            { request, workflowId: step.workflowId, receiptId: args.id },
            { unstableArgs: true },
          );

          return { key, ...result };
        }),
      );

      await Promise.all(
        entries.map(({ eventId }) =>
          eventId ? step.awaitEvent({ id: eventId }) : Promise.resolve(),
        ),
      );

      const decisions = await step.runAction(
        internal.catalogClassifier.classify,
        {
          receiptId: args.id,
          items: inputs.map((item) => ({
            ...item,
            requestId:
              entries.find((entry) => entry.key === item.search)?.id ?? null,
          })),
        },
        { unstableArgs: true },
      );

      await step.runMutation(internal.catalogMatching.apply, {
        ...args,
        store: receipt.data.store,
        decisions,
      });
      await step.runMutation(internal.catalogMatching.finish, {
        ...args,
        workflowId: step.workflowId,
        storeRequestId:
          entries.find((entry) => entry.key === "physical-store")?.id ?? null,
        requestIds: entries.map((entry) => entry.id),
      });
    } catch {
      // Handled: `failed` records the failed run and logs `catalog.matching_failed`.
      await step.runMutation(internal.catalogMatching.failed, {
        ...args,
        workflowId: step.workflowId,
      });
    }

    return null;
  });

async function launch(
  ctx: MutationCtx,
  id: Id<"receipts">,
  generation: number,
) {
  const workflowId = await startWorkflow(
    ctx,
    internal.catalogMatching.process,
    {
      id,
      generation,
    },
    {
      onComplete: internal.retention.workflowCompleted,
      context: { component: "processing", receiptId: id },
    },
  );

  await trackWorkflow(ctx, workflowId, "processing", id);

  return workflowId;
}

export const start = internalMutation({
  args: { id: v.id("receipts"), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);

    if (
      !receipt?.data ||
      receipt.generation !== args.generation ||
      receipt.catalogStatus === "pending"
    )
      return null;

    if (
      !env.KASSALAPP_API_KEY ||
      !(await featureEnabled(ctx, "automaticProductMatching")) ||
      !(await featureEnabled(ctx, "productLookup"))
    ) {
      await ctx.scheduler.runAfter(0, internal.productAnalysis.start, {
        id: args.id,
      });

      return null;
    }

    const workflowId = await launch(ctx, args.id, args.generation);
    await ctx.db.patch("receipts", args.id, {
      catalogStatus: "pending",
      catalogWorkflowId: workflowId,
    });
    console.info("catalog.matching_started", {
      receiptId: args.id,
      generation: args.generation,
    });

    return null;
  },
});

export const enrich = mutation({
  service: "automaticProductMatching",
  args: { id: v.id("receipts"), onlyIfMissing: v.boolean().optional() },
  returns: v.null(),
  handler: async (ctx, { id, onlyIfMissing }) => {
    const { receipt, member } = await requireReceipt(ctx, id);

    if (onlyIfMissing && receipt.catalogStatus) return null;

    if (!receipt.data || isReceiptProcessing(receipt.status))
      throw userError("Vent til kvitteringen er lest.");

    if (!env.KASSALAPP_API_KEY)
      throw new Error("Legg til KASSALAPP_API_KEY i Convex først.");

    if (receipt.catalogStatus === "pending") return null;
    await consumeWorkQuota(ctx, member, "analysis");
    const workflowId = await launch(ctx, id, receipt.generation);
    await ctx.db.patch("receipts", id, {
      catalogStatus: "pending",
      catalogWorkflowId: workflowId,
    });

    return null;
  },
});

export const receipt = internalQuery({
  args: { id: v.id("receipts"), generation: v.number() },
  returns: v.union(schema.doc("receipts"), v.null()),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);

    return receipt?.generation === args.generation ? receipt : null;
  },
});

export const matchingInput = v.object({
  line: lineValidator,
  search: v.string(),
  store: v.string().optional(),
  product: v.union(catalogProductValidator, v.null()),
});

export const inputs = internalQuery({
  args: { id: v.id("receipts"), generation: v.number() },
  returns: v.array(matchingInput),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);

    if (!receipt?.data || receipt.generation !== args.generation) return [];
    const data = receipt.data;
    const result = [];

    for (const line of data.lines) {
      if (line.kind !== "product" || line.productMatchManual) continue;

      const mapping = await findMapping(
        ctx,
        receipt.householdId,
        matchingKey(data.store ?? ""),
        line,
      );

      if (mapping?.confirmedBy && !mapping.productId) continue;

      const saved = mapping?.productId
        ? await ctx.db.get("products", mapping.productId)
        : null;

      if (mapping?.confirmedBy && !saved?.catalogKey) continue;
      const key = line.catalogProduct?.key ?? saved?.catalogKey;

      const record = key
        ? await ctx.db
            .query("catalogProducts")
            .withIndex("by_key", (q) => q.eq("key", key))
            .unique()
        : null;

      result.push({
        line,
        search: productSearch(line.name).slice(0, 120),
        store: retailerCode(data.store) ?? undefined,
        product:
          record && compatibleCatalogProduct(line, record.product)
            ? record.product
            : null,
      });
    }

    return result;
  },
});

export const apply = internalMutation({
  args: {
    id: v.id("receipts"),
    generation: v.number(),
    store: v.union(v.string(), v.null()),
    decisions: v.array(catalogDecision),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);

    if (
      !receipt?.data ||
      receipt.generation !== args.generation ||
      receipt.data.store !== args.store
    )
      return null;
    const data = receipt.data;
    let changed = false;
    const reasons: Record<string, number> = {};

    for (const decision of args.decisions) {
      const reason = decision.reason ?? "unspecified";
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }

    console.info("catalog.matching_evaluated", {
      receiptId: args.id,
      generation: args.generation,
      itemCount: args.decisions.length,
      selectedCount: args.decisions.filter(
        (decision) => decision.productKey !== null,
      ).length,
      reasons,
    });

    const diagnostics = new Map(
      (receipt.catalogDecisions ?? []).map((decision) => [
        decision.lineId,
        decision,
      ]),
    );

    for (const decision of args.decisions) {
      const line = data.lines.find((line) => line.id === decision.lineId);

      if (
        !line ||
        line.kind !== "product" ||
        lineEvidenceKey(line) !== decision.evidenceKey
      )
        continue;

      if (line.productMatchManual) continue;
      diagnostics.set(line.id, decision);

      if (decision.productKey) {
        const product = await resolveCatalogMatch(ctx, line, decision);

        if (product && line.catalogProduct?.key !== product.key && data.store) {
          Object.assign(
            line,
            await linkCatalogProduct(
              ctx,
              receipt.householdId,
              data.store,
              line,
              product,
              null,
            ),
          );
          changed = true;
        }
      }

      if (
        !line.manual &&
        !(line.categoryAliasKey ?? line.productKey) &&
        isDecidedCategory(decision.categoryId) &&
        decision.categoryConfidence >= 0.85 &&
        (line.categoryId !== decision.categoryId ||
          line.issues.some(isCategoryUncertain))
      ) {
        line.categoryId = decision.categoryId;
        line.confidence = decision.categoryConfidence;
        line.issues = line.issues.filter(
          (issue) => !isCategoryUncertain(issue),
        );
        changed = true;
      }
    }

    await ctx.db.patch("receipts", args.id, {
      catalogDecisions: [...diagnostics.values()].filter((decision) =>
        data.lines.some(
          (line) =>
            line.id === decision.lineId &&
            !line.productMatchManual &&
            lineEvidenceKey(line) === decision.evidenceKey,
        ),
      ),
    });

    if (changed) {
      await commitReceiptChange(ctx, {
        receiptId: receipt._id,
        expected: receipt,
        data,
        origin: { kind: "catalog" },
      });
    }

    return null;
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("receipts"),
    generation: v.number(),
    workflowId: vWorkflowId,
    storeRequestId: v.union(v.id("catalogRequests"), v.null()),
    requestIds: v.array(v.id("catalogRequests")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);

    if (
      !receipt?.data ||
      receipt.generation !== args.generation ||
      receipt.catalogWorkflowId !== args.workflowId
    )
      return null;
    const data = receipt.data;
    let changed = false;

    if (
      args.storeRequestId &&
      !data.physicalStoreManual &&
      !data.physicalStore &&
      data.branch
    ) {
      const request = await ctx.db.get("catalogRequests", args.storeRequestId);

      const store =
        request?.state === "ready" &&
        request.request.kind === "stores" &&
        request.request.chain === retailerCode(data.store) &&
        request.request.search === normalizeSearch(data.branch)
          ? exactPhysicalStore(data.branch, request.result.stores)
          : null;

      if (store) {
        data.physicalStore = store;
        changed = true;
      }
    }

    const requests = await Promise.all(
      args.requestIds.map((id) => ctx.db.get("catalogRequests", id)),
    );

    await ctx.db.patch("receipts", args.id, {
      catalogStatus:
        requests.some((request) => request?.state === "error") ||
        receipt.catalogDecisions?.some(
          (decision) =>
            (decision.reason === "provider_error" ||
              decision.reason === "unavailable") &&
            data.lines.some(
              (line) =>
                line.id === decision.lineId &&
                !line.productMatchManual &&
                lineEvidenceKey(line) === decision.evidenceKey,
            ),
        )
          ? "error"
          : "complete",
    });

    if (changed)
      await commitReceiptChange(ctx, {
        receiptId: receipt._id,
        expected: receipt,
        data,
        origin: { kind: "catalog" },
      });
    else
      await ctx.scheduler.runAfter(0, internal.productAnalysis.start, {
        id: args.id,
      });

    return null;
  },
});

export const failed = internalMutation({
  args: {
    id: v.id("receipts"),
    generation: v.number(),
    workflowId: vWorkflowId,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);

    if (
      receipt?.generation === args.generation &&
      receipt.catalogWorkflowId === args.workflowId
    ) {
      console.error("catalog.matching_failed", {
        receiptId: args.id,
        generation: args.generation,
      });
      await ctx.db.patch("receipts", args.id, { catalogStatus: "error" });
      await ctx.scheduler.runAfter(0, internal.productAnalysis.start, {
        id: args.id,
      });
    }

    return null;
  },
});
