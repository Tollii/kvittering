import { useMemo, useState } from "react";
import type { FunctionArgs } from "convex/server";
import type { api } from "../../convex/_generated/api";
import {
  Button,
  Copy,
  List,
  Notice,
  Row,
  SectionTitle,
  Sheet,
} from "@/components/ui";
import { CalendarDate, CalendarMonth } from "@/lib/domain/calendar";
import { exportCsv, receiptExport } from "@/lib/domain/receipt-export";
import { plural } from "@/lib/domain/receipt-review";
import { failureMessage } from "@/lib/failure-message";
import { shareTextFile } from "@/lib/share-file";
import { useHousehold } from "./household-context";
import { useCompleteReceipts } from "./receipt-queries";

const periodOrder = [
  "month",
  "previous-month",
  "year",
  "previous-year",
  "all",
] as const;

type PeriodId = (typeof periodOrder)[number];

type ExportPeriod = Readonly<{
  title: string;
  detail: string;
  scope: FunctionArgs<typeof api.receipts.readPage>["scope"];
  file: string;
}>;

function exportPeriods(today: CalendarDate): Record<PeriodId, ExportPeriod> {
  const month = CalendarDate.month(today);
  const previous = CalendarMonth.before(month);
  const year = CalendarDate.year(today);

  const monthPeriod = (title: string, value: CalendarMonth) => ({
    title,
    detail: CalendarMonth.title(value),
    scope: {
      kind: "period" as const,
      start: CalendarMonth.first(value),
      end: CalendarMonth.last(value),
    },
    file: `Kvitto ${CalendarMonth.title(value)}.csv`,
  });

  const yearPeriod = (title: string, value: number) => ({
    title,
    detail: String(value),
    scope: {
      kind: "period" as const,
      start: CalendarDate.of(value, 1, 1),
      end: CalendarDate.of(value, 12, 31),
    },
    file: `Kvitto ${value}.csv`,
  });

  return {
    month: monthPeriod("Denne måneden", month),
    "previous-month": monthPeriod("Forrige måned", previous),
    year: yearPeriod("I år", year),
    "previous-year": yearPeriod("I fjor", year - 1),
    all: {
      title: "Alle kjøp",
      detail: "Også kvitteringer uten dato",
      scope: { kind: "allProducts" },
      file: "Kvitto alle kjøp.csv",
    },
  };
}

/** A settings row that opens the spreadsheet export. */
export function ExportSettings() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Row
        title="Eksporter til regneark"
        detail="CSV-fil for Numbers, Excel eller Google Regneark"
        icon="tablecells"
        onPress={() => setOpen(true)}
      />
      <ExportSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ExportSheet({
  visible,
  onClose,
}: Readonly<{ visible: boolean; onClose: () => void }>) {
  const { online } = useHousehold();
  const periods = exportPeriods(CalendarDate.today());
  const [selected, setSelected] = useState<PeriodId>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const period = periods[selected];

  // Reports need every receipt in their scope; so does a file someone will sum.
  const { receipts, completeReceipts } = useCompleteReceipts(
    period.scope,
    visible,
  );

  const prepared = useMemo(() => receiptExport(receipts), [receipts]);
  const result = completeReceipts ? prepared : null;

  async function share() {
    if (!result) return;
    setBusy(true);
    setError("");

    try {
      await shareTextFile(period.file, exportCsv(result));
    } catch (cause) {
      setError(failureMessage(cause, "export.share", "Kunne ikke eksportere."));
    } finally {
      setBusy(false);
    }
  }

  const status = result
    ? result.receipts
      ? `${plural(result.receipts, "kvittering", "kvitteringer")} · ${plural(result.rows.length, "linje", "linjer")}`
      : "Ingen kvitteringer i perioden"
    : online
      ? "Henter kvitteringer …"
      : "Koble til nettet for å hente kvitteringene.";

  return (
    <Sheet
      title="Eksporter til regneark"
      visible={visible}
      onClose={onClose}
      footer={
        <>
          {!!error && <Notice tone="error">{error}</Notice>}
          <Copy role="detail" muted style={{ textAlign: "center" }}>
            {status}
          </Copy>
          <Button
            title="Del CSV-fil"
            icon="square.and.arrow.up"
            disabled={!result?.rows.length || busy}
            busy={busy}
            onPress={() => void share()}
          />
        </>
      }
    >
      <Copy>
        Én rad per linje på kvitteringene, med dato, butikk, vare, kategori og
        beløp. Utelatte kvitteringer er ikke med.
      </Copy>
      <SectionTitle title="Periode" />
      <List>
        {periodOrder.map((id) => (
          <Row
            key={id}
            title={periods[id].title}
            detail={periods[id].detail}
            selected={id === selected}
            onPress={() => setSelected(id)}
          />
        ))}
      </List>
    </Sheet>
  );
}
