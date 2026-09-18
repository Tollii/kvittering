import { Pressable, View } from "react-native";
import { useTheme } from "@/constants/theme";
import { Copy, Row, Sheet } from "./ui";
import { openReceipt } from "./receipt-card";
import { formatMoney } from "@/lib/domain/receipt";
import type { SpendingGroup } from "@/lib/domain/insights";
export function SpendingBars({
  rows,
  onSelect,
}: {
  rows: SpendingGroup[];
  onSelect: (row: SpendingGroup) => void;
}) {
  const colors = useTheme();
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(row.amountOre)));
  return (
    <View style={{ gap: 18 }}>
      {rows.map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          accessibilityLabel={`${row.name}, ${formatMoney(row.amountOre)}`}
          onPress={() => onSelect(row)}
          style={{ minHeight: 48, gap: 8 }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Copy style={{ flex: 1 }}>{row.name}</Copy>
            <Copy weight="600">{formatMoney(row.amountOre)}</Copy>
          </View>
          <View
            style={{
              height: 7,
              backgroundColor: colors.muted,
              borderRadius: 4,
            }}
          >
            <View
              style={{
                height: 7,
                borderRadius: 4,
                width: `${Math.max(1, (Math.abs(row.amountOre) / maximum) * 100)}%`,
                backgroundColor:
                  row.amountOre < 0 ? colors.warning : colors.primary,
              }}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
export function SpendingDetails({
  selected,
  onClose,
}: {
  selected: SpendingGroup | null;
  onClose: () => void;
}) {
  return (
    <Sheet title={selected?.name ?? ""} visible={!!selected} onClose={onClose}>
      {selected && (
        <>
          <Copy size={30} weight="700">
            {formatMoney(selected.amountOre)}
          </Copy>
          {selected.contributions.map((contribution, index) => (
            <Row
              key={`${contribution.receipt._id}-${index}`}
              title={
                contribution.line?.name ||
                contribution.receipt.data?.store ||
                "Kvittering"
              }
              detail={`${contribution.receipt.data?.purchaseDate ?? "Dato ukjent"} · ${contribution.receipt.status === "reviewed" ? "Kontrollert" : "Foreløpig"}`}
              value={formatMoney(contribution.amountOre)}
              onPress={() => {
                onClose();
                openReceipt(contribution.receipt);
              }}
            />
          ))}
          {!selected.contributions.length && (
            <Copy muted>Ingen kjøp i denne perioden.</Copy>
          )}
        </>
      )}
    </Sheet>
  );
}
