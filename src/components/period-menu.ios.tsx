import { Host, Menu, Picker, Text } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  foregroundStyle,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "@/constants/theme";
import { monthBefore } from "@/lib/domain/insights";

export function PeriodMenu({
  value,
  latest,
  onChange,
}: Readonly<{
  value: string;
  latest: string;
  onChange: (month: string) => void;
}>) {
  const colors = useTheme();

  const label = (month: string) =>
    new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" }).format(
      new Date(`${month}-01T12:00:00Z`),
    );

  const months = [latest];
  let previous = latest;

  for (let index = 1; index < 12; index++) {
    previous = monthBefore(previous);
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
        label={label(value)}
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
              {label(month)}
            </Text>
          ))}
        </Picker>
      </Menu>
    </Host>
  );
}
