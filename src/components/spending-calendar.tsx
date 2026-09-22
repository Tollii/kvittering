import { Pressable, View, useWindowDimensions } from "react-native";
import { Copy, Empty, Row } from "./ui";
import { formatDate } from "@/lib/format-date";
import { useTheme } from "@/constants/theme";
import {
  spendingCalendar,
  type Receipt,
  type SpendingGroup,
} from "@/lib/domain/insights";
import { formatMoney } from "@/lib/domain/receipt";

export function SpendingCalendar({
  receipts,
  month,
  onSelect,
}: Readonly<{
  receipts: Receipt[];
  month: string;
  onSelect: (group: SpendingGroup) => void;
}>) {
  const colors = useTheme();
  const { fontScale, width } = useWindowDimensions();

  const days = spendingCalendar(receipts, Number(month.slice(0, 4))).filter(
    (day) => day.date.startsWith(month),
  );

  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;

  // Use a stronger colour for days with more purchases.
  const shade = (level: number) =>
    level <= 0 ? colors.muted : colors.chart[Math.max(0, 4 - level)];

  const selectDay = (day: (typeof days)[number]) =>
    onSelect({
      id: day.date,
      name: day.date,
      amountOre: day.amountOre,
      contributions: day.contributions,
    });

  // A list preserves readable amounts and separate touch targets at large text sizes.
  if (fontScale > 1.3 || width < 380) {
    const purchases = days.filter((day) => day.contributions.length > 0);

    return (
      <View>
        {purchases.map((day) => (
          <Row
            key={day.date}
            title={formatDate(day.date)}
            detail={`${day.contributions.length} ${day.contributions.length === 1 ? "kvittering" : "kvitteringer"}`}
            value={formatMoney(day.amountOre)}
            onPress={day.future ? undefined : () => selectDay(day)}
          />
        ))}
        {!purchases.length && (
          <Empty title="Ingen kjøp i perioden" icon="calendar" />
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row" }}>
        {["M", "T", "O", "T", "F", "L", "S"].map((label, index) => (
          <Copy
            key={index}
            size={12}
            weight="600"
            muted
            style={{ flex: 1, textAlign: "center" }}
          >
            {label}
          </Copy>
        ))}
      </View>
      <View>
        {Array.from(
          { length: Math.ceil((offset + days.length) / 7) },
          (_, week) => (
            <View key={week} style={{ flexDirection: "row" }}>
              {Array.from({ length: 7 }, (_, weekday) => {
                const day = days[week * 7 + weekday - offset];

                if (!day)
                  return <View key={weekday} style={{ flex: 1, height: 56 }} />;

                return (
                  <Pressable
                    key={day.date}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.date}, ${formatMoney(day.amountOre)}, ${day.contributions.length} kvitteringer`}
                    disabled={day.future || !day.contributions.length}
                    accessibilityState={{
                      disabled: day.future || !day.contributions.length,
                    }}
                    onPress={() => selectDay(day)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 56,
                      padding: 2,
                      opacity: day.future ? 0.3 : pressed ? 0.6 : 1,
                    })}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        borderCurve: "continuous",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: shade(day.level),
                      }}
                    >
                      <Copy
                        size={14}
                        weight={day.level ? "700" : "400"}
                        style={{
                          color: day.level
                            ? colors.onChart[Math.max(0, 4 - day.level)]
                            : colors.text,
                        }}
                      >
                        {Number(day.date.slice(-2))}
                      </Copy>
                      {day.contributions.length > 0 && (
                        <Copy
                          size={10}
                          weight="600"
                          style={{
                            color: day.level
                              ? colors.onChart[Math.max(0, 4 - day.level)]
                              : colors.secondary,
                            marginTop: -1,
                          }}
                        >
                          {Math.round(day.amountOre / 100)}
                        </Copy>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ),
        )}
      </View>
    </View>
  );
}
