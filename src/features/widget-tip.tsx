import { z } from "zod";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import Storage from "expo-sqlite/kv-store";
import { ReceiptTip, completeReceiptTip } from "@/components/receipt-tip";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { reportError } from "@/lib/observability";

export function WidgetTip() {
  const [eligible, setEligible] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const visits = Math.min(
        3,
        z.coerce
          .number()
          .int()
          .min(0)
          .max(3)
          .catch(0)
          .parse(Storage.getItemSync("spending-tip-visits")) + 1,
      );

      Storage.setItemSync("spending-tip-visits", String(visits));

      if (visits === 3) {
        void ReceiptIntelligence?.hasPurchaseWidget?.()
          .then((installed) => {
            if (!active) return;

            if (installed) completeReceiptTip("widget");
            setEligible(!installed);
          })
          .catch((error) => reportError(error, "widget.tip"));
      }

      return () => {
        active = false;
      };
    }, []),
  );

  return eligible ? <ReceiptTip kind="widget" /> : null;
}
