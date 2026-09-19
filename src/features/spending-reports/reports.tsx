import { type ComponentProps, type ReactNode } from "react";
import { View } from "react-native";
import { Button, Copy, Icon, Notice, Panel, Row } from "@/components/ui";
import { ProductAttributesReport } from "../product-attributes-report";
import { SpendingBars } from "@/components/spending-details";
import { FamilyPurchases, familySummary } from "@/components/family-purchases";
import { SpendingCalendar } from "@/components/spending-calendar";
import { openReceipt } from "@/components/receipt-card";
import { useTheme } from "@/constants/theme";
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/domain/receipt";
import {
  priceSignalLabel,
  type monthPriceSignals,
} from "@/lib/domain/price-signals";
import type {
  comparisonInsights,
  monthlyInsights,
  receiptCoverage,
  Receipt,
  SpendingGroup,
} from "@/lib/domain/insights";
import type { catalogInsights } from "@/lib/catalog/insights";
import type { SpendingDimension } from "@/lib/spending-selection";
export const reportIds = [
  "attributes",
  "catalog",
  "prices",
  "families",
  "calendar",
  "meat",
  "changes",
  "coverage",
] as const;
export type ReportId = (typeof reportIds)[number];

type ReportProps = {
  totals: ReturnType<typeof monthlyInsights>;
  comparison: ReturnType<typeof comparisonInsights>;
  coverage: ReturnType<typeof receiptCoverage>;
  catalog: ReturnType<typeof catalogInsights>;
  receipts: Receipt[];
  month: string;
  reviewedOnly: boolean;
  historyComplete: boolean;
  coverageComplete: boolean;
  surprises: ReturnType<typeof monthPriceSignals>;
  meatRows: SpendingGroup[];
  onSelect: (value: SpendingGroup, dimension?: SpendingDimension) => void;
  onAccounting: (key: string) => void;
  onClose: () => void;
};
export function useSpendingReports({
  totals,
  comparison,
  coverage,
  catalog,
  receipts,
  month,
  reviewedOnly,
  historyComplete,
  coverageComplete,
  surprises,
  meatRows,
  onSelect,
  onAccounting,
  onClose,
}: ReportProps) {
  const colors = useTheme();
  const pricier = surprises.filter((signal) => signal.ratio > 1);
  const reports: Record<
    ReportId,
    {
      title: string;
      icon: ComponentProps<typeof Icon>["name"];
      value?: string;
      visible?: boolean;
      render: () => ReactNode;
    }
  > = {
    attributes: {
      title: "Produktegenskaper",
      icon: "tag",
      value: undefined,
      visible: true,
      render: () => (
        <>
          {
            <ProductAttributesReport
              receipts={totals.selected}
              onSelect={(value, dimension) =>
                onSelect(
                  value,
                  dimension === "type"
                    ? "attributeType"
                    : dimension === "sugar"
                      ? "attributeSugar"
                      : "attributePreparation",
                )
              }
            />
          }
        </>
      ),
    },
    catalog: {
      title: "Produkter og merker",
      icon: "barcode",
      value: `${catalog.linked} av ${catalog.total} koblet`,
      visible: true,
      render: () => (
        <>
          {
            <>
              <Copy weight="600">Produkter</Copy>
              <SpendingBars
                rows={catalog.products.slice(0, 8)}
                onSelect={(value) => onSelect(value, "catalogProduct")}
              />
              {!catalog.products.length && (
                <Copy muted>Ingen koblede varer ennå</Copy>
              )}
              {!!catalog.brands.length && (
                <>
                  <Copy weight="600">Merker</Copy>
                  <SpendingBars
                    rows={catalog.brands.slice(0, 8)}
                    onSelect={(value) => onSelect(value, "catalogBrand")}
                  />
                </>
              )}
              {!!catalog.stores.length && (
                <>
                  <Copy weight="600">Butikksteder</Copy>
                  <SpendingBars
                    rows={catalog.stores.slice(0, 8)}
                    onSelect={(value) => onSelect(value, "catalogStore")}
                  />
                </>
              )}
            </>
          }
        </>
      ),
    },
    prices: {
      title: "Prissjekk",
      icon: "tag",
      value: historyComplete
        ? `${pricier.length} dyrere enn vanlig`
        : "Se prishistorikk",
      visible: true,
      render: () => (
        <>
          {!historyComplete && <Notice>Henter full prishistorikk …</Notice>}
          {historyComplete && (
            <Panel style={{ gap: 0, paddingVertical: 4 }}>
              {surprises.map((signal, index) => (
                <View
                  key={`${signal.receipt._id}:${signal.line.id}`}
                  style={{
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                  }}
                >
                  <Row
                    title={signal.name}
                    detail={`${formatDate(signal.receipt.data?.purchaseDate)} · vanlig ${formatMoney(signal.typicalOre)}`}
                    value={priceSignalLabel(signal)}
                    onPress={() => {
                      onClose();
                      openReceipt(signal.receipt);
                    }}
                  />
                </View>
              ))}
            </Panel>
          )}
        </>
      ),
    },
    families: {
      title: "Mengder kjøpt",
      icon: "scalemass",
      value: familySummary(totals.selected),
      visible: true,
      render: () => (
        <>
          {
            <FamilyPurchases
              receipts={totals.selected}
              onClose={() => onClose()}
            />
          }
        </>
      ),
    },
    calendar: {
      title: "Handlekalender",
      icon: "calendar",
      value: undefined,
      visible: true,
      render: () => (
        <>
          {
            <SpendingCalendar
              receipts={receipts}
              month={month}
              reviewedOnly={reviewedOnly}
              onSelect={(value) => onSelect(value, "calendar")}
            />
          }
        </>
      ),
    },
    meat: {
      title: "Kjøtt og fisk",
      icon: "fish",
      value: formatMoney(meatRows.reduce((sum, row) => sum + row.amountOre, 0)),
      visible: true,
      render: () => (
        <>
          {
            <>
              <SpendingBars
                rows={meatRows}
                onSelect={(value) => onSelect(value)}
              />
              {!meatRows.length && <Copy muted>Ingen kjøp i perioden</Copy>}
            </>
          }
        </>
      ),
    },
    changes: {
      title: "Endringer fra forrige måned",
      icon: "arrow.up.arrow.down",
      value: undefined,
      visible: comparison.previous.selected.length > 0,
      render: () => (
        <>
          {
            <>
              <Copy size={12} muted>
                {formatDate(comparison.currentEnd)} mot{" "}
                {formatDate(comparison.previousEnd)}
              </Copy>
              {comparison.changes.slice(0, 3).map((item) => (
                <Row
                  key={item.id}
                  title={item.name}
                  detail={`${formatMoney(item.previous)} → ${formatMoney(item.current)}`}
                  value={formatMoney(item.difference)}
                  onPress={() =>
                    onSelect(
                      {
                        id: item.id,
                        name: item.name,
                        amountOre: item.current,
                        contributions: item.currentContributions,
                      },
                      "change",
                    )
                  }
                />
              ))}
              <Button
                title="Se kjøp i forrige periode"
                secondary
                onPress={() => onAccounting("previous")}
              />
            </>
          }
        </>
      ),
    },
    coverage: {
      title: "Om tallene",
      icon: "info.circle",
      value: undefined,
      visible: true,
      render: () => (
        <>
          {
            <>
              {!coverageComplete && (
                <Notice>Henter kvitteringer uten dato …</Notice>
              )}
              <Row
                title={`${coverage.unlinkedCount} varer uten produktkobling`}
                onPress={() => onAccounting("unlinked")}
              />
              {totals.unknownTotals + totals.unknownAmounts > 0 && (
                <Notice tone="warning">Beløp mangler</Notice>
              )}
              {[
                {
                  label: "Annen valuta",
                  receipts: totals.unconverted,
                },
                {
                  label: "Dato mangler",
                  receipts: totals.undated,
                },
                {
                  label: "Mulige duplikater",
                  receipts: totals.suspectedDuplicates,
                },
                {
                  label: "Beløpene stemmer ikke",
                  receipts: totals.discrepancies,
                },
              ]
                .filter((item) => item.receipts.length)
                .map((item) => (
                  <View key={item.label}>
                    <Notice tone="warning">{item.label}</Notice>
                    {item.receipts.map((receipt) => (
                      <Row
                        key={receipt._id}
                        title={receipt.data?.store ?? "Kvittering"}
                        onPress={() => {
                          onClose();
                          openReceipt(receipt);
                        }}
                      />
                    ))}
                  </View>
                ))}
            </>
          }
        </>
      ),
    },
  };
  return reports;
}
