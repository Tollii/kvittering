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
import { Mosaic } from "@/components/mosaic";
import { SpendingBars, SpendingDetails } from "@/components/spending-details";
import { FamilyPurchases, familySummary } from "@/components/family-purchases";
import { SpendingCalendar } from "@/components/spending-calendar";
import { useHousehold } from "@/features/session";
import {
  comparisonInsights,
  receiptCoverage,
  type Contribution,
  type SpendingGroup,
} from "@/lib/domain/insights";
import { formatMoney, osloDate } from "@/lib/domain/receipt";
import { categoryById } from "@/lib/domain/categories";
import { openReceipt, receiptNeeds } from "@/components/receipt-card";
import { mosaicHighlight, useTheme } from "@/constants/theme";
import { budgetPace, paceLabel } from "@/lib/domain/budget";
import {
  monthPriceSignals,
  priceSignalLabel,
} from "@/lib/domain/price-signals";
import { formatDate } from "@/lib/format-date";
import { catalogInsights } from "@/lib/catalog/insights";
import { router } from "expo-router";

export default function Spending() {
  const { receipts, loadingReceipts, completeReceipts, online, details } =
    useHousehold();
  const colors = useTheme();
  const currentMonth = osloDate().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [filters, setFilters] = useState(false);
  const [report, setReport] = useState<
    | "catalog"
    | "prices"
    | "families"
    | "calendar"
    | "meat"
    | "changes"
    | "coverage"
    | null
  >(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [breakdown, setBreakdown] = useState<"category" | "store" | "type">(
    "category",
  );
  const [group, setGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpendingGroup | null>(null);
  const comparison = comparisonInsights(receipts, month, reviewedOnly);
  const totals = comparison.current;
  const coverage = receiptCoverage(receipts);
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
  const showDetails = (value: SpendingGroup) => {
    setReport(null);
    setSelected(value);
  };
  const select = (
    name: string,
    amountOre: number,
    contributions: Contribution[],
  ) => showDetails({ id: name, name, amountOre, contributions });
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
  const recentReceipts = [...totals.selected]
    .sort(
      (a, b) =>
        (b.data?.purchaseDate ?? "").localeCompare(
          a.data?.purchaseDate ?? "",
        ) || b._creationTime - a._creationTime,
    )
    .slice(0, 3);
  const rawMonth = new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const monthLabel =
    rawMonth.charAt(0).toLocaleUpperCase("nb-NO") + rawMonth.slice(1);
  const surprises = monthPriceSignals(receipts, month);
  const pricier = surprises.filter((signal) => signal.ratio > 1);
  const budgetOre = details?.household.monthlyBudgetOre ?? null;
  const pace =
    budgetOre && budgetOre > 0
      ? budgetPace(budgetOre, totals.products, month)
      : null;
  const [whole, fraction] = formatMoney(totals.products)
    .replace(/\s?kr$/, "")
    .split(",");
  return (
    <Screen
      title="Forbruk"
      settings
      headerRight={
        <IconButton
          name="line.3.horizontal.decrease"
          label="Filtrer forbruk"
          filled
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
          <Panel tone="primary" style={{ padding: 0, gap: 0 }}>
            <Mosaic
              seed={1000}
              height={7}
              block={5}
              columns={80}
              fade={false}
            />
            <View style={{ padding: 18, paddingTop: 14, gap: 4 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Copy
                  size={13}
                  weight="600"
                  style={{
                    color: colors.onHero,
                    opacity: 0.8,
                    flex: 1,
                  }}
                >
                  {monthLabel}
                </Copy>
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
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 6,
                }}
              >
                <Copy
                  size={46}
                  weight="800"
                  style={{ color: colors.onHero }}
                  accessibilityLabel={formatMoney(totals.products)}
                >
                  {whole}
                </Copy>
                {fraction !== undefined && (
                  <Copy
                    size={22}
                    weight="700"
                    style={{
                      color: colors.onHero,
                      opacity: 0.75,
                      paddingBottom: 6,
                    }}
                    accessibilityElementsHidden
                  >
                    ,{fraction} kr
                  </Copy>
                )}
              </View>
              <Copy size={13} style={{ color: colors.onHero, opacity: 0.8 }}>
                {totals.selected.length}{" "}
                {totals.selected.length === 1 ? "kvittering" : "kvitteringer"}
                {totals.provisional
                  ? ` · ${totals.provisional} foreløpige`
                  : ""}
                {reviewedOnly ? " · bare godkjente" : ""}
                {change !== null
                  ? ` · ${Math.abs(change)} % ${change > 0 ? "mer" : "mindre"} enn ${
                      comparison.partial
                        ? "samme del av forrige måned"
                        : "forrige måned"
                    }`
                  : ""}
              </Copy>
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
                          pace.status === "over" ? mosaicHighlight : "#FFFFFF",
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
            </View>
          </Panel>
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
          <Panel>
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
                    minHeight: 36,
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
                } else showDetails(row);
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
          </Panel>
          {recentReceipts.length > 0 && (
            <>
              <SectionTitle
                title="Siste kjøp"
                action="Se alle"
                onAction={() => router.navigate("/history")}
              />
              <Panel style={{ gap: 0, paddingVertical: 4 }}>
                {recentReceipts.map((receipt, index) => (
                  <View
                    key={receipt._id}
                    style={{
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: colors.line,
                      paddingVertical: 4,
                    }}
                  >
                    <Row
                      title={receipt.data?.store ?? "Kvittering"}
                      detail={[
                        formatDate(receipt.data?.purchaseDate),
                        receipt.data?.branch,
                        receipt.status !== "reviewed" ? "Til kontroll" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      value={formatMoney(receipt.data?.totalOre ?? null)}
                      onPress={() => openReceipt(receipt)}
                    />
                  </View>
                ))}
              </Panel>
            </>
          )}
          <SectionTitle title="Betaling" />
          <Panel style={{ gap: 0, paddingVertical: 4 }}>
            <Row
              title="Betalt"
              detail="Inkludert pant"
              value={formatMoney(totals.paid)}
              onPress={() =>
                select(
                  "Betalt",
                  totals.paid,
                  receiptContributions(totals.selected),
                )
              }
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
                  onPress={() =>
                    select(
                      metric.name,
                      metric.amount,
                      accounting.filter((item) =>
                        metric.kinds.includes(item.line.kind),
                      ),
                    )
                  }
                />
              </View>
            ))}
          </Panel>
          <SectionTitle title="Utforsk forbruket" />
          <Panel style={{ gap: 0, paddingVertical: 4 }}>
            {[
              {
                id: "catalog" as const,
                title: "Produkter og merker",
                icon: "barcode" as const,
                value: `${catalog.linked} av ${catalog.total} koblet`,
              },
              ...(surprises.length
                ? [
                    {
                      id: "prices" as const,
                      title: "Prissjekk",
                      icon: "tag" as const,
                      value: `${pricier.length} dyrere enn vanlig`,
                    },
                  ]
                : []),
              {
                id: "families" as const,
                title: "Mengder kjøpt",
                icon: "scalemass" as const,
                value: familySummary(totals.selected),
              },
              {
                id: "calendar" as const,
                title: "Handlekalender",
                icon: "calendar" as const,
                value: undefined,
              },
              {
                id: "meat" as const,
                title: "Kjøtt og fisk",
                icon: "fish" as const,
                value: formatMoney(
                  meatRows.reduce((sum, row) => sum + row.amountOre, 0),
                ),
              },
              ...(comparison.previous.selected.length
                ? [
                    {
                      id: "changes" as const,
                      title: "Endringer fra forrige måned",
                      icon: "arrow.up.arrow.down" as const,
                      value: undefined,
                    },
                  ]
                : []),
              {
                id: "coverage" as const,
                title: "Om tallene",
                icon: "info.circle" as const,
                value: undefined,
              },
            ].map((item, index) => (
              <View
                key={item.id}
                style={{
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.line,
                  paddingVertical: 2,
                }}
              >
                <Row
                  title={item.title}
                  icon={item.icon}
                  value={item.value}
                  onPress={() => setReport(item.id)}
                />
              </View>
            ))}
          </Panel>
        </>
      )}
      <Sheet
        title={
          report === "catalog"
            ? "Produkter og merker"
            : report === "prices"
              ? "Prissjekk"
              : report === "families"
                ? "Mengder kjøpt"
                : report === "calendar"
                  ? "Handlekalender"
                  : report === "meat"
                    ? "Kjøtt og fisk"
                    : report === "changes"
                      ? "Endringer fra forrige måned"
                      : "Om tallene"
        }
        visible={report !== null}
        onClose={() => setReport(null)}
      >
        {report === "catalog" && (
          <>
            <Copy weight="600">Produkter</Copy>
            <SpendingBars
              rows={catalog.products.slice(0, 8)}
              onSelect={showDetails}
            />
            {!catalog.products.length && (
              <Copy muted>Ingen koblede varer ennå</Copy>
            )}
            {!!catalog.brands.length && (
              <>
                <Copy weight="600">Merker</Copy>
                <SpendingBars
                  rows={catalog.brands.slice(0, 8)}
                  onSelect={showDetails}
                />
              </>
            )}
            {!!catalog.stores.length && (
              <>
                <Copy weight="600">Butikksteder</Copy>
                <SpendingBars
                  rows={catalog.stores.slice(0, 8)}
                  onSelect={showDetails}
                />
              </>
            )}
          </>
        )}
        {report === "prices" && (
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
                    setReport(null);
                    openReceipt(signal.receipt);
                  }}
                />
              </View>
            ))}
          </Panel>
        )}
        {report === "families" && (
          <FamilyPurchases
            receipts={totals.selected}
            onClose={() => setReport(null)}
          />
        )}
        {report === "calendar" && (
          <SpendingCalendar
            receipts={receipts}
            month={month}
            reviewedOnly={reviewedOnly}
            onSelect={showDetails}
          />
        )}
        {report === "meat" && (
          <>
            <SpendingBars rows={meatRows} onSelect={showDetails} />
            {!meatRows.length && <Copy muted>Ingen kjøp i perioden</Copy>}
          </>
        )}
        {report === "changes" && (
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
                  select(item.name, item.current, item.currentContributions)
                }
              />
            ))}
            <Button
              title="Se kjøp i forrige periode"
              secondary
              onPress={() =>
                select(
                  "Forrige periode",
                  comparison.previous.products,
                  comparison.changes.flatMap(
                    (item) => item.previousContributions,
                  ),
                )
              }
            />
          </>
        )}
        {report === "coverage" && (
          <>
            <Row
              title={`${coverage.unlinkedCount} varer uten produktkobling`}
              onPress={() =>
                select(
                  "Uten produktkobling",
                  0,
                  receiptContributions(coverage.unlinked),
                )
              }
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
                        setReport(null);
                        openReceipt(receipt);
                      }}
                    />
                  ))}
                </View>
              ))}
          </>
        )}
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
      <SpendingDetails selected={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}
