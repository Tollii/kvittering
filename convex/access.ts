import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function requireMember(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) throw new Error("Logg inn først.");

  const member = await ctx.db
    .query("members")
    .withIndex("by_identity", (q) => q.eq("identity", identity.tokenIdentifier))
    .unique();

  if (!member) throw new Error("Velg en husstand først.");

  return member;
}

export async function requireReceipt(
  ctx: QueryCtx | MutationCtx,
  id: Id<"receipts">,
) {
  const member = await requireMember(ctx);
  const receipt = await ctx.db.get("receipts", id);

  if (!receipt || receipt.householdId !== member.householdId)
    throw new Error("Kvitteringen er ikke tilgjengelig.");

  return { member, receipt };
}
