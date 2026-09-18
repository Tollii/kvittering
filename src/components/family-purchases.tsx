import { useState } from "react";
import { View } from "react-native";
import { Copy, Panel, Row, SectionTitle, Sheet } from "./ui";
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

export function FamilyPurchases({ receipts }: { receipts: Receipt[] }) {
  const colors = useTheme();
  const report = familyInsights(receipts);
  const [selection, setSelection] = useState<string | null>(null);
  const selected = report.families.find((family) => family.id === selection);
  if (!report.total) return null;
  const rows = (all: boolean) =>
    (all ? report.families : report.families.slice(0, 5)).map(
      (family, index) => (
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
      ),
    );
  return (
    <>
      <SectionTitle
        title="Mengder kjøpt"
        action={report.families.length > 5 ? "Se alle" : undefined}
        onAction={() => setSelection("all")}
      />
      <Panel style={{ gap: 0, paddingVertical: 4 }}>
        {rows(false)}
        {report.linked < report.total && (
          <Copy muted size={12} style={{ paddingVertical: 8 }}>
            {report.linked} av {report.total} varelinjer gruppert
            {report.pending
              ? " · analyserer …"
              : report.failed
                ? " · analysen prøves igjen senere"
                : ""}
          </Copy>
        )}
      </Panel>
      <Sheet
        visible={selection !== null}
        title={selected?.name ?? "Mengder kjøpt"}
        onClose={() => setSelection(null)}
      >
        {selected ? (
          <>
            <Copy size={30} weight="800">
              {formatPurchaseQuantity(selected.quantity)}
            </Copy>
            <Copy muted>
              {formatMoney(selected.amountOre)} ·{" "}
              {selected.contributions.length} varelinjer
            </Copy>
            {partialQuantity(selected) && (
              <Copy muted size={13}>
                Noen mengder mangler
              </Copy>
            )}
            {(
              [
                ["units", "Antall"],
                ["grams", "Vekt"],
                ["millilitres", "Volum"],
              ] as const
            )
              .filter(
                ([key]) =>
                  selected.quantity[key] !== null &&
                  selected.coverage[key] < selected.contributions.length,
              )
              .map(([key, label]) => (
                <Copy key={key} muted size={13}>
                  {label} kjent for {selected.coverage[key]} av{" "}
                  {selected.contributions.length} varelinjer.
                </Copy>
              ))}
            <Panel style={{ gap: 0, paddingVertical: 4 }}>
              {selected.contributions.map((item, index) => (
                <View
                  key={`${item.receipt._id}:${item.line!.id}`}
                  style={{
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                  }}
                >
                  <Row
                    title={item.line!.catalogProduct?.name ?? item.line!.name}
                    detail={`${formatDate(item.receipt.data!.purchaseDate)} · ${formatPurchaseQuantity(item.quantity)}`}
                    value={formatMoney(item.amountOre)}
                    onPress={() => {
                      setSelection(null);
                      openReceipt(item.receipt);
                    }}
                  />
                </View>
              ))}
            </Panel>
          </>
        ) : (
          <Panel style={{ gap: 0, paddingVertical: 4 }}>{rows(true)}</Panel>
        )}
      </Sheet>
    </>
  );
}
