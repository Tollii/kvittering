import { CalendarDate } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import type { ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  Amount,
  Button,
  ButtonRow,
  Chip,
  Copy,
  Icon,
  IconButton,
  List,
  Panel,
  styles,
  SummaryBand,
  TitleValue,
  useLargeText,
} from "@/components/ui";
import { ReceiptImages } from "@/features/receipt-images";
import { type reconcile, type ReceiptData } from "@/lib/domain/receipt";
import type { Receipt } from "@/lib/domain/insights";
import { receiptStatusLabel } from "@/components/receipt-card";
import { useTheme } from "@/constants/theme";

type Totals = ReturnType<typeof reconcile>;

/** The receipt's date, total, images, and status. */
export function ReceiptSummary({
  receipt,
  data,
  dirty,
  excluded,
  processing,
  busy,
  onEditFields,
}: Readonly<{
  receipt: Receipt;
  data: ReceiptData | null;
  dirty: boolean;
  excluded: boolean;
  processing: boolean;
  busy: boolean;
  onEditFields: () => void;
}>) {
  const colors = useTheme();
  const largeText = useLargeText();

  return (
    <SummaryBand style={{ gap: 12 }}>
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
            minWidth: largeText ? "100%" : undefined,
            gap: 4,
          }}
        >
          <Copy
            role="detail"
            weight="600"
            style={{ color: colors.onHeroMuted }}
          >
            {CalendarDate.format(data?.purchaseDate)}
            {data?.purchaseDate && data.purchaseTime
              ? ` kl. ${data.purchaseTime}`
              : ""}
            {data?.branch ? ` · ${data.branch}` : ""}
          </Copy>
          <HeroTotal data={data} />
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
      </View>
    </SummaryBand>
  );
}

/** The paid amount, or a quiet line when it is missing, so a gap never reads as a value. */
function HeroTotal({ data }: Readonly<{ data: ReceiptData | null }>) {
  const colors = useTheme();

  if (data && data.totalOre === null)
    return (
      <Copy
        role="sheetTitle"
        weight="600"
        style={{ color: colors.onHeroMuted }}
      >
        Ukjent beløp
      </Copy>
    );

  return <Amount hero>{Ore.format(data?.totalOre ?? null)}</Amount>;
}

/** How the receipt lines add up to the paid amount. */
export function PurchaseTotals({
  data,
  totals,
}: Readonly<{ data: ReceiptData; totals: Totals }>) {
  const colors = useTheme();

  // Components appear only when present, and the line sum and paid amount follow.
  // The next-step notice names an open difference; the paid row only marks it.
  const adjustments = [
    { label: "Rabatter", amount: totals.discounts },
    {
      label: "Pant og pantretur",
      amount: Ore.add(totals.deposits, totals.returns),
    },
    { label: "Andre justeringer", amount: totals.adjustments },
  ].filter((row) => row.amount !== 0);

  const paidUnsettled = totals.difference !== null && totals.difference !== 0;

  // Products alone that add up to the paid amount need one row, not three.
  const agrees =
    adjustments.length === 0 && totals.difference === 0 && !totals.unknown;

  const paid = { label: "Betalt", amount: data.totalOre, paid: true };

  const rows: { label: string; amount: Ore | null; paid?: boolean }[] = agrees
    ? [paid]
    : [
        ...(totals.products === 0
          ? []
          : [{ label: "Varer før rabatt", amount: totals.products }]),
        ...adjustments,
        { label: "Sum av linjene", amount: totals.calculated },
        paid,
      ];

  return (
    <Panel>
      <View style={styles.row}>
        <TitleValue
          value={`${data.lines.filter((line) => line.kind === "product").length} varer${agrees ? " · linjene stemmer" : ""}`}
          role="detail"
          weight="400"
          muted
        >
          <Copy weight="600" accessibilityRole="header">
            Kjøpsoversikt
          </Copy>
        </TitleValue>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={[styles.row, { paddingVertical: 6 }]}>
          <TitleValue
            value={Ore.format(row.amount)}
            role="detail"
            weight={amountWeight(row)}
            muted={row.amount === null}
            color={row.paid && paidUnsettled ? colors.warning : undefined}
          >
            <Copy role="detail" muted>
              {row.label}
            </Copy>
          </TitleValue>
        </View>
      ))}
    </Panel>
  );
}

/** The paid amount stands out; an unknown amount is said quietly. */
function amountWeight(row: Readonly<{ amount: Ore | null; paid?: boolean }>) {
  if (row.amount === null) return "400";

  return row.paid ? "700" : "500";
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
          role="detail"
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
          role="detail"
          weight="500"
          muted
          style={{ flex: 1 }}
          accessibilityLiveRegion="polite"
        >
          {label}
        </Copy>
      </View>
      {approved ? (
        <ButtonRow>
          <Button
            title="Til kvitteringene"
            variant="secondary"
            onPress={() => router.dismissTo("/(tabs)/receipts")}
          />
          {nextPending && (
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
          )}
        </ButtonRow>
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
    <List style={{ paddingVertical: 2 }}>{lines.map(renderLine)}</List>
  ) : null;
}
