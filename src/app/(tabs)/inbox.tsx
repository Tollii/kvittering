import { router } from "expo-router";
import { View } from "react-native";
import {
  Button,
  Copy,
  Empty,
  Loading,
  Notice,
  Panel,
  Screen,
} from "@/components/ui";
import { ReceiptCard } from "@/components/receipt-card";
import { useHousehold } from "@/features/session";
export default function Inbox() {
  const { receipts, loadingReceipts, queue, online, synchronize } =
    useHousehold();
  const reserved = new Set(queue.map((entry) => entry.receiptId));
  const pending = receipts.filter(
    (receipt) =>
      receipt.status !== "reviewed" &&
      !receipt.excluded &&
      !reserved.has(receipt._id),
  );
  return (
    <Screen
      title="Innboks"
      subtitle={
        pending.length
          ? `${pending.length} ${pending.length === 1 ? "kvittering" : "kvitteringer"} venter`
          : undefined
      }
      settings
    >
      {!online && (
        <Notice>
          Uten nett. Lagrede bilder lastes opp når forbindelsen er tilbake.
        </Notice>
      )}
      {queue.length > 0 && (
        <Panel>
          <Copy size={16} weight="600">
            På denne enheten
          </Copy>
          {queue.map((entry) => (
            <View key={entry.id} style={{ gap: 4 }}>
              <Copy weight="600">{entry.images.length} bilde(r) lagret</Copy>
              <Copy muted>
                {entry.uploaded.filter(Boolean).length} av {entry.images.length}{" "}
                lastet opp
              </Copy>
              {!!entry.error && <Notice error>{entry.error}</Notice>}
            </View>
          ))}
          <Button
            title="Prøv opplasting"
            onPress={() => void synchronize()}
            disabled={!online}
            secondary
          />
        </Panel>
      )}
      {loadingReceipts ? (
        <Loading />
      ) : (
        pending.map((receipt) => (
          <ReceiptCard key={receipt._id} receipt={receipt} />
        ))
      )}
      {!loadingReceipts && pending.length === 0 && queue.length === 0 && (
        <>
          <Empty
            title="Innboksen er tom."
            message="Ta et bilde neste gang dere handler."
          />
          <Button
            title="Ny kvittering"
            icon="camera"
            onPress={() => router.navigate("/")}
          />
        </>
      )}
    </Screen>
  );
}
