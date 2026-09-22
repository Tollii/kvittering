import { shortcutMonth } from "@/lib/shortcut-selection";
import { z } from "zod";
import { WidgetTip } from "@/features/widget-tip";
import { usePurchaseWidget } from "@/features/purchase-widget";
import { PeriodMenu } from "@/components/period-menu";
import {
  useSpendingReports,
  reportIds,
  type ReportId,
} from "@/features/spending-reports/reports";
import {
  resolveSpendingSelection,
  type SpendingSelection,
  type SpendingDimension,
} from "@/lib/spending-selection";
import { attributeInsights } from "@/lib/domain/attribute-insights";
import { spendingCalendar, monthBefore } from "@/lib/domain/insights";
import { useCompleteReceipts } from "@/features/receipt-queries";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  Button,
  Copy,
  Icon,
  IconButton,
  Sheet,
  Empty,
  Loading,
  Notice,
  Panel,
  Row,
  Screen,
  SectionTitle,
  Segments,
  Toggle,
  pressed,
} from "@/components/ui";
import { MonumentArtwork } from "@/components/monument-artwork";
import { SpendingBars, SpendingDetails } from "@/components/spending-details";
import { useHousehold } from "@/features/session";
import {
  comparisonInsights,
  receiptCoverage,
  type SpendingGroup,
} from "@/lib/domain/insights";
import { formatMoney, osloDate } from "@/lib/domain/receipt";
import { categoryById } from "@/lib/domain/categories";
import { receiptNeeds } from "@/components/receipt-card";
import { useTheme } from "@/constants/theme";
import { budgetPace, paceLabel } from "@/lib/domain/budget";
import { monthPriceSignals } from "@/lib/domain/price-signals";
import { catalogInsights } from "@/lib/catalog/insights";
import { router, useLocalSearchParams } from "expo-router";
import { StoreSpendingSheet } from "@/features/spending-reports/stores";

export default function SpendingRoute() {
  const params = useLocalSearchParams();
  const month = shortcutMonth(params.month);
  const request = z.string().safeParse(params.request).data ?? "";

  if (params.month !== undefined && !month)
    return (
      <Screen title="Forbruk">
        <Notice>
          Måneden i snarveien er ugyldig. Velg måned og år på nytt.
        </Notice>
      </Screen>
    );

  return (
    <Spending
      key={`${month ?? "current"}:${request}`}
      initialMonth={month ?? osloDate().slice(0, 7)}
    />
  );
}

function Spending({ initialMonth }: Readonly<{ initialMonth: string }>) {
  const { online, details } = useHousehold();
  const colors = useTheme();
  const currentMonth = osloDate().slice(0, 7);
  const [month, setMonth] = useState(initialMonth);

  const { receipts, loadingReceipts, completeReceipts } = useCompleteReceipts({
    kind: "period",
    start: `${monthBefore(month)}-01`,
    end: `${month}-31`,
  });

  const [filters, setFilters] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false);
  const [report, setReport] = useState<ReportId | null>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [reviewedOnly, setReviewedOnly] = useState(false);

  const [breakdown, setBreakdown] = useState<"category" | "store" | "type">(
    "category",
  );

  const [group, setGroup] = useState<string | null>(null);
  const [selection, setSelection] = useState<SpendingSelection | null>(null);
  const periodKey = JSON.stringify([month, reviewedOnly]);

  const undated = useCompleteReceipts(
    { kind: "undated" },
    report === "coverage" || selection?.key === "unlinked",
  );

  const comparison = comparisonInsights(receipts, month, reviewedOnly);
  const totals = comparison.current;

  const widgetTotals = reviewedOnly
    ? comparisonInsights(receipts, month, false).current
    : totals;

  usePurchaseWidget({
    ready: completeReceipts && month === currentMonth,
    month,
    amountOre: widgetTotals.products,
    provisional: widgetTotals.provisional,
  });

  const monthLabel = new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00Z`));

  const coverage = receiptCoverage([...receipts, ...undated.receipts]);
  const catalog = catalogInsights(totals.selected);

  const change = comparison.previous.products
    ? Math.round(
        ((totals.products - comparison.previous.products) /
          Math.abs(comparison.previous.products)) *
          100,
      )
    : null;

  const rows =
    breakdown === "store"
      ? totals.stores
      : breakdown === "type"
        ? totals.purchaseTypes
        : group
          ? totals.categories.filter(
              (category) =>
                categoryById.get(category.id)?.group === group ||
                (group === "fallback" && category.id === "unallocated"),
            )
          : totals.groups;

  const showDetails = (
    value: SpendingGroup,
    dimension: SpendingDimension = "category",
  ) => {
    setReport(null);
    setSelection({ period: periodKey, dimension, key: value.id });
  };

  const select = (key: string) => {
    setReport(null);
    setSelection({ period: periodKey, dimension: "accounting", key });
  };

  const accounting = totals.selected.flatMap((receipt) =>
    receipt.data!.lines.map((line) => ({
      receipt,
      line,
      amountOre: line.amountOre ?? 0,
    })),
  );

  const receiptContributions = (items: typeof receipts) =>
    items.map((receipt) => ({
      receipt,
      line: null,
      amountOre: receipt.data?.totalOre ?? 0,
    }));

  function moveMonth(offset: number) {
    const [year, value] = month.split("-").map(Number);
    setMonth(
      new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7),
    );
    setGroup(null);
  }

  const meatRows = totals.categories.filter(
    (category) =>
      [
        "meat-fish.poultry",
        "meat-fish.pork",
        "meat-fish.lamb",
        "meat-fish.beef",
        "meat-fish.fish",
      ].includes(category.id) && category.amountOre !== 0,
  );

  const history = useCompleteReceipts(
    { kind: "allProducts" },
    report === "prices",
  );

  const surprises = history.completeReceipts
    ? monthPriceSignals(history.receipts, month)
    : [];

  const budgetOre = details?.household.monthlyBudgetOre ?? null;

  const pace =
    budgetOre && budgetOre > 0
      ? budgetPace(budgetOre, totals.products, month)
      : null;

  const selected = resolveSpendingSelection(selection, periodKey, {
    group: totals.groups,
    category: totals.categories,
    store: totals.stores,
    type: totals.purchaseTypes,
    catalogProduct: catalog.products,
    catalogBrand: catalog.brands,
    catalogStore: catalog.stores,
    attributeType: attributeInsights(totals.selected, "type").groups,
    attributeSugar: attributeInsights(totals.selected, "sugar").groups,
    attributePreparation: attributeInsights(totals.selected, "preparation")
      .groups,
    calendar: spendingCalendar(
      receipts,
      Number(month.slice(0, 4)),
      reviewedOnly,
    ).map((day) => ({
      id: day.date,
      name: day.date,
      amountOre: day.amountOre,
      contributions: day.contributions,
    })),
    change: comparison.changes.map((item) => ({
      id: item.id,
      name: item.name,
      amountOre: item.current,
      contributions: item.currentContributions,
    })),
    accounting: [
      {
        id: "paid",
        name: "Betalt",
        amountOre: totals.paid,
        contributions: receiptContributions(totals.selected),
      },
      {
        id: "Rabatter",
        name: "Rabatter",
        amountOre: totals.discounts,
        contributions: accounting.filter((item) =>
          ["item_discount", "receipt_discount"].includes(item.line.kind),
        ),
      },
      {
        id: "Pant betalt",
        name: "Pant betalt",
        amountOre: totals.deposits,
        contributions: accounting.filter(
          (item) => item.line.kind === "deposit",
        ),
      },
      {
        id: "Pant returnert",
        name: "Pant returnert",
        amountOre: totals.returns,
        contributions: accounting.filter(
          (item) => item.line.kind === "deposit_return",
        ),
      },
      {
        id: "previous",
        name: "Forrige periode",
        amountOre: comparison.previous.products,
        contributions: comparison.changes.flatMap(
          (item) => item.previousContributions,
        ),
      },
      {
        id: "unlinked",
        name: "Uten produktkobling",
        amountOre: 0,
        contributions: receiptContributions(coverage.unlinked),
      },
    ],
  });

  const reports = useSpendingReports({
    totals: { ...totals, undated: undated.receipts },
    coverageComplete: undated.completeReceipts,
    comparison,
    coverage,
    catalog,
    receipts,
    month,
    reviewedOnly,
    historyComplete: history.completeReceipts,
    surprises,
    meatRows,
    onSelect: showDetails,
    onAccounting: select,
    onClose: () => setReport(null),
  });

  return (
    <Screen
      summary={
        !loadingReceipts && (
          <Panel
            tone="primary"
            style={{
              padding: 20,
              paddingTop: 0,
              gap: 8,
              borderRadius: 0,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <PeriodMenu
                value={month}
                latest={currentMonth}
                onChange={(value) => {
                  setMonth(value);
                  setGroup(null);
                }}
              />
              <IconButton
                name="chevron.left"
                label="Forrige måned"
                size={16}
                color={colors.onHero}
                onPress={() => moveMonth(-1)}
              />
              <IconButton
                name="chevron.right"
                label="Neste måned"
                size={16}
                color={colors.onHero}
                disabled={month >= currentMonth}
                onPress={() => moveMonth(1)}
              />
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View style={{ flex: 1, gap: 8 }}>
                <Copy
                  size={12}
                  weight="600"
                  style={{ color: colors.onHeroMuted }}
                >
                  DAGLIGVARER
                </Copy>
                <Copy
                  size={36}
                  weight="600"
                  selectable
                  style={{ color: colors.onHero }}
                >
                  {formatMoney(totals.products)}
                </Copy>
                <Copy size={13} style={{ color: colors.onHeroMuted }}>
                  {totals.selected.length}{" "}
                  {totals.selected.length === 1 ? "kvittering" : "kvitteringer"}
                  {totals.provisional
                    ? ` · ${totals.provisional} foreløpige`
                    : ""}
                  {reviewedOnly ? " · bare godkjente" : ""}
                  {change !== null
                    ? ` · ${Math.abs(change)} % ${change > 0 ? "mer" : "mindre"} enn ${comparison.partial ? "samme del av forrige måned" : "forrige måned"}`
                    : ""}
                </Copy>
              </View>
              <MonumentArtwork scene="inbox" compact />
            </View>
            {pace && (
              <View style={{ gap: 6, paddingTop: 6 }}>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "#FFFFFF33",
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width: `${Math.min(100, pace.spentShare * 100)}%`,
                      backgroundColor:
                        pace.status === "over" ? "#FFE3A1" : colors.onHero,
                    }}
                  />
                  {pace.elapsedShare > 0 && pace.elapsedShare < 1 && (
                    <View
                      style={{
                        position: "absolute",
                        left: `${pace.elapsedShare * 100}%`,
                        top: -2,
                        width: 2,
                        height: 10,
                        backgroundColor: "#FFFFFFAA",
                      }}
                    />
                  )}
                </View>
                <Copy
                  size={13}
                  weight="600"
                  style={{ color: colors.onHero, opacity: 0.9 }}
                >
                  {paceLabel(pace)}
                </Copy>
              </View>
            )}
          </Panel>
        )
      }
      title="Forbruk"
      settings
      headerRight={
        <IconButton
          name="line.3.horizontal.decrease"
          label="Filtrer forbruk"
          filled="#FFFFFF22"
          color={colors.onHero}
          size={17}
          onPress={() => setFilters(true)}
        />
      }
    >
      {!online && <Notice icon="wifi.slash">Uten nett</Notice>}
      {loadingReceipts ? (
        <Loading />
      ) : (
        <>
          {!completeReceipts && <Notice>Henter kvitteringer …</Notice>}
          {coverage.pending.length > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate("/inbox")}
              style={(state) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  paddingLeft: 14,
                  borderRadius: 14,
                  borderCurve: "continuous",
                  backgroundColor: colors.primarySoft,
                },
                pressed(state),
              ]}
            >
              <Icon name="tray.full" size={18} />
              <View style={{ flex: 1, gap: 1 }}>
                <Copy size={14} weight="600">
                  {coverage.pending.length === 1
                    ? "Én kvittering venter på kontroll"
                    : `${coverage.pending.length} kvitteringer venter på kontroll`}
                </Copy>
                <Copy size={12} muted numberOfLines={1}>
                  {receiptNeeds(coverage.pending[0]).slice(0, 2).join(" · ") ||
                    "Summene er foreløpige."}
                </Copy>
              </View>
              <Icon name="chevron.right" size={12} color={colors.secondary} />
            </Pressable>
          )}
          <View style={{ gap: 4 }}>
            <SectionTitle title="Fordeling" />
            <Segments
              value={breakdown}
              onChange={(value) => {
                setBreakdown(value);
                setGroup(null);
                setShowAllGroups(false);
              }}
              options={[
                { value: "category", label: "Kategori" },
                { value: "store", label: "Butikk" },
                { value: "type", label: "Varetype" },
              ]}
            />
            {group && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setGroup(null)}
                style={(state) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 44,
                  },
                  pressed(state),
                ]}
              >
                <Icon name="chevron.left" size={12} />
                <Copy size={14} weight="600" style={{ color: colors.primary }}>
                  Alle kategorier
                </Copy>
                <Copy size={14} muted>
                  · {categoryById.get(rows[0]?.id)?.groupName}
                </Copy>
              </Pressable>
            )}
            <SpendingBars
              rows={showAllGroups ? rows : rows.slice(0, 5)}
              total={totals.products}
              onSelect={(row) => {
                if (breakdown === "category" && !group) {
                  setGroup(row.id);
                  setShowAllGroups(false);
                } else
                  showDetails(
                    row,
                    breakdown === "store"
                      ? "store"
                      : breakdown === "type"
                        ? "type"
                        : group
                          ? "category"
                          : "group",
                  );
              }}
            />
            {rows.length > 5 && (
              <Row
                title={showAllGroups ? "Vis færre" : `Vis alle ${rows.length}`}
                onPress={() => setShowAllGroups(!showAllGroups)}
              />
            )}
            {!rows.length && (
              <Empty title="Ingen kjøp denne måneden" icon="cart" />
            )}
          </View>
          <Panel>
            <Row
              title="Butikker"
              detail="Se hvor dere handler, og hva dere bruker per butikk"
              icon="map"
              onPress={() => setStoresOpen(true)}
            />
          </Panel>
          <SectionTitle title="Betaling" />
          <Panel style={{ gap: 0, paddingVertical: 4 }}>
            <Row
              title="Betalt"
              detail="Inkludert pant"
              value={formatMoney(totals.paid)}
              onPress={() => select("paid")}
            />
            {[
              {
                name: "Rabatter",
                amount: totals.discounts,
                kinds: ["item_discount", "receipt_discount"],
              },
              {
                name: "Pant betalt",
                amount: totals.deposits,
                kinds: ["deposit"],
              },
              {
                name: "Pant returnert",
                amount: totals.returns,
                kinds: ["deposit_return"],
              },
            ].map((metric) => (
              <View
                key={metric.name}
                style={{ borderTopWidth: 1, borderTopColor: colors.line }}
              >
                <Row
                  title={metric.name}
                  value={formatMoney(metric.amount)}
                  onPress={() => select(metric.name)}
                />
              </View>
            ))}
          </Panel>
          <SectionTitle title="Utforsk forbruket" />
          <Row
            title="Forbruksanalyse"
            detail="Hva endret seg denne uken eller måneden?"
            icon="chart.bar"
            onPress={() =>
              router.push({ pathname: "/analysis", params: { month } })
            }
          />
          <Panel style={{ gap: 0, paddingVertical: 4 }}>
            {reportIds
              .filter((id) => reports[id].visible !== false)
              .map((id, index) => (
                <View
                  key={id}
                  style={{
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                    paddingVertical: 2,
                  }}
                >
                  <Row
                    title={reports[id].title}
                    icon={reports[id].icon}
                    value={reports[id].value}
                    onPress={() => setReport(id)}
                  />
                </View>
              ))}
          </Panel>
        </>
      )}
      <StoreSpendingSheet
        visible={storesOpen}
        onClose={() => setStoresOpen(false)}
        purchases={totals.storePurchases}
        periodKey={periodKey}
        monthLabel={monthLabel}
        onPreviousMonth={() => moveMonth(-1)}
        onNextMonth={() => moveMonth(1)}
        nextDisabled={month >= currentMonth}
        loading={loadingReceipts}
      />
      <WidgetTip />
      <Sheet
        title={report ? reports[report].title : ""}
        visible={report !== null}
        onClose={() => setReport(null)}
      >
        {report ? reports[report].render() : null}
      </Sheet>
      <Sheet
        title="Vis forbruk"
        visible={filters}
        onClose={() => setFilters(false)}
      >
        <Panel>
          <Toggle
            label="Bare godkjente kvitteringer"
            value={reviewedOnly}
            onChange={setReviewedOnly}
          />
        </Panel>
        <Button title="Vis oversikt" onPress={() => setFilters(false)} />
      </Sheet>
      <SpendingDetails selected={selected} onClose={() => setSelection(null)} />
    </Screen>
  );
}
