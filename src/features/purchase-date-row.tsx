import { useState } from "react";
import { Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Row } from "@/components/ui";
import { CalendarDate } from "@/lib/domain/calendar";

/** The purchase date in a form sheet, with a picker that opens under the row. */
export function PurchaseDateRow({
  value,
  shown,
  onChange,
}: Readonly<{
  value: CalendarDate | null;
  /** Whether the sheet is on screen; a hidden sheet's picker closes. */
  shown: boolean;
  onChange: (value: CalendarDate) => void;
}>) {
  // When the picker opened, which is also its latest selectable date.
  const [openedAt, setOpenedAt] = useState<Date | null>(null);

  if (!shown && openedAt) setOpenedAt(null);

  return (
    <>
      <Row
        title="Kjøpsdato"
        value={CalendarDate.format(value)}
        icon="calendar"
        onPress={() => setOpenedAt(openedAt ? null : new Date())}
      />
      {openedAt && (
        <DateTimePicker
          value={CalendarDate.toNoon(value ?? CalendarDate.today())}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          locale="nb-NO"
          maximumDate={openedAt}
          onDismiss={() => setOpenedAt(null)}
          onValueChange={(_event, date) => {
            if (Platform.OS !== "ios") setOpenedAt(null);
            onChange(CalendarDate.fromLocal(date));
          }}
        />
      )}
    </>
  );
}
