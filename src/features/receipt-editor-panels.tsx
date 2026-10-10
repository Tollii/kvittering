import { ActivityIndicator, Alert } from "react-native";
import { Ore } from "@/lib/domain/ore";
import {
  Button,
  Copy,
  Disclosure,
  Icon,
  Notice,
  Panel,
  Row,
  SectionTitle,
  Segments,
} from "@/components/ui";
import type { ReceiptData } from "@/lib/domain/receipt";
import type { Receipt } from "@/lib/domain/insights";
import { useTheme } from "@/constants/theme";

/** Tells that another device saved the receipt, and loads that version. */
export function StaleRevisionNotice({
  dirty,
  onReload,
}: Readonly<{ dirty: boolean; onReload: () => void }>) {
  function reload() {
    if (dirty)
      Alert.alert(
        "Hente siste versjon?",
        "Dine ulagrede endringer blir fjernet.",
        [
          { text: "Avbryt", style: "cancel" },
          { text: "Hent", onPress: onReload },
        ],
      );
    else onReload();
  }

  return (
    <Panel>
      <Notice tone="warning">Endret på en annen enhet</Notice>
      <Button title="Hent siste versjon" variant="secondary" onPress={reload} />
    </Panel>
  );
}

/**
 * The choice between review lines and all lines, and the heading of the line
 * list with its one bulk action.
 */
export function ReceiptLineControls({
  allLines,
  showLineChoice,
  remaining,
  productLineCount,
  confirmable,
  reviewComplete,
  hasTasks,
  difference,
  onShowLines,
  onConfirmAll,
}: Readonly<{
  allLines: boolean;
  showLineChoice: boolean;
  /** Lines that still have review issues. */
  remaining: number;
  productLineCount: number;
  /** Lines with a suggested category that the person can confirm. */
  confirmable: number;
  /** Review mode shows no lines. */
  reviewComplete: boolean;
  hasTasks: boolean;
  /** Line sum minus the paid amount, or null while it or a line amount is unknown. */
  difference: Ore | null;
  onShowLines: (lines: "review" | "all") => void;
  onConfirmAll: () => void;
}>) {
  const colors = useTheme();

  return (
    <>
      {showLineChoice && (
        <Segments
          value={allLines ? "all" : "review"}
          onChange={onShowLines}
          options={[
            { value: "review", label: `Til kontroll (${remaining})` },
            { value: "all", label: `Alle linjer (${productLineCount})` },
          ]}
        />
      )}
      {!allLines && reviewComplete ? (
        <Panel style={{ alignItems: "center", paddingVertical: 24 }}>
          <Icon name="checkmark.circle" size={28} color={colors.success} />
          <Copy weight="600">
            {hasTasks ? "Varene er avklart" : "Klar til godkjenning"}
          </Copy>
        </Panel>
      ) : (
        <SectionTitle
          title={allLines ? "Varelinjer" : "Varer å sjekke"}
          detail={
            allLines ? balanceLabel(difference) : suggestionLabel(confirmable)
          }
          action={!allLines && confirmable > 1 ? "Bekreft alle" : undefined}
          actionLabel={`Bekreft alle ${confirmable} foreslåtte kategorier`}
          onAction={!allLines && confirmable > 1 ? onConfirmAll : undefined}
        />
      )}
    </>
  );
}

/** Whether the lines add up to the paid amount, updated as lines are edited. */
function balanceLabel(difference: Ore | null): string | undefined {
  if (difference === null) return undefined;

  return difference === 0
    ? "Linjene stemmer med betalt"
    : `Avvik mot betalt: ${Ore.format(difference)}`;
}

function suggestionLabel(confirmable: number): string | undefined {
  if (confirmable < 2) return undefined;

  return `${confirmable} forslag kan bekreftes samlet`;
}

/**
 * Catalog and quantity status for the receipt. A retry row accepts a press
 * only when its handler is given.
 */
export function ReceiptDetails({
  receipt,
  data,
  onRetryCatalog,
  onRetryAnalysis,
}: Readonly<{
  receipt: Receipt;
  data: ReceiptData;
  onRetryCatalog?: () => void;
  onRetryAnalysis?: () => void;
}>) {
  const linkedCount = data.lines.filter((line) => line.catalogProduct).length;

  const productCount = data.lines.filter(
    (line) => line.kind === "product",
  ).length;

  return (
    <Disclosure title="Om kvitteringen" value={receipt.uploaderName}>
      {receipt.catalogStatus === "pending" && (
        <Row title="Henter produktinformasjon …" icon="barcode" />
      )}
      {receipt.catalogStatus === "complete" && (
        <Row
          title="Produktkatalog"
          detail={`${linkedCount} av ${productCount} varer koblet`}
          icon="barcode"
        />
      )}
      {receipt.catalogStatus === "error" && (
        <Row
          title="Prøv produktsøk igjen"
          icon="barcode"
          onPress={onRetryCatalog}
        />
      )}
      {receipt.productAnalysis?.state === "error" && (
        <Row
          title="Prøv mengdeberegning igjen"
          icon="arrow.clockwise"
          onPress={onRetryAnalysis}
        />
      )}
    </Disclosure>
  );
}

/** Shows that the receipt has no lines to edit yet. */
export function ReceiptPlaceholder({
  processing,
  hasResult,
  onShowResult,
}: Readonly<{
  processing: boolean;
  /** The server has a result that the draft does not show. */
  hasResult: boolean;
  onShowResult: () => void;
}>) {
  const colors = useTheme();

  return (
    <Panel style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
      {processing && <ActivityIndicator color={colors.primary} />}
      <Copy weight="600" size={18}>
        {processing ? "Kvitteringen leses" : "Ingen resultater ennå"}
      </Copy>
      {hasResult && <Button title="Vis resultatet" onPress={onShowResult} />}
    </Panel>
  );
}
