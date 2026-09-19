import { Pressable, View } from "react-native";
import { Copy } from "./ui";
import { mosaicPalette, useTheme } from "@/constants/theme";
import {
  spendingCalendar,
  type Receipt,
  type SpendingGroup,
} from "@/lib/domain/insights";
import { formatMoney } from "@/lib/domain/receipt";

export function SpendingCalendar({
  receipts,
  month,
  reviewedOnly,
  onSelect,
}: Readonly<{
  receipts: Receipt[];
  month: string;
  reviewedOnly: boolean;
  onSelect: (group: SpendingGroup) => void;
}>) {
  const colors = useTheme();

  const days = spendingCalendar(
    receipts,
    Number(month.slice(0, 4)),
    reviewedOnly,
  ).filter((day) => day.date.startsWith(month));

  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;

  // Deeper violet for heavier shopping days, like the mosaic bands on the note.
  const shade = (level: number) =>
    level <= 0 ? colors.muted : mosaicPalette[Math.max(0, 4 - level)];

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row" }}>
        {["M", "T", "O", "T", "F", "L", "S"].map((label, index) => (
          <Copy
            key={index}
            size={12}
            weight="600"
            muted
            style={{ width: `${100 / 7}%`, textAlign: "center" }}
          >
            {label}
          </Copy>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array.from({ length: offset }, (_, index) => (
          <View
            key={`empty-${index}`}
            style={{ width: `${100 / 7}%`, height: 48 }}
          />
        ))}
        {days.map((day) => (
          <Pressable
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={`${day.date}, ${formatMoney(day.amountOre)}, ${day.contributions.length} kvitteringer`}
            disabled={day.future || !day.contributions.length}
            onPress={() =>
              onSelect({
                id: day.date,
                name: day.date,
                amountOre: day.amountOre,
                contributions: day.contributions,
              })
            }
            style={({ pressed }) => ({
              width: `${100 / 7}%`,
              height: 48,
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
                style={{ color: day.level ? "#FFFFFF" : colors.text }}
              >
                {Number(day.date.slice(-2))}
              </Copy>
              {day.contributions.length > 0 && (
                <Copy
                  size={10}
                  weight="600"
                  style={{
                    color: day.level ? "#FFFFFFCC" : colors.secondary,
                    marginTop: -1,
                  }}
                >
                  {Math.round(day.amountOre / 100)}
                </Copy>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
