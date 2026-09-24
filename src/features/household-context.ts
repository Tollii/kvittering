import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { CachedHousehold } from "@/lib/receipt-storage";
import type { LocalReceipt } from "@/lib/upload-queue";

type Household = NonNullable<FunctionReturnType<typeof api.households.current>>;

export type SessionData = {
  owner: string;
  household: CachedHousehold;
  details: Household | undefined;
  online: boolean;
  queue: LocalReceipt[];
  synchronize: () => Promise<void>;
  regroup: (id: string, selected: number[]) => void;
  retryFailedUploads: () => Promise<void>;
};

/** Provided by SessionProvider once an account and household are known. */
export const SessionContext = createContext<SessionData | null>(null);

export function useHousehold() {
  const value = useContext(SessionContext);

  if (!value) throw new Error("Husstanden er ikke klar.");

  return value;
}
