import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Provider } from "./rateLimits";

/** SDK retries pass through the same persisted quota before each network attempt. */
export function providerFetch(
  ctx: Pick<ActionCtx, "runMutation">,
  provider: Provider,
): typeof fetch {
  return async (input, init) => {
    await ctx.runMutation(internal.rateLimits.consumeProvider, { provider });

    return fetch(input, init);
  };
}
