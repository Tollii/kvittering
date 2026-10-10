import { needsAttention } from "@/lib/domain/receipt-state";
import { ReceiptActivityButton } from "@/features/receipt-activity";
import { useCompleteReceipts } from "@/features/receipt-queries";
import { UploadQueueCard } from "@/features/upload-queue-card";
import { router } from "expo-router";
import {
  Button,
  IconButton,
  Loading,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { IllustratedEmpty } from "@/components/monument-artwork";
import { ReceiptCard, openReceipt } from "@/components/receipt-card";
import { SwipeToApprove } from "@/features/swipe-approve";
import { useHousehold } from "@/features/household-context";
import { OfflineNotice } from "@/features/offline-notice";
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
      <OfflineNotice />
      {loadingReceipts && <Loading />}
      {attention.length > 0 && (
        <>
          <SectionTitle
            title="Til kontroll"
            detail={
              attention.some(
                (receipt) =>
                  !!quickApproveData(
                    receipt.data,
                    !!receipt.duplicateOf && !receipt.duplicateResolved,
                  ),
              )
                ? "Sveip til venstre for å godkjenne"
                : undefined
            }
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
          {queue.map((entry) => (
            <UploadQueueCard
              key={entry.id}
              entry={entry}
              online={online}
              onRetry={() => void retryFailedUploads()}
            />
          ))}
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
