import Storage from "expo-sqlite/kv-store";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { setPurchaseWidgetScope } from "@/lib/purchase-widget";
import { clearReceiptActivity } from "./receipt-activity";
import { clearReceiptSearch } from "./spotlight";

const scopeKey = "receipt-system-scope";

/** Keep native receipt data and transfers within the active account and household. */
export function retainReceiptSystemScope(scope: string | null) {
  const previous = Storage.getItemSync(scopeKey);

  if (scope === null || previous !== scope) {
    clearReceiptSearch();
    clearReceiptActivity();
  }

  if (scope === null) Storage.removeItemSync(scopeKey);
  else Storage.setItemSync(scopeKey, scope);
  setPurchaseWidgetScope(scope);
  ReceiptIntelligence?.retainUploadScope?.(scope);
}
