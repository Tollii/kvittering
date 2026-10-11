import { Button, ContextMenu, Host, RNHostView } from "@expo/ui/swift-ui";
import { router } from "expo-router";
import { Share, View, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import { reportError } from "@/lib/observability";
import { useState } from "react";
import { useLargeText } from "@/components/ui";
import type { ReceiptContextMenuProps } from "./receipt-context-menu";

export function ReceiptContextMenu({
  receiptId,
  store,
  amount,
  date,
  children,
}: ReceiptContextMenuProps) {
  const [width, setWidth] = useState<number>();
  const { fontScale } = useWindowDimensions();
  const largeText = useLargeText();

  // The SwiftUI host keeps the height it first measures, so a row that wraps
  // at large text overlaps the next one even when remeasured. There the row
  // stands alone and still opens the receipt with a tap.
  if (largeText) return <>{children}</>;

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {/* A new width or text size remounts the host, so it measures again. */}
      <Host key={`${width}:${fontScale}`} matchContents={{ vertical: true }}>
        <ContextMenu>
          <ContextMenu.Trigger>
            <RNHostView matchContents>
              <View style={{ width }}>{children}</View>
            </RNHostView>
          </ContextMenu.Trigger>
          <ContextMenu.Items>
            <Button
              label="Åpne kvittering"
              systemImage="receipt"
              onPress={() =>
                router.push({
                  pathname: "/receipt/[id]",
                  params: { id: receiptId },
                })
              }
            />
            <Button
              label="Kopier beløp"
              systemImage="doc.on.doc"
              onPress={() => {
                void Clipboard.setStringAsync(amount).catch((error) =>
                  reportError(error, "receipt.copy"),
                );
              }}
            />
            <Button
              label="Del kjøpsoversikt"
              systemImage="square.and.arrow.up"
              onPress={() => {
                void Share.share({
                  message: `${store} · ${date} · ${amount}`,
                }).catch((error) => reportError(error, "receipt.share"));
              }}
            />
          </ContextMenu.Items>
        </ContextMenu>
      </Host>
    </View>
  );
}
