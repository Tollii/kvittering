import { userError } from "./userErrors";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { UserIdentity } from "convex/server";
import { setRequester, traced } from "../src/lib/tracing";

/**
 * The caller's membership, if any. Every access check looks members up
 * here, so each request's spans name the account and household it acts for.
 */
export const memberOf = traced(
  "access.memberOf",
  async function memberOf(ctx: QueryCtx | MutationCtx, identity: UserIdentity) {
    const member = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) =>
        q.eq("identity", identity.tokenIdentifier),
      )
      .unique();

    setRequester(identity.subject, member?.householdId);

    return member;
  },
);

export const requireMember = traced(
  "access.requireMember",
  async function requireMember(ctx: QueryCtx | MutationCtx) {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) throw userError("Logg inn først.");

    const member = await memberOf(ctx, identity);

    if (!member) throw userError("Velg en husstand først.");

    return member;
  },
);

export const requireReceipt = traced(
  "access.requireReceipt",
  async function requireReceipt(
    ctx: QueryCtx | MutationCtx,
    id: Id<"receipts">,
  ) {
    const member = await requireMember(ctx);
    const receipt = await ctx.db.get("receipts", id);

    if (!receipt || receipt.householdId !== member.householdId)
      throw userError("Kvitteringen er ikke tilgjengelig.");

    return { member, receipt };
  },
);
