import { useState } from "react";
import { Pressable, View } from "react-native";
import { Copy, Icon, Panel, Row, pressed } from "./ui";
import { useTheme } from "@/constants/theme";
import {
  familyInsights,
  formatPurchaseQuantity,
  partialQuantity,
} from "@/lib/domain/family-insights";
import type { Receipt } from "@/lib/domain/insights";
import { formatMoney } from "@/lib/domain/receipt";
import { formatDate } from "@/lib/format-date";
import { openReceipt } from "./receipt-card";

/** Sheet content: quantities of the same product across pack sizes and stores. */
export function FamilyPurchases({
  receipts,
  onClose,
}: Readonly<{
  receipts: Receipt[];
  onClose: () => void;
}>) {
  const colors = useTheme();
  const report = familyInsights(receipts);
  const [selection, setSelection] = useState<string | null>(null);
  const selected = report.families.find((family) => family.id === selection);

  if (!report.total) return <Copy muted>Ingen varer i perioden</Copy>;

  if (selected)
    return (
      <>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelection(null)}
          style={(state) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              minHeight: 44,
            },
            pressed(state),
          ]}
        >
          <Icon name="chevron.left" size={12} />
          <Copy size={14} weight="600" style={{ color: colors.primary }}>
            Alle
          </Copy>
        </Pressable>
        <Copy size={30} weight="800">
          {formatPurchaseQuantity(selected.quantity)}
        </Copy>
        <Copy muted>
          {selected.name} · {formatMoney(selected.amountOre)}
        </Copy>
        {partialQuantity(selected) && (
          <Copy muted size={13}>
            Noen mengder mangler
          </Copy>
        )}
        <Panel style={{ gap: 0, paddingVertical: 4 }}>
          {selected.contributions.map((item, index) => (
            <View
              key={`${item.receipt._id}:${item.line.id}`}
              style={{
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
              }}
            >
              <Row
                title={item.line.catalogProduct?.name ?? item.line.name}
                detail={`${formatDate(item.receipt.data.purchaseDate)} · ${formatPurchaseQuantity(item.quantity)}`}
                value={formatMoney(item.amountOre)}
                onPress={() => {
                  onClose();
                  openReceipt(item.receipt);
                }}
              />
            </View>
          ))}
        </Panel>
      </>
    );

  return (
    <>
      <Panel style={{ gap: 0, paddingVertical: 4 }}>
        {report.families.map((family, index) => (
          <View
            key={family.id}
            style={{
              borderTopWidth: index ? 1 : 0,
              borderTopColor: colors.line,
            }}
          >
            <Row
              title={family.name}
              detail={`${formatPurchaseQuantity(family.quantity)}${partialQuantity(family) ? " · delvis kjent" : ""}`}
              value={formatMoney(family.amountOre)}
              onPress={() => setSelection(family.id)}
            />
          </View>
        ))}
      </Panel>
      {report.linked < report.total && (
        <Copy muted size={12}>
          {report.linked} av {report.total} varelinjer gruppert
          {report.pending ? " · analyserer …" : ""}
        </Copy>
      )}
    </>
  );
}

export function familySummary(receipts: Receipt[]) {
  const report = familyInsights(receipts);

  return report.total ? `${report.families.length} produkter` : undefined;
}
