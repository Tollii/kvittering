import { router } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Copy, Icon, pressed } from "./ui";
import { radius, useTheme } from "@/constants/theme";
import { formatDate } from "@/lib/format-date";
import { reviewSummary } from "@/lib/domain/receipt-review";
import type { Receipt } from "@/lib/domain/insights";
import { formatMoney } from "@/lib/domain/receipt";
export const statusLabels: Record<Receipt["status"], string> = {
  uploading: "Laster opp",
  uploaded: "Venter på lesing",
  processing: "Leser kvitteringen",
  needs_review: "Til kontroll",
  reviewed: "Kontrollert",
  failed: "Lesingen mislyktes",
};
export function receiptStatusLabel(receipt: Receipt) {
  if (receipt.excluded) return "Utelatt fra forbruk";
  return receipt.status === "reviewed" && receipt.autoAccepted
    ? "Godkjent automatisk"
    : statusLabels[receipt.status];
}
export function receiptNeeds(receipt: Receipt) {
  return reviewSummary(
    receipt.data,
    !!receipt.duplicateOf && !receipt.duplicateResolved,
  );
}
export function openReceipt(receipt: Receipt) {
  router.push({ pathname: "/receipt/[id]", params: { id: receipt._id } });
}
export function ReceiptCard({
  receipt,
  compact = false,
}: {
  receipt: Receipt;
  compact?: boolean;
}) {
  const colors = useTheme();
  const busy = ["uploading", "uploaded", "processing"].includes(receipt.status);
  const needs = receipt.status === "needs_review" ? receiptNeeds(receipt) : [];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${receipt.data?.store || "Ny kvittering"}, ${formatMoney(receipt.data?.totalOre ?? null)}, ${receiptStatusLabel(receipt)}${needs.length ? `. ${needs.join(", ")}` : ""}`}
      onPress={() => openReceipt(receipt)}
      style={(state) => [
        {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderCurve: "continuous",
          overflow: "hidden",
          flexDirection: "row",
          boxShadow: `0 1px 2px ${colors.shadow}, 0 6px 16px ${colors.shadow}`,
        },
        pressed(state),
      ]}
    >
      <View style={{ flex: 1, padding: compact ? 12 : 14, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Copy weight="600" size={16} numberOfLines={1}>
              {receipt.data?.store || "Ny kvittering"}
            </Copy>
            <Copy size={13} muted numberOfLines={1}>
              {formatDate(receipt.data?.purchaseDate)}
              {receipt.data?.branch ? ` · ${receipt.data.branch}` : ""}
            </Copy>
          </View>
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            receipt.data && (
              <Copy weight="700" size={17}>
                {formatMoney(receipt.data.totalOre)}
              </Copy>
            )
          )}
          <Icon name="chevron.right" size={12} color={colors.secondary} />
        </View>
        {(!compact || needs.length > 0 || receipt.error) && (
          <Copy size={12} weight="500" numberOfLines={2} muted>
            <Copy
              size={12}
              weight="600"
              style={{
                color:
                  receipt.status === "failed"
                    ? colors.danger
                    : receipt.status === "needs_review"
                      ? colors.primary
                      : colors.secondary,
              }}
            >
              {receiptStatusLabel(receipt)}
            </Copy>
            {needs.length > 0
              ? ` · ${needs.slice(0, 3).join(" · ")}${needs.length > 3 ? ` · +${needs.length - 3}` : ""}`
              : ""}
          </Copy>
        )}
        {!!receipt.error && (
          <Copy size={12} style={{ color: colors.danger }}>
            {receipt.error}
          </Copy>
        )}
      </View>
    </Pressable>
  );
}
