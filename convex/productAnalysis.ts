import { userError } from "./userErrors";
import { hasReceiptBeenRead } from "../src/lib/domain/receipt-state";
import { featureEnabled } from "./featureFlags";
import { clientMutation as mutation } from "./clientFunctions";
import { productAttributesValidator } from "../src/lib/domain/product-attributes";
import { v, type Infer } from "convex/values";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import {
  env,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
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
import {
  extractedReceipt,
  type ExtractedReceipt,
} from "../src/lib/domain/receipt-state";
import { getOrInsert } from "../src/lib/map-cache";

const snapshot = {
  id: v.id("receipts"),
  generation: v.number(),
  revision: v.number(),
  version: v.number(),
};

const manager = new WorkflowManager(components.productAnalysisWorkflow, {
  workpoolOptions: { maxParallelism: 1 },
});

/** The receipt snapshot this analysis run was started for, or null once it is stale. */
function current(
  row: Doc<"receipts"> | null,
  args: { generation: number; revision: number; version: number },
): ExtractedReceipt | null {
  const receipt = row && extractedReceipt(row);

  return receipt &&
    args.version === productAnalysisVersion &&
    !receipt.excluded &&
    receipt.generation === args.generation &&
    receipt.revision === args.revision
    ? receipt
    : null;
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

async function launch(
  ctx: MutationCtx,
  receipt: Doc<"receipts">,
  origin: "automatic" | "manual" = "automatic",
) {
  if (!(await featureEnabled(ctx, "spendingAnalysis")))
    return "disabled" as const;

  if (
    !receipt.data ||
    receipt.excluded ||
    receipt.catalogStatus === "pending" ||
    !hasReceiptBeenRead(receipt.status) ||
    !env.TYPESAFE_API_KEY
  )
    return "ineligible" as const;
  const previous = receipt.productAnalysis;

  if (
    previous?.version === productAnalysisVersion &&
    previous.generation === receipt.generation &&
    previous.revision === receipt.revision &&
    (previous.state !== "error" || origin === "automatic")
  )
    return "current" as const;
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

  return "started" as const;
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

/** Explicit household recovery after bounded workflow attempts are exhausted. */
export const ensure = mutation({
  service: "spendingAnalysis",
  args: { ids: v.array(v.id("receipts")) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    if (ids.length > 20) throw userError("For mange kvitteringer.");

    for (const id of ids) {
      const { receipt } = await requireReceipt(ctx, id);
      await launch(ctx, receipt, "manual");
    }

    return null;
  },
});

export const read = internalQuery({
  args: snapshot,
  returns: v.union(schema.doc("receipts"), v.null()),
  handler: async (ctx, args) =>
    current(await ctx.db.get("receipts", args.id), args),
});

const preparedProfileValidator = v.object({
  line: lineValidator,
  profile: v.union(schema.doc("productProfiles"), v.null()),
  families: v.array(schema.doc("productFamilies")),
  catalog: v.union(catalogProductValidator, v.null()),
});

export type PreparedProfile = Infer<typeof preparedProfileValidator>;

async function prepareProfiles(
  ctx: QueryCtx,
  receipt: ExtractedReceipt,
  lineIds: string[],
): Promise<PreparedProfile[]> {
  const profiles = new Map<string, Promise<Doc<"productProfiles"> | null>>();
  const catalogs = new Map<string, Promise<Doc<"catalogProducts"> | null>>();
  const categories = new Map<string, Promise<Doc<"productFamilies">[]>>();
  const names = new Map<string, Promise<Doc<"productFamilies">[]>>();
  const result: PreparedProfile[] = [];

  for (const lineId of lineIds) {
    const line = receipt.data.lines.find(
      (item) => item.id === lineId && item.kind === "product",
    );

    if (!line) continue;

    const profile = await getOrInsert(
      profiles,
      productProfileKey(line),
      (key) =>
        ctx.db
          .query("productProfiles")
          .withIndex("by_householdId_and_key", (q) =>
            q.eq("householdId", receipt.householdId).eq("key", key),
          )
          .unique(),
    );

    let families: Doc<"productFamilies">[] = [];
    let catalog = null;

    if (profile) {
      const family = profile.familyId
        ? await ctx.db.get("productFamilies", profile.familyId)
        : null;

      if (family?.householdId === receipt.householdId) families = [family];
    } else {
      const byCategory = await getOrInsert(
        categories,
        line.categoryId ?? "fallback.unclear",
        (category) =>
          ctx.db
            .query("productFamilies")
            .withIndex("by_householdId_and_categoryId", (q) =>
              q
                .eq("householdId", receipt.householdId)
                .eq("categoryId", category),
            )
            .take(80),
      );

      const byName = await getOrInsert(names, familyName(line), (name) =>
        ctx.db
          .query("productFamilies")
          .withSearchIndex("search_name", (q) =>
            q.search("name", name).eq("householdId", receipt.householdId),
          )
          .take(20),
      );

      families = [
        ...new Map(
          [...byCategory, ...byName].map((family) => [family._id, family]),
        ).values(),
      ];

      if (line.catalogProduct) {
        const cached = await getOrInsert(
          catalogs,
          line.catalogProduct.key,
          (key) =>
            ctx.db
              .query("catalogProducts")
              .withIndex("by_key", (q) => q.eq("key", key))
              .unique(),
        );

        catalog = cached?.product ?? null;
      }
    }

    result.push({ line, profile, families, catalog });
  }

  return result;
}

export const prepare = internalQuery({
  args: { ...snapshot, lineId: v.string() },
  returns: v.union(v.null(), preparedProfileValidator),
  handler: async (ctx, args) => {
    const receipt = current(await ctx.db.get("receipts", args.id), args);

    return receipt
      ? ((await prepareProfiles(ctx, receipt, [args.lineId]))[0] ?? null)
      : null;
  },
});

export const prepareBatch = internalQuery({
  args: { ...snapshot, lineIds: v.array(v.string()) },
  returns: v.union(v.null(), v.array(preparedProfileValidator)),
  handler: async (ctx, args) => {
    if (args.lineIds.length > 12)
      throw new Error("Analysis batch exceeds 12 lines.");
    const receipt = current(await ctx.db.get("receipts", args.id), args);

    return receipt ? prepareProfiles(ctx, receipt, args.lineIds) : null;
  },
});

const profileDecisionValidator = v.object({
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
});

const profileWriteValidator = v.object({
  ...snapshot,
  ...profileDecisionValidator.fields,
});

async function writeProfile(
  ctx: MutationCtx,
  args: Infer<typeof profileWriteValidator>,
  receipt: ExtractedReceipt | null,
): Promise<Id<"productProfiles"> | null> {
  if (!receipt) return null;

  const line = receipt.data.lines.find(
    (item) => item.id === args.lineId && item.kind === "product",
  );

  if (!line || purchaseEvidenceKey(line) !== args.evidenceKey) return null;
  const key = productProfileKey(line);

  const cached = await ctx.db
    .query("productProfiles")
    .withIndex("by_householdId_and_key", (q) =>
      q.eq("householdId", receipt.householdId).eq("key", key),
    )
    .unique();

  if (cached) return cached._id;
  let familyId: Id<"productFamilies"> | null = null;

  if (args.family === "new") {
    const name = familyName(line);

    const familyKey = JSON.stringify([
      productSearch(name),
      productSearch(line.catalogProduct?.brand ?? line.brand ?? ""),
      [...line.attributes].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    ]);

    const existing = await ctx.db
      .query("productFamilies")
      .withIndex("by_householdId_and_key", (q) =>
        q.eq("householdId", receipt.householdId).eq("key", familyKey),
      )
      .unique();

    familyId =
      existing?._id ??
      (await ctx.db.insert("productFamilies", {
        householdId: receipt.householdId,
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

    if (family?.householdId !== receipt.householdId)
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

  return ctx.db.insert("productProfiles", {
    householdId: receipt.householdId,
    key,
    familyId,
    package: args.package,
    attributes: args.attributes,
    decisions: args.decisions,
  });
}

export const saveProfile = internalMutation({
  args: profileWriteValidator.fields,
  returns: v.union(v.id("productProfiles"), v.null()),
  handler: async (ctx, args) =>
    writeProfile(
      ctx,
      args,
      current(await ctx.db.get("receipts", args.id), args),
    ),
});

export const saveProfiles = internalMutation({
  args: { ...snapshot, decisions: v.array(profileDecisionValidator) },
  returns: v.array(v.id("productProfiles")),
  handler: async (ctx, args) => {
    if (args.decisions.length > 12)
      throw new Error("Analysis batch exceeds 12 lines.");
    const receipt = current(await ctx.db.get("receipts", args.id), args);
    const ids: Id<"productProfiles">[] = [];

    for (const decision of args.decisions) {
      const id = await writeProfile(ctx, { ...args, ...decision }, receipt);

      if (id) ids.push(id);
    }

    return ids;
  },
});

export const readProfiles = internalQuery({
  args: { ...snapshot, ids: v.array(v.id("productProfiles")) },
  returns: v.array(
    v.object({
      profile: schema.doc("productProfiles"),
      family: v.union(schema.doc("productFamilies"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.ids.length > 12)
      throw new Error("Analysis batch exceeds 12 profiles.");
    const receipt = current(await ctx.db.get("receipts", args.id), args);

    if (!receipt) return [];
    const rows = [];

    for (const id of new Set(args.ids)) {
      const profile = await ctx.db.get("productProfiles", id);

      if (!profile || profile.householdId !== receipt.householdId)
        throw new Error("Invalid profile.");

      const family = profile.familyId
        ? await ctx.db.get("productFamilies", profile.familyId)
        : null;

      rows.push({
        profile,
        family: family?.householdId === receipt.householdId ? family : null,
      });
    }

    return rows;
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
    const receipt = current(await ctx.db.get("receipts", args.id), args);

    if (!receipt) return null;

    const results = args.results.filter((result) =>
      receipt.data.lines.some(
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

/** Operator repair for one household and a fixed insertion boundary. No recurring scan. */
export const repair = internalMutation({
  args: {
    householdId: v.id("households"),
    cursor: v.union(v.string(), v.null()),
    through: v.number(),
  },
  returns: v.object({ isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) =>
        q
          .eq("householdId", args.householdId)
          .lte("_creationTime", args.through),
      )
      .paginate({ cursor: args.cursor, numItems: 10, maximumRowsRead: 10 });

    for (const receipt of page.page) await launch(ctx, receipt, "manual");

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.productAnalysis.repair, {
        ...args,
        cursor: page.continueCursor,
      });

    return { isDone: page.isDone, continueCursor: page.continueCursor };
  },
});
