import type { FunctionArgs } from "convex/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Provider, ProviderSource } from "./rateLimits";

/** SDK retries pass through the same persisted quota before each network attempt. */
export function providerFetch(
  ctx: Pick<ActionCtx, "runMutation">,
  provider: Provider,
  source?: ProviderSource,
): typeof fetch {
  return async (input, init) => {
    const args: FunctionArgs<typeof internal.rateLimits.consumeProvider> = {
      provider,
    };

    if (source) args.source = source;
    await ctx.runMutation(internal.rateLimits.consumeProvider, args);

    return fetch(input, init);
  };
}
