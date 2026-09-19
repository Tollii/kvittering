import { featureEnabled } from "./releasePolicy";
import { clientMutation as mutation } from "./clientFunctions";
import { productAttributesValidator } from "../src/lib/domain/product-attributes";
import { v } from "convex/values";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import {
  env,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireReceipt } from "./access";
import {
  familyName,
  normalizeFamilyName,
  packageProfileValidator,
  productAnalysisResultValidator,
  productAnalysisVersion,
  productProfileKey,
  purchaseEvidenceKey,
} from "../src/lib/domain/product-families";
import { productSearch } from "../src/lib/catalog/search";
import { catalogProductValidator } from "../src/lib/catalog/model";
import { lineValidator } from "../src/lib/domain/receipt";

const snapshot = {
  id: v.id("receipts"),
  generation: v.number(),
  revision: v.number(),
  version: v.number(),
};
const manager = new WorkflowManager(components.productAnalysisWorkflow, {
  workpoolOptions: { maxParallelism: 1 },
});
function current(
  receipt: Doc<"receipts"> | null,
  args: { generation: number; revision: number; version: number },
) {
  return (
    args.version === productAnalysisVersion &&
    !!receipt?.data &&
    !receipt.excluded &&
    receipt.generation === args.generation &&
    receipt.revision === args.revision
  );
}

export const process = manager
  .define({ args: snapshot, returns: v.null() })
  .handler(async (step, args): Promise<null> => {
    try {
      const results = await step.runAction(
        internal.productAnalysisWorker.analyze,
        args,
        { retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 } },
      );
      await step.runMutation(internal.productAnalysis.finish, {
        ...args,
        results,
        failed: false,
      });
    } catch {
      await step.runMutation(internal.productAnalysis.finish, {
        ...args,
        results: [],
        failed: true,
      });
    }
    return null;
  });

async function launch(ctx: MutationCtx, receipt: Doc<"receipts">) {
  if (!(await featureEnabled(ctx, "spendingAnalysis"))) return;
  if (
    !receipt.data ||
    receipt.excluded ||
    receipt.catalogStatus === "pending" ||
    !["reviewed", "needs_review"].includes(receipt.status) ||
    !env.TYPESAFE_API_KEY
  )
    return;
  const previous = receipt.productAnalysis;
  if (
    previous?.version === productAnalysisVersion &&
    previous.generation === receipt.generation &&
    previous.revision === receipt.revision &&
    (previous.state !== "error" || Date.now() - previous.updatedAt < 300000)
  )
    return;
  await manager.start(ctx, internal.productAnalysis.process, {
    id: receipt._id,
    generation: receipt.generation,
    revision: receipt.revision,
    version: productAnalysisVersion,
  });
  await ctx.db.patch("receipts", receipt._id, {
    productAnalysis: {
      version: productAnalysisVersion,
      generation: receipt.generation,
      revision: receipt.revision,
      state: "pending",
      updatedAt: Date.now(),
      results: [],
    },
  });
}
export const start = internalMutation({
  args: { id: v.id("receipts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const receipt = await ctx.db.get("receipts", id);
    if (receipt) await launch(ctx, receipt);
    return null;
  },
});

/** Bring older receipts up to date when the household opens the app. */
export const ensure = mutation({
  service: "spendingAnalysis",
  args: { ids: v.array(v.id("receipts")) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    if (ids.length > 20) throw new Error("For mange kvitteringer.");
    for (const id of ids) {
      const { receipt } = await requireReceipt(ctx, id);
      await launch(ctx, receipt);
    }
    return null;
  },
});
export const read = internalQuery({
  args: snapshot,
  returns: v.union(schema.doc("receipts"), v.null()),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    return current(receipt, args) ? receipt : null;
  },
});

export const prepare = internalQuery({
  args: { ...snapshot, lineId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      line: lineValidator,
      profile: v.union(schema.doc("productProfiles"), v.null()),
      families: v.array(schema.doc("productFamilies")),
      catalog: v.union(catalogProductValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    if (!current(receipt, args)) return null;
    const line = receipt!.data!.lines.find(
      (item) => item.id === args.lineId && item.kind === "product",
    );
    if (!line) return null;
    const profile = await ctx.db
      .query("productProfiles")
      .withIndex("by_householdId_and_key", (q) =>
        q
          .eq("householdId", receipt!.householdId)
          .eq("key", productProfileKey(line)),
      )
      .unique();
    const families = await ctx.db
      .query("productFamilies")
      .withIndex("by_householdId_and_categoryId", (q) =>
        q
          .eq("householdId", receipt!.householdId)
          .eq("categoryId", line.categoryId ?? "fallback.unclear"),
      )
      .take(80);
    // Include name matches across categories: a previous category can be wrong.
    const related = await ctx.db
      .query("productFamilies")
      .withSearchIndex("search_name", (q) =>
        q
          .search("name", familyName(line))
          .eq("householdId", receipt!.householdId),
      )
      .take(20);
    const familyIds = new Set(families.map((family) => family._id));
    for (const family of related)
      if (!familyIds.has(family._id)) {
        families.push(family);
        familyIds.add(family._id);
      }
    if (profile?.familyId && !familyIds.has(profile.familyId)) {
      const family = await ctx.db.get("productFamilies", profile.familyId);
      if (family?.householdId === receipt!.householdId) families.push(family);
    }
    const catalog = line.catalogProduct
      ? await ctx.db
          .query("catalogProducts")
          .withIndex("by_key", (q) => q.eq("key", line.catalogProduct!.key))
          .unique()
      : null;
    return { line, profile, families, catalog: catalog?.product ?? null };
  },
});

export const saveProfile = internalMutation({
  args: {
    ...snapshot,
    lineId: v.string(),
    evidenceKey: v.string(),
    family: v.union(v.literal("new"), v.id("productFamilies"), v.null()),
    package: packageProfileValidator,
    attributes: productAttributesValidator.optional(),
    decisions: v.array(
      v.object({
        question: v.string(),
        choice: v.string(),
        confidence: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    if (!current(receipt, args)) return null;
    const line = receipt!.data!.lines.find(
      (item) => item.id === args.lineId && item.kind === "product",
    );
    if (!line || purchaseEvidenceKey(line) !== args.evidenceKey) return null;
    const key = productProfileKey(line);
    const cached = await ctx.db
      .query("productProfiles")
      .withIndex("by_householdId_and_key", (q) =>
        q.eq("householdId", receipt!.householdId).eq("key", key),
      )
      .unique();
    if (cached) return null;
    let familyId: Id<"productFamilies"> | null = null;
    if (args.family === "new") {
      const name = familyName(line);
      const familyKey = JSON.stringify([
        productSearch(name),
        productSearch(line.catalogProduct?.brand ?? line.brand ?? ""),
        [...line.attributes].sort(),
      ]);
      const existing = await ctx.db
        .query("productFamilies")
        .withIndex("by_householdId_and_key", (q) =>
          q.eq("householdId", receipt!.householdId).eq("key", familyKey),
        )
        .unique();
      familyId =
        existing?._id ??
        (await ctx.db.insert("productFamilies", {
          householdId: receipt!.householdId,
          key: familyKey,
          name,
          categoryId: line.categoryId ?? "fallback.unclear",
          representative: {
            name: line.catalogProduct?.name ?? line.name,
            brand: line.catalogProduct?.brand ?? line.brand,
            attributes: line.attributes,
          },
        }));
    } else if (args.family) {
      const family = await ctx.db.get("productFamilies", args.family);
      if (family?.householdId !== receipt!.householdId)
        throw new Error("Invalid product family.");
      familyId = family._id;
      const name = normalizeFamilyName(family.representative.name);
      if (name !== family.name)
        await ctx.db.patch("productFamilies", family._id, { name });
    }
    const count = args.package.unitsPerPackage;
    const size = args.package.measurePerPackage?.amount;
    if (
      (count !== null && (!Number.isInteger(count) || count <= 0)) ||
      (size !== undefined && (!Number.isFinite(size) || size <= 0))
    )
      throw new Error("Invalid package quantity.");
    await ctx.db.insert("productProfiles", {
      householdId: receipt!.householdId,
      key,
      familyId,
      package: args.package,
      ...(args.attributes ? { attributes: args.attributes } : {}),
      decisions: args.decisions,
    });
    return null;
  },
});

export const finish = internalMutation({
  args: {
    ...snapshot,
    results: v.array(productAnalysisResultValidator),
    failed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    if (!current(receipt, args)) return null;
    const results = args.results.filter((result) =>
      receipt!.data!.lines.some(
        (line) =>
          line.kind === "product" &&
          line.id === result.lineId &&
          purchaseEvidenceKey(line) === result.evidenceKey,
      ),
    );
    await ctx.db.patch("receipts", args.id, {
      productAnalysis: {
        version: productAnalysisVersion,
        generation: args.generation,
        revision: args.revision,
        state: args.failed ? "error" : "complete",
        updatedAt: Date.now(),
        results,
      },
    });
    const fields = {
      receiptId: args.id,
      generation: args.generation,
      revision: args.revision,
      resultCount: results.length,
    };
    if (args.failed) console.error("product.analysis_failed", fields);
    else console.info("product.analysis_completed", fields);
    return null;
  },
});
