import { CalendarMonth } from "@/lib/domain/calendar";
import { Host, Menu, Picker, Text } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  foregroundStyle,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "@/constants/theme";

export function PeriodMenu({
  value,
  latest,
  onChange,
}: Readonly<{
  value: CalendarMonth;
  latest: CalendarMonth;
  onChange: (month: CalendarMonth) => void;
}>) {
  const colors = useTheme();

  const months = [latest];
  let previous = latest;

  for (let index = 1; index < 12; index++) {
    previous = CalendarMonth.before(previous);
    months.push(previous);
  }

  if (!months.includes(value)) months.push(value);

  return (
    <Host
      matchContents={{ vertical: true }}
      style={{ flex: 1, minHeight: 44 }}
      seedColor={colors.onHero}
    >
      <Menu
        label={CalendarMonth.format(value)}
        systemImage="calendar"
        modifiers={[
          foregroundStyle(colors.onHero),
          accessibilityLabel("Velg måned"),
        ]}
      >
        <Picker
          label="Måned"
          selection={value}
          onSelectionChange={onChange}
          modifiers={[pickerStyle("inline")]}
        >
          {months.map((month) => (
            <Text key={month} modifiers={[tag(month)]}>
              {CalendarMonth.format(month)}
            </Text>
          ))}
        </Picker>
      </Menu>
    </Host>
  );
}
