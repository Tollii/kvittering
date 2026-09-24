import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { mutation } from "./serverFunctions";
import { clientValidator } from "../src/lib/releases/policy";
import { requireMember } from "./access";
import schema from "./schema";

/** Diagnostics stay available to authenticated users even when their build is retired. */
export const report = mutation({
  args: {
    client: clientValidator,
    installationId: v.string(),
    policyRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    if (!/^[\w-]{16,80}$/.test(args.installationId))
      throw new Error("Invalid installation ID.");

    const previous = await ctx.db
      .query("clientReleases")
      .withIndex("by_identity_and_installationId", (q) =>
        q
          .eq("identity", member.identity)
          .eq("installationId", args.installationId),
      )
      .unique();

    // SAFETY: args.client is a closed object parsed by clientValidator.
    const changed =
      !previous ||
      (Object.keys(args.client) as (keyof typeof args.client)[]).some(
        (key) => previous.client[key] !== args.client[key],
      );

    if (
      previous &&
      !changed &&
      previous.lastSeen > Date.now() - 6 * 60 * 60_000
    )
      return null;
    const values = { ...args, identity: member.identity, lastSeen: Date.now() };

    if (previous) await ctx.db.replace("clientReleases", previous._id, values);
    else await ctx.db.insert("clientReleases", values);

    return null;
  },
});

/** Bounded operator report. No receipt contents or public device inventory. */
export const active = internalQuery({
  args: {},
  returns: v.object({
    installations: v.array(schema.doc("clientReleases")),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("clientReleases")
      .withIndex("by_lastSeen", (q) =>
        q.gte("lastSeen", Date.now() - 30 * 24 * 60 * 60_000),
      )
      .order("desc")
      .take(501);

    return { installations: rows.slice(0, 500), truncated: rows.length > 500 };
  },
});
