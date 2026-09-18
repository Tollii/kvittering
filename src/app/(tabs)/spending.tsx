import { useState } from "react";
import { View } from "react-native";
import {
  Button,
  Copy,
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

export default function Spending() {
  const { receipts, loadingReceipts, completeReceipts, online } =
    useHousehold();
  const colors = useTheme();
  const [month, setMonth] = useState(osloDate().slice(0, 7));
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [breakdown, setBreakdown] = useState<"category" | "store" | "type">(
    "category",
  );
  const [group, setGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpendingGroup | null>(null);
  const comparison = comparisonInsights(receipts, month, reviewedOnly);
  const totals = comparison.current;
  const coverage = receiptCoverage(receipts);
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
  const select = (
    name: string,
    amountOre: number,
    contributions: Contribution[],
  ) => setSelected({ id: name, name, amountOre, contributions });
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
  return (
    <Screen title="Forbruk" subtitle="Husstandens dagligvarer" settings>
      {!online && <Notice>Uten nett. Oversikten kan være ufullstendig.</Notice>}
      {!completeReceipts && (
        <Notice>Henter kvitteringer. Summene er foreløpige.</Notice>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Button title="‹" secondary onPress={() => moveMonth(-1)} />
        <Copy size={18} weight="600" style={{ flex: 1, textAlign: "center" }}>
          {new Intl.DateTimeFormat("nb-NO", {
            month: "long",
            year: "numeric",
          }).format(new Date(`${month}-01T12:00:00Z`))}
        </Copy>
        <Button title="›" secondary onPress={() => moveMonth(1)} />
      </View>
      <Toggle
        label="Bare kontrollerte kvitteringer"
        value={reviewedOnly}
        onChange={setReviewedOnly}
      />
      {loadingReceipts ? (
        <Loading />
      ) : (
        <>
          <Panel style={{ backgroundColor: colors.primary }}>
            <Copy style={{ color: colors.onPrimary }}>
              Registrert vareforbruk, uten pant
            </Copy>
            <Copy size={38} weight="700" style={{ color: colors.onPrimary }}>
              {formatMoney(totals.products)}
            </Copy>
            <Copy style={{ color: colors.onPrimary }}>
              {change === null
                ? "Ingen sammenligning for forrige måned."
                : `${Math.abs(change)} % ${change > 0 ? "mer" : "mindre"} enn forrige periode.`}
            </Copy>
            <Copy size={13} style={{ color: colors.onPrimary }}>
              {comparison.partial ? "Samme del av måneden" : "Hele måneder"} ·
              til {comparison.currentEnd} mot {comparison.previousEnd}
            </Copy>
            <Copy size={13} style={{ color: colors.onPrimary }}>
              {totals.selected.length} kvitteringer · {totals.provisional}{" "}
              foreløpige
            </Copy>
          </Panel>
          <Panel>
            <Copy size={20} weight="600">
              Kjøtt og fisk
            </Copy>
            <SpendingBars
              rows={["poultry", "pork", "lamb", "beef", "fish"].map(
                (id) =>
                  totals.categories.find(
                    (category) => category.id === `meat-fish.${id}`,
                  ) ?? {
                    id,
                    name: categoryById.get(`meat-fish.${id}`)?.name ?? id,
                    amountOre: 0,
                    contributions: [],
                  },
              )}
              onSelect={setSelected}
            />
            <Copy size={12} muted>
              Råvarer i kjøtt og fisk. Pålegg og ferdigretter har egne
              kategorier.
            </Copy>
          </Panel>
          <Panel>
            <SpendingCalendar
              receipts={receipts}
              month={month}
              reviewedOnly={reviewedOnly}
              onSelect={setSelected}
            />
          </Panel>
          <Panel>
            <Copy size={20} weight="600">
              Fordeling
            </Copy>
            <Segments
              value={breakdown}
              onChange={(value) => {
                setBreakdown(value);
                setGroup(null);
              }}
              options={[
                { value: "category", label: "Kategori" },
                { value: "store", label: "Butikk" },
                { value: "type", label: "Varetype" },
              ]}
            />
            {group && (
              <Button
                title="Alle kategorier"
                secondary
                onPress={() => setGroup(null)}
              />
            )}
            <SpendingBars
              rows={rows}
              onSelect={(row) => {
                if (breakdown === "category" && !group) setGroup(row.id);
                else setSelected(row);
              }}
            />
            {!rows.length && (
              <Empty
                title="Ingen registrerte kjøp"
                message="Legg til en kvittering for å se forbruket."
              />
            )}
            <Copy muted size={12}>
              Uavklart forbruk er med. Foreløpige beløp kan endres ved kontroll.
            </Copy>
          </Panel>
          <Panel>
            <Copy size={20} weight="600">
              Betaling og rabatter
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
                name: "Registrerte rabatter",
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
          </Panel>
          {comparison.previous.selected.length > 0 && (
            <Panel>
              <Copy size={20} weight="600">
                Største endringer
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
            </Panel>
          )}
          <Panel>
            <Copy size={20} weight="600">
              Datagrunnlag
            </Copy>
            <Row
              title={`${coverage.pending.length} kvitteringer til kontroll`}
              onPress={() =>
                select(
                  "Til kontroll",
                  0,
                  receiptContributions(coverage.pending),
                )
              }
            />
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
                      onPress={() => openReceipt(receipt)}
                    />
                  ))}
                </View>
              ))}
          </Panel>
        </>
      )}
      <SpendingDetails selected={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}
