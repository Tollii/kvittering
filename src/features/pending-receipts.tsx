import { needsAttention } from "@/lib/domain/receipt-state";
import { ReceiptActivityButton } from "@/features/receipt-activity";
import { useCompleteReceipts } from "@/features/receipt-queries";
import { UploadQueueCard } from "@/features/upload-queue-card";
import { SectionTitle } from "@/components/ui";
import { ReceiptCard, openReceipt } from "@/components/receipt-card";
import { SwipeToApprove } from "@/features/swipe-approve";
import { useHousehold } from "@/features/household-context";
import { quickApproveData } from "@/lib/domain/receipt-review";

/** Receipts that wait for a person or are still on their way in, pinned above the months in Kvitteringer. */
export function usePendingReceipts(enabled: boolean) {
  const { queue } = useHousehold();

  const { receipts, loadingReceipts } = useCompleteReceipts(
    { kind: "inbox" },
    enabled,
  );

  const reserved = new Set(queue.map((entry) => entry.receiptId));

  const open = receipts.filter(
    (receipt) =>
      receipt.status !== "reviewed" &&
      !receipt.excluded &&
      !reserved.has(receipt._id),
  );

  const attention = open.filter((receipt) => needsAttention(receipt.status));
  const working = open.filter((receipt) => !needsAttention(receipt.status));

  return {
    attention,
    working,
    queue,
    count: attention.length + working.length + queue.length,
    loading: loadingReceipts,
  };
}

export function PendingReceipts({
  attention,
  working,
  queue,
}: Readonly<ReturnType<typeof usePendingReceipts>>) {
  const { online, retryFailedUploads } = useHousehold();

  return (
    <>
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
    </>
  );
}
