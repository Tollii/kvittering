import { CalendarDate } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import type { ReactNode } from "react";
import { Alert, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import {
  Amount,
  Button,
  Chip,
  Copy,
  Icon,
  IconButton,
  List,
  Notice,
  Panel,
  SummaryBand,
} from "@/components/ui";
import { ReceiptImages } from "@/features/receipt-images";
import { type reconcile, type ReceiptData } from "@/lib/domain/receipt";
import {
  balanceWithAdjustment,
  type ReviewTask,
} from "@/lib/domain/receipt-review";
import type { Receipt } from "@/lib/domain/insights";
import { receiptStatusLabel } from "@/components/receipt-card";
import { useTheme } from "@/constants/theme";

type Totals = ReturnType<typeof reconcile>;

type DifferenceTask = Extract<ReviewTask, { kind: "difference" }>;

/** The ways a person can settle a difference, most common first. */
function differenceFixes(
  task: DifferenceTask,
  data: ReceiptData | null,
  onChange: (data: ReceiptData) => void,
  onShowLines: (lines: "review" | "all") => void,
) {
  return [
    { text: "Rett en vare", onPress: () => onShowLines("all") },
    {
      text: `Betalt var ${Ore.format(task.calculatedOre)}`,
      onPress: () => {
        if (data) onChange({ ...data, totalOre: task.calculatedOre });
      },
    },
    {
      text: "Legg inn justering",
      onPress: () => {
        if (data) onChange(balanceWithAdjustment(data, randomUUID()));
        onShowLines("all");
      },
    },
  ];
}

/** One compact chip per open question. Tapping it jumps straight to the fix. */
export function ReviewTaskChips({
  tasks,
  data,
  onResolveDuplicate,
  onEditFields,
  onShowLines,
  onAddLine,
  onChange,
}: Readonly<{
  tasks: ReviewTask[];
  data: ReceiptData | null;
  onResolveDuplicate: () => void;
  onEditFields: () => void;
  onShowLines: (lines: "review" | "all") => void;
  onAddLine: () => void;
  onChange: (data: ReceiptData) => void;
}>) {
  function taskChip(task: ReviewTask) {
    const chip = (
      label: string,
      icon: Parameters<typeof Chip>[0]["icon"],
      onPress: () => void,
    ) => (
      <Chip
        key={task.kind}
        label={label}
        icon={icon}
        tone="warning"
        trailing="none"
        onPress={onPress}
      />
    );

    const toLines = () => onShowLines("review");

    switch (task.kind) {
      case "duplicate":
        return chip("Mulig duplikat", "doc.on.doc", () =>
          Alert.alert(
            "Mulig duplikat",
            "Samme bilde eller kjøp finnes fra før.",
            [
              { text: "Avbryt", style: "cancel" },
              {
                text: "Dette er et eget kjøp",
                onPress: onResolveDuplicate,
              },
            ],
          ),
        );
      case "store":
        return chip("Butikk mangler", "storefront", onEditFields);
      case "total":
        return chip("Betalt beløp mangler", "banknote", onEditFields);
      case "date":
        return chip("Dato mangler", "calendar", onEditFields);
      case "currency":
        return chip(
          `Valuta: ${data?.currency ?? "ukjent"}`,
          "coloncurrencysign.circle",
          onEditFields,
        );
      case "no-lines":
        return chip("Ingen varer lest", "plus", onAddLine);
      case "difference": {
        const printed = task.printedAs
          ? ` Kvitteringen har også linjen «${task.printedAs}».`
          : "";

        return chip(`Avvik ${Ore.format(task.amountOre)}`, "equal.circle", () =>
          Alert.alert(
            `Avvik ${Ore.format(task.amountOre)}`,
            `Varelinjene gir ${Ore.format(task.calculatedOre)}, men betalt beløp er ${Ore.format(data?.totalOre ?? null)}.${printed} Har en vare feil pris, retter du linjesummen på varen.`,
            [
              ...differenceFixes(task, data, onChange, onShowLines),
              { text: "Avbryt", style: "cancel" },
            ],
          ),
        );
      }

      case "receipt-issues": {
        // Only the reader's own notes can be removed; computed checks stay until fixed.
        const removable = task.issues.filter((issue) =>
          data?.issues.includes(issue),
        );

        return chip(
          task.issues.length === 1
            ? "1 merknad"
            : `${task.issues.length} merknader`,
          "exclamationmark.bubble",
          () =>
            Alert.alert(
              "Merknader fra lesingen",
              task.issues.join("\n"),
              data && removable.length
                ? [
                    { text: "Behold", style: "cancel" },
                    {
                      text:
                        removable.length > 1
                          ? "Fjern merknadene"
                          : "Fjern merknaden",
                      onPress: () =>
                        onChange({
                          ...data,
                          issues: data.issues.filter(
                            (issue) => !removable.includes(issue),
                          ),
                        }),
                    },
                  ]
                : [{ text: "OK" }],
            ),
        );
      }

      case "amounts":
        return chip(`${task.count} beløp mangler`, "numbers", toLines);
      case "names":
        return chip(`${task.count} navn mangler`, "textformat", toLines);
      case "line-issues":
        return chip(
          `${task.count} ${task.count === 1 ? "vare" : "varer"} å sjekke`,
          "exclamationmark.circle",
          toLines,
        );
    }
  }

  return <>{tasks.map(taskChip)}</>;
}

/** The receipt's date, total, images, status, and open review questions. */
export function ReceiptSummary({
  receipt,
  data,
  dirty,
  excluded,
  approved,
  processing,
  busy,
  chips,
  onEditFields,
}: Readonly<{
  receipt: Receipt;
  data: ReceiptData | null;
  dirty: boolean;
  excluded: boolean;
  approved: boolean;
  processing: boolean;
  busy: boolean;
  chips: ReactNode;
  onEditFields: () => void;
}>) {
  const colors = useTheme();
  const { fontScale } = useWindowDimensions();

  return (
    <SummaryBand style={{ paddingTop: 12, gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            minWidth: fontScale > 1.3 ? "100%" : undefined,
            gap: 4,
          }}
        >
          <Copy size={13} weight="600" style={{ color: colors.onHeroMuted }}>
            {CalendarDate.format(data?.purchaseDate)}
            {data?.purchaseDate && data.purchaseTime
              ? ` kl. ${data.purchaseTime}`
              : ""}
            {data?.branch ? ` · ${data.branch}` : ""}
          </Copy>
          <Amount size="hero">{Ore.format(data?.totalOre ?? null)}</Amount>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {receipt.imageCount > 0 && (
            <ReceiptImages
              receipt={receipt}
              compact
              color={colors.onHero}
              background={colors.heroControl}
            />
          )}
          <IconButton
            name="pencil"
            label="Rediger kvitteringsdetaljer"
            filled={colors.heroControl}
            size={17}
            color={colors.onHero}
            disabled={!data || busy}
            onPress={onEditFields}
          />
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Chip
          label={dirty ? "Ulagrede endringer" : receiptStatusLabel(receipt)}
          tone={
            dirty
              ? "warning"
              : receipt.status === "reviewed"
                ? "success"
                : "muted"
          }
          icon={
            receipt.status === "reviewed"
              ? "checkmark.seal"
              : processing
                ? "hourglass"
                : receipt.status === "failed"
                  ? "exclamationmark.triangle"
                  : "doc.text.magnifyingglass"
          }
        />
        {excluded && <Chip label="Utelatt" icon="eye.slash" />}
        {!approved && chips}
      </View>
      {receipt.status === "reviewed" && !dirty && !excluded && (
        <Copy size={14} style={{ color: colors.onHeroMuted }}>
          Kvitteringen er med i forbruket. Du trenger ikke kontrollere hver
          vare. Produktkobling er valgfritt.
        </Copy>
      )}
    </SummaryBand>
  );
}

/** How the receipt lines add up to the paid amount. */
export function PurchaseTotals({
  data,
  totals,
  difference,
  onChange,
  onShowLines,
}: Readonly<{
  data: ReceiptData;
  totals: Totals;
  /** An open difference between the lines and the paid amount. */
  difference: DifferenceTask | undefined;
  onChange: (data: ReceiptData) => void;
  onShowLines: (lines: "review" | "all") => void;
}>) {
  const { fontScale } = useWindowDimensions();

  // Components appear only when present; the line sum and paid amount always do.
  const rows: { label: string; amount: Ore | null }[] = [
    ...[
      { label: "Varer før rabatt", amount: totals.products },
      { label: "Rabatter", amount: totals.discounts },
      {
        label: "Pant og pantretur",
        amount: Ore.add(totals.deposits, totals.returns),
      },
      { label: "Andre justeringer", amount: totals.adjustments },
    ].filter((row) => row.amount !== 0),
    { label: "Sum av linjene", amount: totals.calculated },
    { label: "Betalt", amount: data.totalOre },
  ];

  return (
    <Panel>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <Copy weight="600" accessibilityRole="header" style={{ flex: 1 }}>
          Kjøpsoversikt
        </Copy>
        <Copy size={13} muted>
          {data.lines.filter((line) => line.kind === "product").length} varer
        </Copy>
      </View>
      {totals.difference !== 0 && (
        <Notice tone="warning">
          {totals.difference === null
            ? "Betalt beløp mangler"
            : `Avvik mellom varelinjer og betalt beløp: ${Ore.format(totals.difference)}`}
        </Notice>
      )}
      {difference && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {differenceFixes(difference, data, onChange, onShowLines).map(
            (fix, index) => (
              <Button
                key={fix.text}
                title={fix.text}
                variant={index === 0 ? "tint" : "secondary"}
                compact
                onPress={fix.onPress}
              />
            ),
          )}
        </View>
      )}
      {rows.map((row) => (
        <View
          key={row.label}
          style={{
            flexDirection: fontScale > 1.3 ? "column" : "row",
            justifyContent: "space-between",
            gap: fontScale > 1.3 ? 4 : 16,
            paddingVertical: 6,
          }}
        >
          <Copy size={14} muted style={{ flexShrink: 1 }}>
            {row.label}
          </Copy>
          <Copy size={14} weight={row.label === "Betalt" ? "700" : "500"}>
            {Ore.format(row.amount)}
          </Copy>
        </View>
      ))}
    </Panel>
  );
}

export function ReceiptFooter({
  error,
  ready,
  approved,
  label,
  nextPending,
  dirty,
  receipt,
  busy,
  saveDisabled,
  onSave,
}: Readonly<{
  error: string;
  ready: boolean;
  approved: boolean;
  label: string;
  nextPending: Pick<Receipt, "_id"> | undefined;
  dirty: boolean;
  receipt: Receipt;
  busy: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}>) {
  const colors = useTheme();

  return (
    <>
      {!!error && (
        <Copy
          size={13}
          style={{ color: colors.danger }}
          accessibilityRole="alert"
        >
          {error}
        </Copy>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon
          name={ready || approved ? "checkmark.circle.fill" : "circle.dotted"}
          size={17}
          color={ready || approved ? colors.success : colors.primary}
        />
        <Copy
          size={13}
          weight="500"
          muted
          style={{ flex: 1 }}
          accessibilityLiveRegion="polite"
        >
          {label}
        </Copy>
      </View>
      {approved ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Til innboksen"
              variant="secondary"
              onPress={() => router.dismissTo("/(tabs)/inbox")}
            />
          </View>
          {nextPending && (
            <View style={{ flex: 1.4 }}>
              <Button
                title="Neste til kontroll"
                icon="arrow.right"
                onPress={() =>
                  router.replace({
                    pathname: "/receipt/[id]",
                    params: { id: nextPending._id },
                  })
                }
              />
            </View>
          )}
        </View>
      ) : (
        (dirty || receipt.status !== "reviewed") && (
          <Button
            title={
              !ready && dirty
                ? "Lagre for senere"
                : dirty
                  ? "Lagre og godkjenn"
                  : "Godkjenn kvittering"
            }
            icon={ready ? "checkmark" : undefined}
            busy={busy}
            disabled={saveDisabled || (!dirty && !ready)}
            onPress={onSave}
          />
        )
      )}
    </>
  );
}

export function ReceiptLineList({
  lines,
  renderLine,
}: {
  lines: ReceiptData["lines"];
  renderLine: (line: ReceiptData["lines"][number]) => ReactNode;
}) {
  return lines.length ? (
    <List style={{ paddingVertical: 2 }}>
      {lines.map((line) => (
        <View key={line.id}>{renderLine(line)}</View>
      ))}
    </List>
  ) : null;
}
