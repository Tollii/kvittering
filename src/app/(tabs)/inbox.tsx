import { needsAttention } from "@/lib/domain/receipt-state";
import { ReceiptActivityButton } from "@/features/receipt-activity";
import { useCompleteReceipts } from "@/features/receipt-queries";
import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import {
  Button,
  Copy,
  Icon,
  IconButton,
  Loading,
  Notice,
  Panel,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { IllustratedEmpty } from "@/components/monument-artwork";
import { ReceiptCard, openReceipt } from "@/components/receipt-card";
import { SwipeToApprove } from "@/features/swipe-approve";
import { useHousehold } from "@/features/household-context";
import { useTheme } from "@/constants/theme";
import { quickApproveData } from "@/lib/domain/receipt-review";

export default function Inbox() {
  const colors = useTheme();
  const { queue, online, retryFailedUploads } = useHousehold();
  const { receipts, loadingReceipts } = useCompleteReceipts({ kind: "inbox" });
  const reserved = new Set(queue.map((entry) => entry.receiptId));

  const open = receipts.filter(
    (receipt) =>
      receipt.status !== "reviewed" &&
      !receipt.excluded &&
      !reserved.has(receipt._id),
  );

  const attention = open.filter((receipt) => needsAttention(receipt.status));

  const working = open.filter((receipt) => !needsAttention(receipt.status));

  const empty = !loadingReceipts && open.length === 0 && queue.length === 0;

  return (
    <Screen
      title="Innboks"
      subtitle={
        attention.length
          ? `${attention.length} til kontroll`
          : working.length + queue.length
            ? "Behandles"
            : undefined
      }
      settings
      headerRight={
        <IconButton
          name="barcode"
          label="Koble produkter"
          color={colors.onHero}
          onPress={() => router.push("/product-linking")}
        />
      }
    >
      {!online && <Notice icon="wifi.slash">Uten nett</Notice>}
      {loadingReceipts && <Loading />}
      {attention.length > 0 && (
        <>
          <SectionTitle
            title="Til kontroll"
            action={attention.length > 1 ? "Start" : undefined}
            onAction={() => {
              const [next] = attention;

              if (next) openReceipt(next);
            }}
          />
          {attention.map((receipt) => (
            <SwipeToApprove
              key={receipt._id}
              receipt={receipt}
              enabled={online}
            >
              <ReceiptCard receipt={receipt} />
            </SwipeToApprove>
          ))}
          {attention.some(
            (receipt) =>
              !!quickApproveData(
                receipt.data,
                !!receipt.duplicateOf && !receipt.duplicateResolved,
              ),
          ) && (
            <Copy size={12} muted style={{ textAlign: "center" }}>
              Sveip for å godkjenne
            </Copy>
          )}
        </>
      )}
      {(working.length > 0 || queue.length > 0) && (
        <>
          <SectionTitle title="Under behandling" />
          <ReceiptActivityButton
            receiptIds={[
              ...new Set([
                ...working.map((receipt) => receipt._id),
                ...queue.flatMap((entry) =>
                  entry.receiptId ? [entry.receiptId] : [],
                ),
              ]),
            ]}
          />
          {queue.map((entry) => {
            const uploaded = entry.uploaded.filter(Boolean).length;

            return (
              <Panel key={entry.id} style={{ gap: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: colors.accentSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {entry.error ? (
                      <Icon
                        name="exclamationmark.circle"
                        size={18}
                        color={colors.danger}
                      />
                    ) : (
                      <ActivityIndicator color={colors.accent} />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Copy weight="600">
                      {entry.images.length === 1
                        ? "Ny kvittering"
                        : `Ny kvittering · ${entry.images.length} bilder`}
                    </Copy>
                    <Copy size={13} muted>
                      {entry.error
                        ? "Prøver igjen"
                        : online
                          ? `Laster opp · ${uploaded} av ${entry.images.length}`
                          : "Venter på nett"}
                    </Copy>
                  </View>
                </View>
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.muted,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      width: `${Math.max(6, (uploaded / entry.images.length) * 100)}%`,
                      backgroundColor: entry.error
                        ? colors.danger
                        : colors.accent,
                    }}
                  />
                </View>
                {!!entry.error && (
                  <Button
                    title="Prøv igjen"
                    variant="tint"
                    compact
                    icon="arrow.clockwise"
                    onPress={() => void retryFailedUploads()}
                    disabled={!online}
                  />
                )}
              </Panel>
            );
          })}
          {working.map((receipt) => (
            <ReceiptCard key={receipt._id} receipt={receipt} compact />
          ))}
        </>
      )}
      {empty && (
        <IllustratedEmpty
          scene="inbox"
          title="Ingen kvitteringer til kontroll"
          message="Alle kvitteringene dine er behandlet."
        />
      )}
      {empty && (
        <Button
          title="Ny kvittering"
          icon="camera"
          onPress={() => router.navigate("/")}
        />
      )}
    </Screen>
  );
}
