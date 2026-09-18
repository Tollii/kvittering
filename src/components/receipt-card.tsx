import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Copy, Icon } from "./ui";
import { useTheme } from "@/constants/theme";
import { formatDate } from "@/lib/format-date";
import { lineReviewIssues } from "@/lib/domain/receipt-review";
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
export function receiptStatusLabel(receipt: Receipt) {
  if (receipt.excluded) return "Utelatt";
  return receipt.status === "reviewed" && receipt.autoAccepted
    ? "Automatisk godkjent"
    : statusLabels[receipt.status];
}
export function openReceipt(receipt: Receipt) {
  router.push({ pathname: "/receipt/[id]", params: { id: receipt._id } });
}
export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const colors = useTheme();
  const uncertain =
    receipt.data?.lines.filter((line) => lineReviewIssues(line).length)
      .length ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => openReceipt(receipt)}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 14,
        gap: 6,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Copy weight="600">{receipt.data?.store || "Ny kvittering"}</Copy>
          <Copy size={13} muted>
            {formatDate(receipt.data?.purchaseDate)}
            {receipt.data?.branch ? ` · ${receipt.data.branch}` : ""}
          </Copy>
        </View>
        {receipt.data && (
          <Copy weight="600">{formatMoney(receipt.data.totalOre)}</Copy>
        )}
        <Icon name="chevron.right" size={12} />
      </View>
      <Copy
        size={12}
        style={{
          color:
            receipt.status === "needs_review"
              ? colors.warning
              : colors.secondary,
        }}
      >
        {receiptStatusLabel(receipt)}
        {uncertain > 0
          ? ` · ${uncertain} ${uncertain === 1 ? "vare" : "varer"} må sjekkes`
          : ""}
        {receipt.duplicateOf && !receipt.duplicateResolved
          ? " · Mulig duplikat"
          : ""}
      </Copy>
      {!!receipt.error && (
        <Copy size={12} style={{ color: colors.danger }}>
          {receipt.error}
        </Copy>
      )}
    </Pressable>
  );
}
