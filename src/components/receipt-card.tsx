import { Ore } from "@/lib/domain/ore";
import { isReceiptProcessing } from "@/lib/domain/receipt-status";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { Copy, Icon, pressed } from "./ui";
import { radius, useTheme } from "@/constants/theme";
import { formatDate } from "@/lib/format-date";
import { reviewSummary } from "@/lib/domain/receipt-review";
import type { Receipt } from "@/lib/domain/insights";

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
}: Readonly<{
  receipt: Receipt;
  compact?: boolean;
}>) {
  const colors = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const busy = isReceiptProcessing(receipt.status);
  const needs = receipt.status === "needs_review" ? receiptNeeds(receipt) : [];

  const reviewLabel = needs.length ? `. ${needs.join(", ")}` : "";
  const remainingLabel = needs.length > 3 ? ` · +${needs.length - 3}` : "";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${receipt.data?.store || "Ny kvittering"}, ${Ore.format(receipt.data?.totalOre ?? null)}, ${receiptStatusLabel(receipt)}${reviewLabel}`}
      onPress={() => openReceipt(receipt)}
      style={(state) => [
        {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderCurve: "continuous",
          overflow: "hidden",
          flexDirection: "row",
        },
        pressed(state),
      ]}
    >
      <View
        style={{
          flex: 1,
          padding: 16,
          paddingVertical: compact ? 12 : 16,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Copy weight="600" size={17}>
              {receipt.data?.store || "Ny kvittering"}
            </Copy>
            <Copy size={13} muted>
              {formatDate(receipt.data?.purchaseDate)}
              {receipt.data?.branch ? ` · ${receipt.data.branch}` : ""}
            </Copy>
            {stacked && !busy && receipt.data && (
              <Copy weight="700" size={17}>
                {Ore.format(receipt.data.totalOre)}
              </Copy>
            )}
          </View>
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            !stacked &&
            receipt.data && (
              <Copy
                weight="700"
                size={17}
                style={{ flexShrink: 1, textAlign: "right" }}
              >
                {Ore.format(receipt.data.totalOre)}
              </Copy>
            )
          )}
          <Icon name="chevron.right" size={12} color={colors.secondary} />
        </View>
        {!!(!compact || needs.length > 0 || receipt.error) && (
          <Copy size={13} weight="500" muted>
            <Copy
              size={13}
              weight="600"
              style={{
                color:
                  receipt.status === "failed"
                    ? colors.danger
                    : receipt.status === "needs_review"
                      ? colors.warning
                      : colors.secondary,
              }}
            >
              {receiptStatusLabel(receipt)}
            </Copy>
            {needs.length > 0
              ? ` · ${needs.slice(0, 3).join(" · ")}${remainingLabel}`
              : ""}
          </Copy>
        )}
        {!!receipt.error && (
          <Copy size={13} style={{ color: colors.danger }}>
            {receipt.error}
          </Copy>
        )}
      </View>
    </Pressable>
  );
}
