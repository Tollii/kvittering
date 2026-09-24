import { CalendarDate } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useTheme } from "@/constants/theme";
import { Copy, Panel, Row, Sheet } from "./ui";
import { openReceipt, receiptStatusLabel } from "./receipt-card";
import { contributionKey, type SpendingGroup } from "@/lib/domain/insights";

export function SpendingBars({
  rows,
  total,
  onSelect,
}: Readonly<{
  rows: SpendingGroup[];
  /** When given, each row shows its share of this amount. */
  total?: number;
  onSelect: (row: SpendingGroup) => void;
}>) {
  const colors = useTheme();
  const { fontScale } = useWindowDimensions();
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(row.amountOre)));

  return (
    <View>
      {rows.map((row, index) => {
        const share =
          total && total > 0
            ? Math.round((Math.abs(row.amountOre) / total) * 100)
            : null;

        const shareLabel = share !== null ? `, ${share} prosent` : "";

        return (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={`${row.name}, ${Ore.format(row.amountOre)}${shareLabel}`}
            onPress={() => onSelect(row)}
            style={({ pressed }) => ({
              minHeight: 62,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              gap: 6,
              justifyContent: "center",
              paddingVertical: 10,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <Copy
                size={15}
                weight="500"
                style={fontScale > 1.3 ? { width: "100%" } : { flex: 1 }}
              >
                {row.name}
              </Copy>
              {share !== null && (
                <Copy size={12} muted>
                  {share} %
                </Copy>
              )}
              <Copy size={15} weight="600">
                {Ore.format(row.amountOre)}
              </Copy>
            </View>
            <View
              style={{
                height: 4,
                backgroundColor: colors.muted,
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  width: `${row.amountOre === 0 ? 0 : Math.max(2, (Math.abs(row.amountOre) / maximum) * 100)}%`,
                  backgroundColor:
                    row.amountOre < 0
                      ? colors.warning
                      : colors.chart[Math.min(index, 3)],
                }}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SpendingDetails({
  selected,
  onClose,
}: Readonly<{
  selected: SpendingGroup | null;
  onClose: () => void;
}>) {
  const colors = useTheme();

  return (
    <Sheet title={selected?.name ?? ""} visible={!!selected} onClose={onClose}>
      {selected && (
        <>
          <Copy size={34} weight="800">
            {Ore.format(selected.amountOre)}
          </Copy>
          <Copy size={13} muted>
            {selected.contributions.length}{" "}
            {selected.contributions.length === 1 ? "post" : "poster"} i perioden
          </Copy>
          <Panel style={{ gap: 0, paddingVertical: 4 }}>
            {selected.contributions.map((contribution, index) => (
              <View
                key={contributionKey(contribution)}
                style={{
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.line,
                }}
              >
                <Row
                  title={
                    contribution.line?.name ||
                    contribution.receipt.data?.store ||
                    "Kvittering"
                  }
                  detail={`${CalendarDate.format(contribution.receipt.data?.purchaseDate)} · ${contribution.line ? (contribution.receipt.data?.store ?? "") : receiptStatusLabel(contribution.receipt)}`}
                  value={Ore.format(contribution.amountOre)}
                  onPress={() => {
                    onClose();
                    openReceipt(contribution.receipt);
                  }}
                />
              </View>
            ))}
            {!selected.contributions.length && (
              <Copy muted style={{ paddingVertical: 10 }}>
                Ingen kjøp i denne perioden.
              </Copy>
            )}
          </Panel>
        </>
      )}
    </Sheet>
  );
}
