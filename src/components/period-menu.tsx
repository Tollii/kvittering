import { CalendarMonth } from "@/lib/domain/calendar";
import { Copy } from "./ui";
import { useTheme } from "@/constants/theme";

export function PeriodMenu({
  value,
}: Readonly<{
  value: CalendarMonth;
  latest: CalendarMonth;
  onChange: (month: CalendarMonth) => void;
}>) {
  const colors = useTheme();

  const label = CalendarMonth.format(value);

  return (
    <Copy size={22} weight="600" style={{ color: colors.onHero, flex: 1 }}>
      {label}
    </Copy>
  );
}
