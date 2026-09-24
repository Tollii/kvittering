import { Ore } from "@/lib/domain/ore";
import { type ComponentProps, type ReactNode } from "react";
import { View } from "react-native";
import { Copy, Empty, Icon, Notice, Panel, Row } from "@/components/ui";
import { SpendingBars } from "@/components/spending-details";
import { FamilyPurchases, familySummary } from "@/components/family-purchases";
import { SpendingCalendar } from "@/components/spending-calendar";
import { openReceipt } from "@/components/receipt-card";
import { useTheme } from "@/constants/theme";
import { isCategoryUncertain } from "@/lib/domain/receipt-issues";
import { formatDate } from "@/lib/format-date";
import {
  priceSignalLabel,
  priceSignalMinimumObservations,
  type monthPriceSignals,
} from "@/lib/domain/price-signals";
import type {
  monthlyInsights,
  receiptCoverage,
  Receipt,
  SpendingGroup,
} from "@/lib/domain/insights";
import type { catalogInsights } from "@/lib/catalog/insights";
import type { SpendingDimension } from "@/lib/spending-selection";

export const reportIds = [
  "catalog",
  "prices",
  "families",
  "calendar",
  "payment",
  "coverage",
] as const;

export type ReportId = (typeof reportIds)[number];

type ReportProps = {
  totals: ReturnType<typeof monthlyInsights>;
  coverage: ReturnType<typeof receiptCoverage>;
  catalog: ReturnType<typeof catalogInsights>;
  receipts: Receipt[];
  month: string;
  historyComplete: boolean;
  coverageComplete: boolean;
  surprises: ReturnType<typeof monthPriceSignals>;
  onSelect: (value: SpendingGroup, dimension?: SpendingDimension) => void;
  onAccounting: (key: string) => void;
  onClose: () => void;
};

export function useSpendingReports({
  totals,
  coverage,
  catalog,
  receipts,
  month,
  historyComplete,
  coverageComplete,
  surprises,
  onSelect,
  onAccounting,
  onClose,
}: ReportProps) {
  const colors = useTheme();
  const pricier = surprises.filter((signal) => signal.ratio > 1);

  const uncertainCategories = totals.selected.reduce(
    (count, receipt) =>
      count +
      (receipt.data?.lines.filter(
        (line) =>
          line.kind === "product" &&
          (line.categoryId === "fallback.unclear" ||
            line.issues.some(isCategoryUncertain)),
      ).length ?? 0),
    0,
  );

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
          {historyComplete && !surprises.length && (
            <Empty
              title="Ingen prisavvik funnet"
              message={`Prissjekken trenger koblede produkter med minst ${priceSignalMinimumObservations} andre kjøp å sammenligne med.`}
              icon="tag"
            />
          )}
          {historyComplete && surprises.length > 0 && (
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
                    detail={`${formatDate(signal.receipt.data?.purchaseDate)} · vanlig ${Ore.format(Ore.round(signal.typicalUnitPrice))}`}
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
              onSelect={(value) => onSelect(value, "calendar")}
            />
          }
        </>
      ),
    },
    payment: {
      title: "Betaling og pant",
      icon: "creditcard",
      render: () => (
        <>
          <Copy muted>
            Betalt beløp inkluderer pant. Dagligvaresummen viser varekjøp etter
            rabatter.
          </Copy>
          <Row
            title="Betalt"
            value={Ore.format(totals.paid)}
            onPress={() => onAccounting("paid")}
          />
          {[
            { name: "Rabatter", amount: totals.discounts },
            { name: "Pant betalt", amount: totals.deposits },
            { name: "Pant returnert", amount: totals.returns },
          ].map((item) => (
            <Row
              key={item.name}
              title={item.name}
              value={Ore.format(item.amount)}
              onPress={() => onAccounting(item.name)}
            />
          ))}
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
              {uncertainCategories > 0 && (
                <Copy muted>
                  {uncertainCategories} varelinjer har usikker kategori.
                  Kategoriene kan rettes på kvitteringen. Beløpene er med i
                  dagligvaresummen.
                </Copy>
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
              ].map((item) =>
                item.receipts.length > 0 ? (
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
                ) : null,
              )}
            </>
          }
        </>
      ),
    },
  };

  return reports;
}
