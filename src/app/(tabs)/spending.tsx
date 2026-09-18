import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  Button,
  Copy,
  IconButton,
  Sheet,
  Empty,
  Loading,
  Notice,
  Panel,
  Row,
  Screen,
  Segments,
  Toggle,
} from "@/components/ui";
import { SpendingBars, SpendingDetails } from "@/components/spending-details";
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
import { openReceipt } from "@/components/receipt-card";
import { useTheme } from "@/constants/theme";
import { formatDate } from "@/lib/format-date";
import { catalogInsights } from "@/lib/catalog/insights";
import { router } from "expo-router";

export default function Spending() {
  const { receipts, loadingReceipts, completeReceipts, online } =
    useHousehold();
  const colors = useTheme();
  const [month, setMonth] = useState(osloDate().slice(0, 7));
  const [filters, setFilters] = useState(false);
  const [report, setReport] = useState<
    "catalog" | "calendar" | "meat" | "changes" | "coverage" | null
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
  return (
    <Screen title="Forbruk" settings>
      {!online && <Notice>Uten nett. Oversikten kan være ufullstendig.</Notice>}
      {!completeReceipts && (
        <Notice>Henter kvitteringer. Summene er foreløpige.</Notice>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <IconButton
          name="chevron.left"
          label="Forrige måned"
          onPress={() => moveMonth(-1)}
        />
        <Copy size={17} weight="600" style={{ flex: 1, textAlign: "center" }}>
          {new Intl.DateTimeFormat("nb-NO", {
            month: "long",
            year: "numeric",
          }).format(new Date(`${month}-01T12:00:00Z`))}
        </Copy>
        <IconButton
          name="chevron.right"
          label="Neste måned"
          onPress={() => moveMonth(1)}
        />
        <IconButton
          name="line.3.horizontal.decrease"
          label="Filtrer forbruk"
          onPress={() => setFilters(true)}
        />
      </View>
      {loadingReceipts ? (
        <Loading />
      ) : (
        <>
          <Panel style={{ backgroundColor: colors.primary, gap: 6 }}>
            <Copy size={13} style={{ color: colors.onPrimary }}>
              Vareforbruk · uten pant
            </Copy>
            <Copy size={32} weight="700" style={{ color: colors.onPrimary }}>
              {formatMoney(totals.products)}
            </Copy>
            <Copy size={13} style={{ color: colors.onPrimary }}>
              {totals.selected.length}{" "}
              {totals.selected.length === 1 ? "kvittering" : "kvitteringer"}
              {totals.provisional ? ` · ${totals.provisional} foreløpige` : ""}
              {reviewedOnly ? " · bare godkjente" : ""}
            </Copy>
            {change !== null && (
              <Copy size={13} style={{ color: colors.onPrimary }}>
                {Math.abs(change)} % {change > 0 ? "mer" : "mindre"} enn{" "}
                {comparison.partial
                  ? "samme del av forrige måned"
                  : "forrige måned"}
              </Copy>
            )}
          </Panel>
          {coverage.pending.length > 0 && (
            <Panel style={{ gap: 0 }}>
              <Row
                title={`${coverage.pending.length} ${coverage.pending.length === 1 ? "kvittering trenger" : "kvitteringer trenger"} kontroll`}
                detail="Kontroller usikre varer for sikrere summer"
                onPress={() => router.navigate("/inbox")}
              />
            </Panel>
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
              <Row
                title="Alle kategorier"
                detail={categoryById.get(rows[0]?.id)?.groupName}
                onPress={() => setGroup(null)}
              />
            )}
            <SpendingBars
              rows={showAllGroups ? rows : rows.slice(0, 5)}
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
              <Empty
                title="Ingen kjøp denne måneden"
                message="Legg til en kvittering for å se forbruket."
              />
            )}
          </Panel>
          {recentReceipts.length > 0 && (
            <View style={{ gap: 2 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Copy size={18} weight="600">
                  Siste kjøp
                </Copy>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.navigate("/history")}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: "center",
                    paddingLeft: 16,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Copy size={14} weight="600">
                    Se alle
                  </Copy>
                </Pressable>
              </View>
              {recentReceipts.map((receipt) => (
                <View
                  key={receipt._id}
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                    paddingVertical: 5,
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
            </View>
          )}
          <View style={{ gap: 4, paddingTop: 8 }}>
            <Copy size={18} weight="600">
              Betaling
            </Copy>
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
              <Row
                key={metric.name}
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
            ))}
          </View>
          <View style={{ gap: 0, paddingTop: 8 }}>
            <Copy size={18} weight="600" style={{ paddingBottom: 6 }}>
              Utforsk forbruket
            </Copy>
            {[
              {
                id: "catalog" as const,
                title: "Produkter og merker",
                value: `${catalog.linked} av ${catalog.total} koblet`,
              },
              {
                id: "calendar" as const,
                title: "Handlekalender",
                value: undefined,
              },
              {
                id: "meat" as const,
                title: "Kjøtt og fisk",
                value: formatMoney(
                  meatRows.reduce((sum, row) => sum + row.amountOre, 0),
                ),
              },
              ...(comparison.previous.selected.length
                ? [
                    {
                      id: "changes" as const,
                      title: "Endringer fra forrige måned",
                      value: undefined,
                    },
                  ]
                : []),
              {
                id: "coverage" as const,
                title: "Om tallene",
                value: undefined,
              },
            ].map((item) => (
              <View
                key={item.id}
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                  paddingVertical: 2,
                }}
              >
                <Row
                  title={item.title}
                  value={item.value}
                  onPress={() => setReport(item.id)}
                />
              </View>
            ))}
          </View>
        </>
      )}
      <Sheet
        title={
          report === "catalog"
            ? "Produkter og merker"
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
            <Copy size={12} muted>
              Viser koblede varer i perioden. Beløpene er fra kvitteringene,
              etter varerabatt. Varer uten treff er fortsatt med i
              totalforbruket.
            </Copy>
            <Copy weight="600">Produkter</Copy>
            <SpendingBars
              rows={catalog.products.slice(0, 8)}
              onSelect={showDetails}
            />
            {!catalog.products.length && (
              <Copy muted>
                Ingen varer er koblet til produktkatalogen ennå.
              </Copy>
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
        {report === "calendar" && (
          <>
            <SpendingCalendar
              receipts={receipts}
              month={month}
              reviewedOnly={reviewedOnly}
              onSelect={showDetails}
            />
          </>
        )}
        {report === "meat" && (
          <>
            <SpendingBars rows={meatRows} onSelect={showDetails} />
            <Copy size={12} muted>
              {meatRows.length
                ? "Råvarer. Pålegg og ferdigretter har egne kategorier."
                : "Ingen registrerte kjøp i denne perioden."}
            </Copy>
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
            <Copy size={13} muted>
              Uavklart forbruk er med. Foreløpige beløp kan endres ved kontroll.
            </Copy>
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
              <Notice>Beløp mangler. Summene er ufullstendige.</Notice>
            )}
            {[
              {
                label: "Ukjent eller annen valuta. Ikke med i NOK-summene.",
                receipts: totals.unconverted,
              },
              {
                label: "Dato mangler. Ikke med i månedsoversikten.",
                receipts: totals.undated,
              },
              {
                label: "Mulige duplikater er med i foreløpige summer.",
                receipts: totals.suspectedDuplicates,
              },
              {
                label: "Varer og betalt beløp stemmer ikke.",
                receipts: totals.discrepancies,
              },
            ]
              .filter((item) => item.receipts.length)
              .map((item) => (
                <View key={item.label}>
                  <Notice>{item.label}</Notice>
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
        <Toggle
          label="Bare godkjente kvitteringer"
          value={reviewedOnly}
          onChange={setReviewedOnly}
        />
        <Copy size={13} muted>
          Godkjente kvitteringer omfatter automatisk godkjenning og din egen
          kontroll.
        </Copy>
        <Button title="Vis oversikt" onPress={() => setFilters(false)} />
      </Sheet>
      <SpendingDetails selected={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}
