import { requireOptionalNativeModule } from "expo";
import Storage from "expo-sqlite/kv-store";
import {
  emptyPurchaseWidget,
  type PurchaseWidgetData,
} from "./purchase-widget-data";
import { reportError } from "./observability";

const scopeKey = "purchase-widget-scope";

let revision = 0;

/** Lazy loading keeps an older development binary usable until its native rebuild. */
function publish(data: PurchaseWidgetData) {
  revision += 1;
  const request = revision;

  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  void import("../widgets/purchase-widget")
    .then(({ default: widget }) => {
      if (request === revision) widget.updateSnapshot(data);
    })
    .catch((error) => reportError(error, "widget.update"));
}

export function setPurchaseWidgetScope(scope: string | null) {
  const previous = Storage.getItemSync(scopeKey);

  if (scope !== null && previous === scope) return;

  if (scope) Storage.setItemSync(scopeKey, scope);
  else Storage.removeItemSync(scopeKey);
  publish(emptyPurchaseWidget);
}

export function updatePurchaseWidget(scope: string, data: PurchaseWidgetData) {
  setPurchaseWidgetScope(scope);
  publish(data);
}
