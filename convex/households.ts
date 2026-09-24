import { userError } from "./userErrors";
import { oreValidator } from "../src/lib/domain/ore";
import { clientMutation as mutation } from "./clientFunctions";
import { query } from "./_generated/server";
import { v } from "convex/values";
import schema from "./schema";
import { requireMember } from "./access";

export const current = query({
  args: {},
  returns: v.union(
    v.object({
      household: schema.doc("households"),
      member: schema.doc("members"),
      members: v.array(schema.doc("members")),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) return null;

    const member = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) =>
        q.eq("identity", identity.tokenIdentifier),
      )
      .unique();

    if (!member) return null;
    const household = await ctx.db.get("households", member.householdId);

    if (!household) return null;

    return {
      household,
      member,
      members: await ctx.db
        .query("members")
        .withIndex("by_householdId", (q) =>
          q.eq("householdId", member.householdId),
        )
        .take(2),
    };
  },
});

export const create = mutation({
  args: { name: v.string(), invitation: v.string() },
  returns: v.id("households"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) throw userError("Logg inn først.");

    const existing = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) =>
        q.eq("identity", identity.tokenIdentifier),
      )
      .unique();

    if (existing) return existing.householdId;

    if (
      args.name.trim().length < 1 ||
      args.name.length > 80 ||
      !/^[a-f0-9]{32}$/.test(args.invitation)
    )
      throw userError("Ugyldig navn eller invitasjon.");

    const householdId = await ctx.db.insert("households", {
      name: args.name.trim(),
      invitation: args.invitation,
    });

    await ctx.db.insert("members", {
      householdId,
      identity: identity.tokenIdentifier,
      name: identity.name ?? "Medlem",
    });

    return householdId;
  },
});

export const join = mutation({
  args: { invitation: v.string() },
  returns: v.id("households"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) throw userError("Logg inn først.");

    const existing = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) =>
        q.eq("identity", identity.tokenIdentifier),
      )
      .unique();

    if (existing) return existing.householdId;

    const household = await ctx.db
      .query("households")
      .withIndex("by_invitation", (q) =>
        q.eq("invitation", args.invitation.trim()),
      )
      .unique();

    if (!household) throw userError("Invitasjonen er ugyldig.");

    const members = await ctx.db
      .query("members")
      .withIndex("by_householdId", (q) => q.eq("householdId", household._id))
      .take(2);

    if (members.length >= 2)
      throw userError("Husstanden har allerede to medlemmer.");
    await ctx.db.insert("members", {
      householdId: household._id,
      identity: identity.tokenIdentifier,
      name: identity.name ?? "Medlem",
    });

    return household._id;
  },
});

export const setBudget = mutation({
  args: { monthlyBudgetOre: v.union(oreValidator, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    if (
      args.monthlyBudgetOre !== null &&
      (!Number.isSafeInteger(args.monthlyBudgetOre) ||
        args.monthlyBudgetOre <= 0 ||
        args.monthlyBudgetOre > 100_000_000)
    )
      throw userError("Ugyldig budsjett.");
    await ctx.db.patch("households", member.householdId, {
      monthlyBudgetOre: args.monthlyBudgetOre ?? undefined,
    });

    return null;
  },
});

export const rename = mutation({
  args: { name: v.string(), previousName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const household = await ctx.db.get("households", member.householdId);
    const name = args.name.trim();

    if (!name || name.length > 80) throw userError("Bruk 1–80 tegn i navnet.");

    if (!household || household.name !== args.previousName)
      throw userError("Navnet er endret. Lukk og åpne navnefeltet på nytt.");
    await ctx.db.patch("households", household._id, { name });

    return null;
  },
});

export const rotateInvitation = mutation({
  args: { invitation: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    if (!/^[a-f0-9]{32}$/.test(args.invitation))
      throw userError("Ugyldig invitasjon.");
    await ctx.db.patch("households", member.householdId, {
      invitation: args.invitation,
    });

    return null;
  },
});
