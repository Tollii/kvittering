import { CalendarDate } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import { useState } from "react";
import { Pressable } from "react-native";
import { Amount, Copy, Icon, List, Row, pressed } from "./ui";
import { useTheme } from "@/constants/theme";
import {
  familyInsights,
  formatPurchaseQuantity,
  partialQuantity,
} from "@/lib/domain/family-insights";
import type { Receipt } from "@/lib/domain/insights";
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
        <Amount
          detail={`${selected.name} · ${Ore.format(selected.amountOre)}${partialQuantity(selected) ? " · noen mengder mangler" : ""}`}
        >
          {formatPurchaseQuantity(selected.quantity)}
        </Amount>
        <List>
          {selected.contributions.map((item) => (
            <Row
              key={`${item.receipt._id}:${item.line.id}`}
              title={item.line.catalogProduct?.name ?? item.line.name}
              detail={`${CalendarDate.format(item.receipt.data.purchaseDate)} · ${formatPurchaseQuantity(item.quantity)}`}
              value={Ore.format(item.amountOre)}
              onPress={() => {
                onClose();
                openReceipt(item.receipt);
              }}
            />
          ))}
        </List>
      </>
    );

  return (
    <>
      <List>
        {report.families.map((family) => (
          <Row
            key={family.id}
            title={family.name}
            detail={`${formatPurchaseQuantity(family.quantity)}${partialQuantity(family) ? " · delvis kjent" : ""}`}
            value={Ore.format(family.amountOre)}
            onPress={() => setSelection(family.id)}
          />
        ))}
      </List>
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
