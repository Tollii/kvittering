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
  Button,
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
import { useHousehold } from "@/features/session";
import {
  analysisPeriod,
  analysisSummary,
  shiftDate,
  spendingAnalysis,
  type AnalysisFrequency,
} from "@/lib/domain/spending-analysis";
import { formatMoney, osloDate } from "@/lib/domain/receipt";
import { formatDate } from "@/lib/format-date";

export default function Analysis() {
  const spendingAnalysisEnabled = useFeatureFlag("spendingAnalysis");
  const { month } = useLocalSearchParams<{ month?: string }>();
  const { synchronize } = useHousehold();
  const [frequency, setFrequency] = useState<AnalysisFrequency>("month");

  const [anchor, setAnchor] = useState(
    month &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
      month < osloDate().slice(0, 7)
      ? `${month}-01`
      : osloDate(),
  );

  const [today, setToday] = useState(osloDate());
  const [selection, setSelection] = useState<SpendingSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      amountOre: effect.currentOre + effect.previousOre,
      contributions: effect.contributions,
    })),
    category: report.categories.map((row) => ({
      id: row.id,
      name: `${row.name} · begge perioder`,
      amountOre: row.currentOre + row.previousOre,
      contributions: row.contributions,
    })),
  });

  function move(direction: number) {
    if (frequency === "week") setAnchor(shiftDate(period.start, direction * 7));
    else {
      const date = new Date(`${anchor}T12:00:00Z`);
      setAnchor(
        new Date(
          Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth() + direction,
            1,
            12,
          ),
        )
          .toISOString()
          .slice(0, 10),
      );
    }
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
          {formatDate(period.start)} – {formatDate(period.end)}
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
            {formatMoney(report.currentOre)}
          </Copy>
          <Copy selectable>{analysisSummary(report)}</Copy>
          <Copy muted size={13}>
            Sammenlignet med {formatDate(period.previousStart)} –{" "}
            {formatDate(period.previousEnd)}. {report.currentReceipts} mot{" "}
            {report.previousReceipts} kvitteringer. Gjelder registrerte kjøp,
            ikke målt forbruk.
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
              <SectionTitle title="Hva forklarer forskjellen?" />
              <Panel style={{ gap: 0, paddingVertical: 4 }}>
                <Row
                  title="Endret pris per mengde"
                  value={formatMoney(report.priceOre)}
                />
                <Row
                  title="Endret kjøpt mengde"
                  value={formatMoney(report.quantityOre)}
                />
                <Row
                  title="Andre varer og ukjent mengde"
                  value={formatMoney(report.unexplainedOre)}
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
                  value={formatMoney(effect.differenceOre)}
                  detail={`${effect.previousQuantity} → ${effect.currentQuantity} ${effect.unit} · pris ${formatMoney(effect.priceOre)}, mengde ${formatMoney(effect.quantityOre)}`}
                  onPress={() =>
                    setSelection({
                      period: periodKey,
                      dimension: "effect",
                      key: effect.id,
                    })
                  }
                />
              ))}
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
                  ? `${formatMoney(row.previousOre)} → ${formatMoney(row.currentOre)}`
                  : undefined
              }
              value={formatMoney(row.differenceOre)}
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
      <Button
        title="Oppdater analyse"
        secondary
        busy={busy}
        onPress={() => {
          setBusy(true);
          setError("");
          void synchronize()
            .then(() => setToday(osloDate()))
            .catch(() => setError("Kunne ikke oppdatere. Prøv igjen."))
            .finally(() => setBusy(false));
        }}
      />
      <Copy muted size={12}>
        Analysen oppdateres også når nye kvitteringer og produktopplysninger
        kommer inn.
      </Copy>
      {!!error && <Notice error>{error}</Notice>}
      <SpendingDetails selected={selected} onClose={() => setSelection(null)} />
    </Screen>
  );
}
