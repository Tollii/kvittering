import type { Id } from "../../convex/_generated/dataModel";
import type { CachedHousehold } from "./receipt-storage";

type ServerHousehold = { household: { _id: Id<"households">; name: string } };

/**
 * The server's answer wins once it arrives, including "no household". Until
 * then (starting up, reconnecting, or offline) the owner's last known
 * household keeps capture available without waiting for the network.
 */
export function visibleHousehold(
  server: ServerHousehold | null | undefined,
  cached: CachedHousehold | null,
): CachedHousehold | null {
  if (server === undefined) return cached;

  return server && { id: server.household._id, name: server.household.name };
}
