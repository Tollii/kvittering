import { View } from "react-native";
import { CalendarMonth } from "@/lib/domain/calendar";
import { Copy, Icon } from "@/components/ui";
import { useTheme } from "@/constants/theme";

export type PeriodMenuProps = Readonly<{
  value: CalendarMonth;
  latest: CalendarMonth;
  onChange: (month: CalendarMonth) => void;
}>;

/** Shows the month as the iOS menu's label does; the arrows beside it change it. */
export function PeriodMenu({ value }: PeriodMenuProps) {
  const colors = useTheme();

  return (
    <View
      style={{
        flex: 1,
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <Icon name="calendar" size={18} color={colors.onHero} />
      <Copy style={{ color: colors.onHero }}>{CalendarMonth.title(value)}</Copy>
    </View>
  );
}
