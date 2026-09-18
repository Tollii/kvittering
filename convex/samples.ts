import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import schema from "./schema";

// These sample records are public and contain no user data.
export const list = query({
  args: {},
  returns: v.array(schema.doc("samples")),
  handler: async (ctx) => ctx.db.query("samples").withIndex("by_name").take(20),
});

// Run from the Convex CLI. Repeated calls do not duplicate or overwrite records.
export const seed = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const samples = [
      { name: "Alpha", description: "First sample record." },
      { name: "Bravo", description: "Second sample record." },
      { name: "Charlie", description: "Third sample record." },
    ];

    for (const sample of samples) {
      const existing = await ctx.db
        .query("samples")
        .withIndex("by_name", (index) => index.eq("name", sample.name))
        .unique();
      if (!existing) await ctx.db.insert("samples", sample);
    }
    return null;
  },
});
