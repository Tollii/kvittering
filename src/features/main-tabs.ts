import { useCachedReceipts } from "@/features/receipt-cache-context";
import { useQueryLifecycle } from "@/features/query-lifecycle";
import { useHousehold } from "@/features/household-context";
import { useQuery } from "convex/react";
import { type SFSymbol } from "expo-symbols";
import { api } from "../../convex/_generated/api";

/**
 * The main tabs, in order. The iOS layout shows them as native tabs; the web
 * layout draws a tab bar that looks like them for browser checks.
 */
export const mainTabs: readonly {
  name: "index" | "spending" | "receipts";
  label: string;
  icon: SFSymbol;
  selectedIcon?: SFSymbol;
}[] = [
  {
    name: "index",
    label: "Kamera",
    icon: "camera",
    selectedIcon: "camera.fill",
  },
  { name: "spending", label: "Forbruk", icon: "chart.bar.xaxis" },
  {
    name: "receipts",
    label: "Kvitteringer",
    icon: "doc.text",
    selectedIcon: "doc.text.fill",
  },
];

/** The Kvitteringer badge: receipts and uploads that need a person, if any. */
export function useReceiptsBadge() {
  const { queue } = useHousehold();
  const cache = useCachedReceipts();
  const { active, online } = useQueryLifecycle();

  const legacy = useQuery(
    api.receipts.attentionCount,
    !cache.available && active && online ? {} : "skip",
  );

  const attention = cache.available
    ? {
        count: cache.receipts.filter(
          (receipt) =>
            !receipt.excluded &&
            (receipt.status === "needs_review" || receipt.status === "failed"),
        ).length,
        capped: !cache.complete,
      }
    : legacy;

  // Badge only what needs a person; processing receipts resolve on their own.
  const pending =
    (attention?.count ?? 0) + queue.filter((entry) => entry.error).length;

  if (pending === 0) return undefined;

  return attention?.capped ? `${pending}+` : String(pending);
}
