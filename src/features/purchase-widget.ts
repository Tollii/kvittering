import { useEffect } from "react";
import { useHousehold } from "./session";
import { storageSuffix } from "@/lib/deployment-storage";
import { updatePurchaseWidget } from "@/lib/purchase-widget";
import { purchaseWidgetData } from "@/lib/purchase-widget-data";

/** Reuse the complete spending subscription, never fetch household history for a widget. */
export function usePurchaseWidget({
  ready,
  month,
  amountOre,
  provisional,
}: Readonly<{
  ready: boolean;
  month: string;
  amountOre: number;
  provisional: number;
}>) {
  const { owner, household, details } = useHousehold();
  const budgetOre = details?.household.monthlyBudgetOre ?? null;
  const scope = `${storageSuffix}:${owner}:${household.id}`;
  useEffect(() => {
    if (!ready || !details) return;
    updatePurchaseWidget(
      scope,
      purchaseWidgetData({
        month,
        amountOre,
        budgetOre,
        provisional,
        now: new Date(),
      }),
    );
  }, [ready, details, scope, month, amountOre, budgetOre, provisional]);
}
