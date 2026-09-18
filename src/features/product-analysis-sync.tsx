import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Receipt } from "@/lib/domain/insights";
import { productAnalysisVersion } from "@/lib/domain/product-families";

/** Older receipts receive the same analysis as newly processed receipts. */
export function ProductAnalysisSync({
  receipts,
  enabled,
}: {
  receipts: Receipt[];
  enabled: boolean;
}) {
  const convex = useConvex();
  const state = useRef({ receipts, enabled });
  useEffect(() => {
    state.current = { receipts, enabled };
  }, [receipts, enabled]);
  useEffect(() => {
    let running = false;
    let disposed = false;
    const run = async () => {
      if (
        running ||
        disposed ||
        !state.current.enabled ||
        AppState.currentState !== "active"
      )
        return;
      const ids = state.current.receipts
        .filter((receipt) => {
          if (
            !receipt.data ||
            receipt.excluded ||
            receipt.catalogStatus === "pending" ||
            !["reviewed", "needs_review"].includes(receipt.status)
          )
            return false;
          const analysis = receipt.productAnalysis;
          return (
            !analysis ||
            analysis.version !== productAnalysisVersion ||
            analysis.generation !== receipt.generation ||
            analysis.revision !== receipt.revision ||
            (analysis.state === "error" &&
              Date.now() - analysis.updatedAt >= 300000)
          );
        })
        .map((receipt) => receipt._id);
      if (!ids.length) return;
      running = true;
      try {
        for (let offset = 0; offset < ids.length && !disposed; offset += 20)
          await convex.mutation(api.productAnalysis.ensure, {
            ids: ids.slice(offset, offset + 20),
          });
      } catch {
        /* Retry after reconnection; receipt use remains available. */
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), 30000);
    const listener = AppState.addEventListener("change", () => void run());
    return () => {
      disposed = true;
      clearInterval(timer);
      listener.remove();
    };
  }, [convex, enabled]);
  return null;
}
