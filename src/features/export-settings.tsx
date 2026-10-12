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
import { OfflineNotice } from "./offline-notice";
import { useCompleteReceipts } from "./receipt-queries";

type ExportPeriod = Readonly<{
  id: string;
  title: string;
  detail: string;
  scope: FunctionArgs<typeof api.receipts.readPage>["scope"];
  file: string;
}>;

function exportPeriods(
  today: CalendarDate,
): readonly [ExportPeriod, ...ExportPeriod[]] {
  const month = CalendarDate.month(today);
  const year = CalendarDate.year(today);

  const monthPeriod = (
    id: string,
    title: string,
    value: CalendarMonth,
  ): ExportPeriod => ({
    id,
    title,
    detail: CalendarMonth.title(value),
    scope: {
      kind: "period",
      start: CalendarMonth.first(value),
      end: CalendarMonth.last(value),
    },
    file: `Kvitto ${CalendarMonth.title(value)}.csv`,
  });

  const yearPeriod = (
    id: string,
    title: string,
    value: number,
  ): ExportPeriod => ({
    id,
    title,
    detail: String(value),
    scope: {
      kind: "period",
      start: CalendarDate.of(value, 1, 1),
      end: CalendarDate.of(value, 12, 31),
    },
    file: `Kvitto ${value}.csv`,
  });

  return [
    monthPeriod("month", "Denne måneden", month),
    monthPeriod("previous-month", "Forrige måned", CalendarMonth.before(month)),
    yearPeriod("year", "I år", year),
    yearPeriod("previous-year", "I fjor", year - 1),
    {
      id: "all",
      title: "Alle kjøp",
      detail: "Også kvitteringer uten dato",
      scope: { kind: "allProducts" },
      file: "Kvitto alle kjøp.csv",
    },
  ];
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
  const periods = exportPeriods(CalendarDate.today());
  const [selected, setSelected] = useState(periods[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const period =
    periods.find((candidate) => candidate.id === selected) ?? periods[0];

  // Reports need every receipt in their scope; so does a file someone will sum.
  const { receipts, completeReceipts } = useCompleteReceipts(
    period.scope,
    visible,
  );

  // The sheet stays mounted while closed, so it builds rows only while open.
  const result = useMemo(
    () => (visible && completeReceipts ? receiptExport(receipts) : null),
    [visible, completeReceipts, receipts],
  );

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
    : "Henter kvitteringer …";

  return (
    <Sheet
      title="Eksporter til regneark"
      visible={visible}
      onClose={() => {
        setError("");
        onClose();
      }}
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
      <OfflineNotice />
      <Copy>
        Én rad per linje på kvitteringene, med dato, butikk, vare, kategori,
        beløp og valuta. Utelatte kvitteringer er ikke med.
      </Copy>
      <SectionTitle title="Periode" />
      <List>
        {periods.map((candidate) => (
          <Row
            key={candidate.id}
            title={candidate.title}
            detail={candidate.detail}
            selected={candidate.id === period.id}
            onPress={() => {
              setSelected(candidate.id);
              setError("");
            }}
          />
        ))}
      </List>
    </Sheet>
  );
}
