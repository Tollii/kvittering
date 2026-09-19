import { commitReceiptChange } from "./receiptChanges";
import { clientMutation as mutation } from "./clientFunctions";
import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import schema from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMember } from "./access";
import { categoryById } from "../src/lib/domain/categories";
import { categoryMemoryKey } from "../src/lib/domain/category-memory";
import {
  classificationInputs,
  type ReceiptData,
} from "../src/lib/domain/receipt";
import {
  isCategoryUncertain,
  confirmLineCategory,
} from "../src/lib/domain/receipt-review";
import { correctionTarget } from "../src/lib/domain/corrections";

/** Only human saves create evaluation examples; automatic propagation does not. */
export async function recordCorrections(
  ctx: MutationCtx,
  receipt: Doc<"receipts">,
  data: ReceiptData,
) {
  if (!receipt.data) return;
  const descriptions = new Map(
    classificationInputs({
      ...data,
      lines: data.lines.map((line) => ({ ...line, productKey: null })),
    }).map((item) => [item.id, item.description]),
  );
  for (const after of data.lines) {
    const before = receipt.data.lines.find(
      (line) => line.id === after.id && line.kind === "product",
    );
    if (!before || after.kind !== "product") continue;
    for (const field of ["category", "catalog"] as const) {
      const previous =
        field === "category"
          ? before.categoryId
          : (before.catalogProduct?.key ?? null);
      const expected =
        field === "category"
          ? after.categoryId
          : (after.catalogProduct?.key ?? null);
      const confirmed =
        field === "category" &&
        before.issues.some(isCategoryUncertain) &&
        !after.issues.some(isCategoryUncertain);
      if (previous === expected && !confirmed) continue;
      await ctx.db.insert("corrections", {
        householdId: receipt.householdId,
        receiptId: receipt._id,
        revision: receipt.revision + 1,
        lineId: before.id,
        store: data.store,
        name: after.name,
        field,
        previous,
        expected,
        description:
          descriptions.get(before.id) ?? JSON.stringify({ name: before.name }),
        evidence: before,
      });
    }
  }
}

export const list = query({
  args: {},
  returns: v.object({
    entries: v.array(schema.doc("corrections")),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const member = await requireMember(ctx);
    const rows = await ctx.db
      .query("corrections")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .order("desc")
      .take(51);
    return { entries: rows.slice(0, 50), truncated: rows.length > 50 };
  },
});

async function requireCorrection(ctx: QueryCtx, id: Id<"corrections">) {
  const member = await requireMember(ctx);
  const correction = await ctx.db.get("corrections", id);
  if (!correction || correction.householdId !== member.householdId)
    throw new Error("Rettelsen er ikke tilgjengelig.");
  if (
    correction.field !== "category" ||
    !correction.expected ||
    !categoryById.has(correction.expected) ||
    correction.expected === "fallback.unclear"
  )
    throw new Error("Denne rettelsen kan ikke brukes på flere varer.");
  return correction;
}
function matches(
  receipt: Doc<"receipts">,
  correction: Doc<"corrections">,
  line: ReceiptData["lines"][number],
) {
  const key = categoryMemoryKey(correction.store, correction.name);
  return (
    receipt._id !== correction.receiptId &&
    !!receipt.data &&
    !receipt.excluded &&
    ["reviewed", "needs_review"].includes(receipt.status) &&
    !!key &&
    line.kind === "product" &&
    !line.manual &&
    line.categoryId !== correction.expected &&
    categoryMemoryKey(receipt.data.store, line.name) === key
  );
}
export const preview = query({
  args: { id: v.id("corrections") },
  returns: v.object({
    targets: v.array(
      correctionTarget.extend({
        name: v.string(),
        categoryId: v.union(v.string(), v.null()),
        date: v.union(v.string(), v.null()),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, { id }) => {
    const correction = await requireCorrection(ctx, id);
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", correction.householdId),
      )
      .order("desc")
      .take(201);
    const targets = receipts.slice(0, 200).flatMap((receipt) =>
      (receipt.data?.lines ?? [])
        .filter((line) => matches(receipt, correction, line))
        .map((line) => ({
          receiptId: receipt._id,
          revision: receipt.revision,
          lineId: line.id,
          name: line.name,
          categoryId: line.categoryId,
          date: receipt.data!.purchaseDate,
        })),
    );
    return {
      targets: targets.slice(0, 20),
      truncated: receipts.length > 200 || targets.length > 20,
    };
  },
});
export const apply = mutation({
  args: { id: v.id("corrections"), targets: v.array(correctionTarget) },
  returns: v.id("correctionBatches"),
  handler: async (ctx, { id, targets }) => {
    const correction = await requireCorrection(ctx, id);
    if (
      !targets.length ||
      targets.length > 20 ||
      new Set(targets.map((t) => `${t.receiptId}:${t.lineId}`)).size !==
        targets.length
    )
      throw new Error("Velg mellom 1 og 20 ulike varer.");
    const changes: Doc<"correctionBatches">["changes"] = [];
    for (const receiptId of new Set(
      targets.map((target) => target.receiptId),
    )) {
      const receipt = await ctx.db.get("receipts", receiptId);
      const selected = targets.filter(
        (target) => target.receiptId === receiptId,
      );
      if (
        !receipt?.data ||
        receipt.householdId !== correction.householdId ||
        selected.some((target) => target.revision !== receipt.revision)
      )
        throw new Error(
          "Kvitteringene er endret. Åpne forhåndsvisningen på nytt.",
        );
      const before = selected.map((target) => {
        const line = receipt.data!.lines.find(
          (line) => line.id === target.lineId,
        );
        if (!line || !matches(receipt, correction, line))
          throw new Error("Varen er endret. Åpne forhåndsvisningen på nytt.");
        return line;
      });
      const ids = new Set(before.map((line) => line.id));
      const acknowledgement = await commitReceiptChange(ctx, {
        receiptId,
        expected: receipt,
        origin: { kind: "correction", editor: "category correction batch" },
        data: {
          ...receipt.data,
          lines: receipt.data.lines.map((line) =>
            ids.has(line.id)
              ? confirmLineCategory(line, correction.expected!)
              : line,
          ),
        },
      });
      changes.push({ receiptId, revision: acknowledgement.revision, before });
    }
    return ctx.db.insert("correctionBatches", {
      householdId: correction.householdId,
      correctionId: id,
      undone: false,
      changes,
    });
  },
});
export const undo = mutation({
  args: { id: v.id("correctionBatches") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const member = await requireMember(ctx);
    const batch = await ctx.db.get("correctionBatches", id);
    if (!batch || batch.householdId !== member.householdId)
      throw new Error("Rettelsen er ikke tilgjengelig.");
    if (batch.undone) return null;
    for (const change of batch.changes) {
      const receipt = await ctx.db.get("receipts", change.receiptId);
      if (
        !receipt?.data ||
        receipt.householdId !== member.householdId ||
        receipt.revision !== change.revision
      )
        throw new Error(
          "En kvittering er endret etter rettelsen. Åpne den for å rette manuelt.",
        );
      await commitReceiptChange(ctx, {
        receiptId: receipt._id,
        expected: receipt,
        origin: { kind: "undo", editor: member.identity },
        data: {
          ...receipt.data,
          lines: receipt.data.lines.map(
            (line) => change.before.find((old) => old.id === line.id) ?? line,
          ),
        },
      });
    }
    await ctx.db.patch("correctionBatches", id, { undone: true });
    return null;
  },
});
export const batches = query({
  args: {},
  returns: v.array(schema.doc("correctionBatches")),
  handler: async (ctx) => {
    const member = await requireMember(ctx);
    return ctx.db
      .query("correctionBatches")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .order("desc")
      .take(10);
  },
});
