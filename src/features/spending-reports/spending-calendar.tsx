import { CalendarDate, CalendarMonth } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Copy, Empty, Row, faded, pressed } from "@/components/ui";
import { radius, useTheme } from "@/constants/theme";
import {
  spendingCalendar,
  type Receipt,
  type SpendingGroup,
} from "@/lib/domain/insights";

const weekdays = [
  ["monday", "M"],
  ["tuesday", "T"],
  ["wednesday", "O"],
  ["thursday", "T"],
  ["friday", "F"],
  ["saturday", "L"],
  ["sunday", "S"],
] as const;

export function SpendingCalendar({
  receipts,
  month,
  onSelect,
}: Readonly<{
  receipts: Receipt[];
  month: CalendarMonth;
  onSelect: (group: SpendingGroup) => void;
}>) {
  const colors = useTheme();
  const { fontScale, width } = useWindowDimensions();

  const days = spendingCalendar(receipts, CalendarMonth.year(month)).filter(
    (day) => CalendarDate.month(day.date) === month,
  );

  const offset = CalendarDate.weekday(CalendarMonth.first(month));

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
            title={CalendarDate.format(day.date)}
            detail={`${day.contributions.length} ${day.contributions.length === 1 ? "kvittering" : "kvitteringer"}`}
            value={Ore.format(day.amountOre)}
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
        {weekdays.map(([day, label]) => (
          <Copy
            key={day}
            role="caption"
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
                    accessibilityLabel={`${CalendarDate.format(day.date)}, ${Ore.format(day.amountOre)}, ${day.contributions.length} kvitteringer`}
                    disabled={day.future || !day.contributions.length}
                    accessibilityState={{
                      disabled: day.future || !day.contributions.length,
                    }}
                    onPress={() => selectDay(day)}
                    style={(state) => [
                      { flex: 1, height: 56, padding: 2 },
                      pressed(state),
                      faded(day.future),
                    ]}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: radius.tile,
                        borderCurve: "continuous",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: shade(day.level),
                      }}
                    >
                      <Copy
                        role="detail"
                        weight={day.level ? "700" : "400"}
                        style={{
                          color: day.level
                            ? colors.onChart[Math.max(0, 4 - day.level)]
                            : colors.text,
                        }}
                      >
                        {CalendarDate.day(day.date)}
                      </Copy>
                      {day.contributions.length > 0 && (
                        <Copy
                          role="caption"
                          weight="600"
                          style={{
                            color: day.level
                              ? colors.onChart[Math.max(0, 4 - day.level)]
                              : colors.secondary,
                            marginTop: -1,
                          }}
                        >
                          {Ore.formatWholeKroner(day.amountOre)}
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
