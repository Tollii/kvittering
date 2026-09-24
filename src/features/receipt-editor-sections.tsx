import { CalendarDate } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import type { ReactNode } from "react";
import { Alert, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import {
  Button,
  Chip,
  Copy,
  Icon,
  IconButton,
  Notice,
  Panel,
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

/** One compact chip per open question. Tapping it jumps straight to the fix. */
export function ReviewTaskChips({
  tasks,
  data,
  totals,
  onResolveDuplicate,
  onEditFields,
  onShowLines,
  onAddLine,
  onChange,
}: Readonly<{
  tasks: ReviewTask[];
  data: ReceiptData | null;
  totals: Totals | null;
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
      case "difference":
        return chip(`Avvik ${Ore.format(task.amountOre)}`, "equal.circle", () =>
          Alert.alert(
            `Avvik ${Ore.format(task.amountOre)}`,
            `Linjene gir ${Ore.format(totals?.calculated ?? null)}. Kvitteringen sier ${Ore.format(data?.totalOre ?? null)}.`,
            [
              { text: "Avbryt", style: "cancel" },
              { text: "Se alle linjer", onPress: () => onShowLines("all") },
              {
                text: "Legg inn justering",
                onPress: () => {
                  if (data) onChange(balanceWithAdjustment(data, randomUUID()));
                  onShowLines("all");
                },
              },
            ],
          ),
        );
      case "receipt-issues":
        return chip(
          task.issues.length === 1
            ? "1 merknad"
            : `${task.issues.length} merknader`,
          "exclamationmark.bubble",
          () =>
            Alert.alert(
              "Merknader fra lesingen",
              task.issues.join("\n"),
              data?.issues.length
                ? [
                    { text: "Avbryt", style: "cancel" },
                    {
                      text: "Dette stemmer",
                      onPress: () => onChange({ ...data, issues: [] }),
                    },
                  ]
                : [{ text: "OK" }],
            ),
        );
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
    <Panel
      tone="primary"
      style={{
        padding: 0,
        gap: 0,
        borderRadius: 0,
      }}
    >
      <View style={{ padding: 20, gap: 12 }}>
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
            <Copy
              size={36}
              weight="600"
              selectable
              style={{ color: colors.onHero }}
            >
              {Ore.format(data?.totalOre ?? null)}
            </Copy>
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <ReceiptImages
              receipt={receipt}
              compact
              color={colors.onHero}
              background="#FFFFFF22"
            />
            <IconButton
              name="pencil"
              label="Rediger kvitteringsdetaljer"
              filled="#FFFFFF22"
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
      </View>
    </Panel>
  );
}

/** How the receipt lines add up to the paid amount. */
export function PurchaseTotals({
  data,
  totals,
}: Readonly<{ data: ReceiptData; totals: Totals }>) {
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
  const colors = useTheme();

  return lines.length ? (
    <Panel style={{ gap: 0, paddingVertical: 2 }}>
      {lines.map((line, index) => (
        <View
          key={line.id}
          style={{ borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}
        >
          {renderLine(line)}
        </View>
      ))}
    </Panel>
  ) : null;
}
