import { router } from "expo-router";
import { Panel, Row, Copy } from "./ui";
import type { Receipt } from "@/lib/domain/insights";
import { formatMoney } from "@/lib/domain/receipt";
export const statusLabels: Record<Receipt["status"], string> = {
  uploading: "Laster opp",
  uploaded: "Venter på behandling",
  processing: "Leser kvitteringen",
  needs_review: "Til kontroll",
  reviewed: "Kontrollert",
  failed: "Behandling mislyktes",
};
export function openReceipt(receipt: Receipt) {
  router.push({ pathname: "/receipt/[id]", params: { id: receipt._id } });
}
export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <Panel>
      <Row
        title={receipt.data?.store || "Ny kvittering"}
        detail={`${receipt.data?.purchaseDate ?? "Dato ukjent"} · ${receipt.uploaderName}`}
        value={receipt.data ? formatMoney(receipt.data.totalOre) : undefined}
        onPress={() => openReceipt(receipt)}
      />
      <Copy size={13} muted>
        {receipt.excluded
          ? "Utelatt fra forbruk"
          : statusLabels[receipt.status]}
        {receipt.duplicateOf && !receipt.duplicateResolved
          ? " · Mulig duplikat"
          : ""}
      </Copy>
      {!!receipt.error && <Copy size={13}>{receipt.error}</Copy>}
    </Panel>
  );
}
