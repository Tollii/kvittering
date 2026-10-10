import { CalendarDate } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  Amount,
  Button,
  Chip,
  Copy,
  Icon,
  IconButton,
  List,
  Panel,
  SummaryBand,
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
  const { fontScale } = useWindowDimensions();

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
            minWidth: fontScale > 1.3 ? "100%" : undefined,
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
          <Amount hero>{Ore.format(data?.totalOre ?? null)}</Amount>
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
      {receipt.status === "reviewed" && !dirty && !excluded && (
        <Copy role="detail" style={{ color: colors.onHeroMuted }}>
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
}: Readonly<{ data: ReceiptData; totals: Totals }>) {
  const colors = useTheme();
  const { fontScale } = useWindowDimensions();

  // Components appear only when present; the line sum and paid amount always do.
  // The next-step notice names an open difference; the paid row only marks it.
  const rows: { label: string; amount: Ore | null; paid?: boolean }[] = [
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
    { label: "Betalt", amount: data.totalOre, paid: true },
  ];

  const paidUnsettled = totals.difference !== null && totals.difference !== 0;

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
        <Copy role="detail" muted>
          {data.lines.filter((line) => line.kind === "product").length} varer
        </Copy>
      </View>
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
          <Copy role="detail" muted style={{ flexShrink: 1 }}>
            {row.label}
          </Copy>
          <Copy
            role="detail"
            weight={row.paid ? "700" : "500"}
            style={
              row.paid && paidUnsettled ? { color: colors.warning } : undefined
            }
          >
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
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Til kvitteringene"
              variant="secondary"
              onPress={() => router.dismissTo("/(tabs)/receipts")}
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
    <List style={{ paddingVertical: 2 }}>{lines.map(renderLine)}</List>
  ) : null;
}
