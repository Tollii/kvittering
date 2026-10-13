import { CalendarMonth } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import { useMemo, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import {
  Amount,
  Button,
  Copy,
  Empty,
  List,
  Loading,
  Notice,
  Panel,
  Row,
  SectionTitle,
  useLargeText,
} from "@/components/ui";
import { AllCategoriesLink, SpendingBars } from "@/components/spending-details";
import { radius, useTheme } from "@/constants/theme";
import {
  spendingTrend,
  trendLength,
  trendPeriod,
  trendSeries,
} from "@/lib/domain/spending-trend";
import { useCompleteReceipts } from "@/features/receipt-queries";

type Series = ReturnType<typeof trendSeries>;

/** The twelve months up to the month Forbruk shows, for all purchases or one category group. */
export function SpendingTrend({
  month,
  onMonth,
}: Readonly<{
  month: CalendarMonth;
  /** Opens a month in Forbruk, inside the category group when one is chosen. */
  onMonth: (month: CalendarMonth, group: string | null) => void;
}>) {
  const [chosen, setGroup] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const {
    receipts,
    loadingReceipts: loading,
    completeReceipts: complete,
  } = useCompleteReceipts({ kind: "period", ...trendPeriod(month) });

  const trend = useMemo(
    () => spendingTrend(receipts, month),
    [receipts, month],
  );

  // A sync can remove the chosen group's last purchase while the sheet is open.
  const group = trend.groups.some((value) => value.id === chosen)
    ? chosen
    : null;

  const series = trendSeries(trend, group);

  if (loading) return <Loading />;

  if (!series.months.some((value) => value.recorded))
    return !complete ? (
      <Notice>Kvitteringene er ikke hentet ennå.</Notice>
    ) : (
      <Empty
        title="Ingen kjøp i perioden"
        message={`Forbruket de siste ${trendLength} månedene vises her når dere har kvitteringer fra dem.`}
        icon="chart.bar.xaxis"
      />
    );

  const groups = showAll ? trend.groups : trend.groups.slice(0, 5);

  return (
    <>
      {!complete && <Notice>Henter kvitteringer …</Notice>}
      {!!group && (
        <AllCategoriesLink group={group} onPress={() => setGroup(null)} />
      )}
      <Average series={series} />
      <TrendChart series={series} month={month} />
      {!group && (
        <View style={{ gap: 4 }}>
          <SectionTitle
            title="Kategorier"
            detail="Velg en kategori for å se utviklingen i den."
          />
          <SpendingBars
            rows={groups}
            total={Ore.sum(trend.months.map((value) => value.products))}
            onSelect={(row) => {
              setGroup(row.id);
              setShowAll(false);
            }}
          />
          {trend.groups.length > 5 && (
            <Button
              title={showAll ? "Vis færre" : `Vis alle ${trend.groups.length}`}
              variant="secondary"
              compact
              onPress={() => setShowAll(!showAll)}
            />
          )}
        </View>
      )}
      <View style={{ gap: 4 }}>
        <SectionTitle title="Måneder" />
        <List>
          {[...series.months].reverse().map((value) => (
            <Row
              key={value.month}
              title={CalendarMonth.title(value.month)}
              detail={monthDetail(value)}
              value={value.recorded ? Ore.format(value.amountOre) : undefined}
              onPress={() => onMonth(value.month, group)}
            />
          ))}
        </List>
      </View>
    </>
  );
}

function monthDetail(month: Series["months"][number]) {
  if (month.otherCurrency) return "Bare kvitteringer i annen valuta";

  if (!month.recorded) return "Ingen kvitteringer";

  return month.partial ? "Hittil i måneden" : undefined;
}

function Average({ series }: Readonly<{ series: Series }>) {
  const count = series.averageMonths;

  if (series.averageOre === null)
    return <Copy muted>Snittet vises når en hel måned har kvitteringer.</Copy>;

  const months = count === 1 ? "1 hel måned" : `${count} hele måneder`;

  return (
    <Amount detail={`Snitt per måned · ${months} med kvitteringer`}>
      {Ore.format(series.averageOre)}
    </Amount>
  );
}

/**
 * Columns for the months, with the month Forbruk shows in the strongest step.
 * The month list below carries the same amounts, so VoiceOver reads that
 * instead, and large text or a narrow screen leaves the list alone.
 */
function TrendChart({
  series,
  month,
}: Readonly<{ series: Series; month: CalendarMonth }>) {
  const colors = useTheme();
  const largeText = useLargeText();
  const { width } = useWindowDimensions();

  if (largeText || width < 380) return null;

  const maximum = Math.max(1, ...series.months.map((value) => value.amountOre));

  return (
    <Panel>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ gap: 6 }}
      >
        <View
          style={{
            height: 140,
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          {series.months.map((value) => (
            <View
              key={value.month}
              style={{
                flex: 1,
                // A month without receipts keeps a stub, so the gap reads as missing rather than zero.
                height: value.recorded
                  ? `${(Math.max(0, value.amountOre) / maximum) * 100}%`
                  : 2,
                borderRadius: radius.chip,
                borderCurve: "continuous",
                backgroundColor: !value.recorded
                  ? colors.muted
                  : value.month === month
                    ? colors.chart[0]
                    : colors.chart[2],
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {series.months.map((value) => (
            <Copy
              key={value.month}
              role="caption"
              weight={value.month === month ? "700" : "400"}
              muted={value.month !== month}
              style={{ flex: 1, textAlign: "center" }}
            >
              {CalendarMonth.title(value.month).charAt(0)}
            </Copy>
          ))}
        </View>
      </View>
    </Panel>
  );
}
