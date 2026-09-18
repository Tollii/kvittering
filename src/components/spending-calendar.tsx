import { Pressable, View } from "react-native";
import { Copy } from "./ui";
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
  reviewedOnly,
  onSelect,
}: {
  receipts: Receipt[];
  month: string;
  reviewedOnly: boolean;
  onSelect: (group: SpendingGroup) => void;
}) {
  const colors = useTheme();
  const days = spendingCalendar(
    receipts,
    Number(month.slice(0, 4)),
    reviewedOnly,
  ).filter((day) => day.date.startsWith(month));
  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <View style={{ gap: 10 }}>
      <Copy size={20} weight="600">
        Handlekalender
      </Copy>
      <View style={{ flexDirection: "row" }}>
        {["M", "T", "O", "T", "F", "L", "S"].map((label, index) => (
          <Copy
            key={index}
            size={12}
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
            style={{ width: `${100 / 7}%`, height: 46 }}
          />
        ))}
        {days.map((day) => (
          <Pressable
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={`${day.date}, ${formatMoney(day.amountOre)}, ${day.contributions.length} kvitteringer`}
            disabled={day.future}
            onPress={() =>
              onSelect({
                id: day.date,
                name: day.date,
                amountOre: day.amountOre,
                contributions: day.contributions,
              })
            }
            style={{
              width: `${100 / 7}%`,
              minHeight: 46,
              padding: 2,
              opacity: day.future ? 0.3 : 1,
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: day.level > 0 ? colors.primary : colors.muted,
              }}
            >
              <Copy
                size={14}
                weight={day.level ? "700" : "400"}
                style={{ color: day.level ? colors.onPrimary : colors.text }}
              >
                {Number(day.date.slice(-2))}
              </Copy>
              {day.contributions.length > 0 && (
                <View
                  style={{
                    height: 3,
                    width: 3 + day.level * 3,
                    marginTop: 2,
                    borderRadius: 2,
                    backgroundColor: colors.onPrimary,
                  }}
                />
              )}
            </View>
          </Pressable>
        ))}
      </View>
      <Copy muted size={12}>
        Trykk på en dag for å se kjøpene. Flere streker betyr høyere
        vareforbruk.
      </Copy>
    </View>
  );
}
