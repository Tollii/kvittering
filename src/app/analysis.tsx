import { CalendarDate, CalendarMonth } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import { spendingExplanations } from "@/lib/domain/spending-explanations";
import { useFeatureFlag } from "@/features/featureFlags";
import {
  resolveSpendingSelection,
  type SpendingSelection,
} from "@/lib/spending-selection";
import { useCompleteReceipts } from "@/features/receipt-queries";
import { useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import {
  Disclosure,
  Copy,
  IconButton,
  Notice,
  Panel,
  Row,
  Screen,
  SectionTitle,
  Segments,
} from "@/components/ui";
import { SpendingDetails } from "@/components/spending-details";
import {
  analysisPeriod,
  analysisSummary,
  spendingAnalysis,
  type AnalysisFrequency,
} from "@/lib/domain/spending-analysis";

export default function Analysis() {
  const spendingAnalysisEnabled = useFeatureFlag("spendingAnalysis");
  const { month } = useLocalSearchParams<{ month?: string }>();
  const [frequency, setFrequency] = useState<AnalysisFrequency>("month");

  const [anchor, setAnchor] = useState(() => {
    const requested = month ? CalendarMonth.parse(month) : null;

    return requested &&
      CalendarMonth.compare(requested, CalendarMonth.current()) < 0
      ? CalendarMonth.first(requested)
      : CalendarDate.today();
  });

  const today = CalendarDate.today();
  const [selection, setSelection] = useState<SpendingSelection | null>(null);
  const period = analysisPeriod(anchor, frequency, today);

  const { receipts, completeReceipts } = useCompleteReceipts({
    kind: "period",
    start: period.previousStart,
    end: period.end,
  });

  const report = spendingAnalysis(receipts, period);
  const periodKey = JSON.stringify(period);
  const explanations = spendingExplanations(report);

  const selected = resolveSpendingSelection(selection, periodKey, {
    change: explanations,
    effect: report.effects.map((effect) => ({
      id: effect.id,
      name: `${effect.name} · begge perioder`,
      amountOre: Ore.add(effect.currentOre, effect.previousOre),
      contributions: effect.contributions,
    })),
    category: report.categories.map((row) => ({
      id: row.id,
      name: `${row.name} · begge perioder`,
      amountOre: Ore.add(row.currentOre, row.previousOre),
      contributions: row.contributions,
    })),
  });

  function move(direction: number) {
    if (frequency === "week")
      setAnchor(CalendarDate.shift(period.start, direction * 7));
    else
      setAnchor(
        CalendarMonth.first(
          CalendarMonth.shift(CalendarDate.month(anchor), direction),
        ),
      );
  }

  if (!spendingAnalysisEnabled)
    return (
      <Screen title="Forbruksanalyse">
        <Notice>Forbruksanalysen er midlertidig satt på pause.</Notice>
      </Screen>
    );

  return (
    <Screen insetTop={false}>
      <Stack.Screen options={{ title: "Forbruksanalyse" }} />
      <Segments
        value={frequency}
        onChange={setFrequency}
        options={[
          { value: "week", label: "Uke" },
          { value: "month", label: "Måned" },
        ]}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <IconButton
          name="chevron.left"
          label="Forrige periode"
          onPress={() => move(-1)}
        />
        <Copy weight="600" style={{ flex: 1, textAlign: "center" }}>
          {CalendarDate.format(period.start)} –{" "}
          {CalendarDate.format(period.end)}
        </Copy>
        <IconButton
          name="chevron.right"
          label="Neste periode"
          disabled={period.end >= today}
          onPress={() => move(1)}
        />
      </View>
      {!completeReceipts ? (
        <Notice>Henter hele historikken før analysen vises …</Notice>
      ) : (
        <>
          <Copy selectable size={34} weight="800">
            {Ore.format(report.currentOre)}
          </Copy>
          <Copy selectable>{analysisSummary(report)}</Copy>
          <Copy muted size={13}>
            Sammenlignet med {CalendarDate.format(period.previousStart)} –{" "}
            {CalendarDate.format(period.previousEnd)}. {report.currentReceipts}{" "}
            mot {report.previousReceipts} kvitteringer. Gjelder registrerte
            kjøp, ikke målt forbruk.
          </Copy>
          {(report.provisionalReceipts > 0 || report.missingAmounts > 0) && (
            <Notice tone="warning">
              {report.provisionalReceipts} kvitteringer er foreløpige.{" "}
              {report.missingAmounts} beløp mangler.
            </Notice>
          )}
          {report.previousReceipts > 0 && (
            <>
              <SectionTitle title="Kort forklart" />
              {explanations.map((explanation) => (
                <Row
                  key={explanation.id}
                  title={explanation.name}
                  detail={explanation.detail}
                  onPress={() =>
                    setSelection({
                      period: periodKey,
                      dimension: "change",
                      key: explanation.id,
                    })
                  }
                />
              ))}
              {!explanations.length && (
                <Copy muted>
                  {report.effects.length
                    ? "Ingen pris- eller mengdeendring i de sammenlignbare produktfamiliene."
                    : "Det er ikke nok sammenlignbare produktopplysninger til å forklare endringen."}
                </Copy>
              )}
              <Copy muted size={13}>
                Viser de største pris- og mengdebidragene og opptil to
                produktfamilier som bare er identifisert i denne perioden. Dette
                er ikke nødvendigvis nye eller uvanlige kjøp. Manglende
                kvitteringer og produktkoblinger kan endre bildet.
              </Copy>
              <Disclosure title="Slik er endringen beregnet">
                <Panel style={{ gap: 0, paddingVertical: 4 }}>
                  <Row
                    title="Endret pris per mengde"
                    value={Ore.format(report.priceOre)}
                  />
                  <Row
                    title="Endret kjøpt mengde"
                    value={Ore.format(report.quantityOre)}
                  />
                  <Row
                    title="Andre varer og ukjent mengde"
                    value={Ore.format(report.unexplainedOre)}
                  />
                </Panel>
                <Copy muted size={13}>
                  {report.measuredLines} av {report.productLines} varelinjer kan
                  sammenlignes som samme produktfamilie med kjent mengde. Pris
                  omfatter rabatter og ulik fordeling mellom butikker og
                  pakninger. Dette viser bidrag til endringen, ikke årsaken til
                  prisendringer.
                </Copy>
                <SectionTitle title="Sammenlignbare produkter" />
                {!report.effects.length && (
                  <Copy muted>
                    Vi trenger samme produktfamilie med kjent mengde i begge
                    perioder.
                  </Copy>
                )}
                {report.effects.map((effect) => (
                  <Row
                    key={effect.id}
                    title={effect.name}
                    value={Ore.format(effect.differenceOre)}
                    detail={`${effect.previousQuantity} → ${effect.currentQuantity} ${effect.unit} · pris ${Ore.format(effect.priceOre)}, mengde ${Ore.format(effect.quantityOre)}`}
                    onPress={() =>
                      setSelection({
                        period: periodKey,
                        dimension: "effect",
                        key: effect.id,
                      })
                    }
                  />
                ))}
              </Disclosure>
            </>
          )}
          <SectionTitle
            title={
              report.previousReceipts ? "Kategoriendringer" : "Kjøp i perioden"
            }
          />
          {report.categories.slice(0, 8).map((row) => (
            <Row
              key={row.id}
              title={row.name}
              detail={
                report.previousReceipts
                  ? `${Ore.format(row.previousOre)} → ${Ore.format(row.currentOre)}`
                  : undefined
              }
              value={Ore.format(row.differenceOre)}
              onPress={() =>
                setSelection({
                  period: periodKey,
                  dimension: "category",
                  key: row.id,
                })
              }
            />
          ))}
        </>
      )}
      <SpendingDetails selected={selected} onClose={() => setSelection(null)} />
    </Screen>
  );
}
