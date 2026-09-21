import { useState } from "react";
import { requireNativeView } from "expo";
import type { ViewProps } from "react-native";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";

type TipKind = "matching" | "widget";

const NativeTip = ReceiptIntelligence?.supportsReceiptTips?.()
  ? requireNativeView<
      ViewProps & {
        kind: TipKind;
        onHeightChange: (event: { nativeEvent: { height: number } }) => void;
      }
    >("ReceiptIntelligence")
  : null;

export function ReceiptTip({ kind }: Readonly<{ kind: TipKind }>) {
  const [height, setHeight] = useState(120);

  if (!NativeTip) return null;

  return (
    <NativeTip
      kind={kind}
      style={{ height }}
      onHeightChange={(event) => setHeight(Math.ceil(event.nativeEvent.height))}
    />
  );
}

export function completeReceiptTip(kind: TipKind) {
  ReceiptIntelligence?.completeReceiptTip?.(kind);
}
