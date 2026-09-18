import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import type { Receipt } from "@/lib/domain/insights";
import { productSearch, validateSearchSuggestion } from "@/lib/catalog/search";
import type { SearchRepair } from "@/lib/catalog/search-repair";

/** Optional foreground work. Receipt processing never waits for the local model. */
export function CatalogSearchRepair({
  receipts,
  enabled,
}: {
  receipts: Receipt[];
  enabled: boolean;
}) {
  const convex = useConvex();
  const latest = useRef({ receipts, enabled });
  useEffect(() => {
    latest.current = { receipts, enabled };
  }, [receipts, enabled]);
  useEffect(() => {
    const intelligence = ReceiptIntelligence;
    if (Platform.OS !== "ios" || !intelligence?.suggestProductSearch) return;
    let mounted = true;
    let running = false;
    const checked = new Map<string, number>();
    const canContinue = () =>
      mounted && latest.current.enabled && AppState.currentState === "active";
    const run = async () => {
      if (running || !canContinue()) return;
      running = true;
      try {
        if (await intelligence.availability()) return;
        for (const receipt of latest.current.receipts) {
          if (!canContinue()) return;
          if (
            receipt.excluded ||
            receipt.catalogStatus !== "complete" ||
            !receipt.data?.lines.some(
              (line) =>
                line.kind === "product" &&
                !line.catalogProduct &&
                !line.productMatchManual,
            )
          )
            continue;
          const key = JSON.stringify([
            receipt._id,
            receipt.generation,
            receipt.revision,
            receipt.catalogSearchRepairs,
          ]);
          if ((checked.get(key) ?? 0) > Date.now()) continue;
          // Retry transient failures later; never cache them as a model decision.
          checked.set(key, Date.now() + 60000);
          const pending = await convex.query(api.catalogSearchRepair.pending, {
            id: receipt._id,
          });
          const repairs: SearchRepair[] = [];
          const suggestions = new Map<string, string | null>();
          for (const item of pending.items) {
            if (!canContinue()) return;
            const name = productSearch(item.name);
            let search = item.search;
            if (!item.cached) {
              if (!suggestions.has(name)) {
                const result = await intelligence.suggestProductSearch!(name);
                suggestions.set(name, validateSearchSuggestion(name, result));
              }
              search = suggestions.get(name) ?? null;
            }
            repairs.push({
              lineId: item.lineId,
              evidenceKey: item.evidenceKey,
              search,
            });
          }
          if (!canContinue()) return;
          if (repairs.length)
            await convex.mutation(api.catalogSearchRepair.submit, {
              id: receipt._id,
              generation: pending.generation,
              store: pending.store,
              repairs,
            });
          checked.set(key, Infinity);
        }
      } catch {
        // Offline, unavailable models and service errors leave the normal result usable.
      } finally {
        running = false;
      }
    };
    const initial = setTimeout(() => void run(), 0);
    const interval = setInterval(() => void run(), 15000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void run();
    });
    return () => {
      mounted = false;
      clearTimeout(initial);
      clearInterval(interval);
      listener.remove();
    };
  }, [convex]);
  return null;
}
