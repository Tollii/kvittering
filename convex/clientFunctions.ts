import { customMutation } from "convex-helpers/server/customFunctions";
import { mutation } from "./serverFunctions";
import { clientValidator, type Feature } from "../src/lib/releases/policy";
import { requireCompatibleClient } from "./releasePolicy";

/** Optional metadata preserves the old contract until an operator retires it. */
export const clientMutation = customMutation(mutation, {
  args: { client: clientValidator.optional() },
  input: async (ctx, { client }, options: { service?: Feature }) => {
    await requireCompatibleClient(ctx, client, options.service);

    return { ctx: {}, args: {} };
  },
});
