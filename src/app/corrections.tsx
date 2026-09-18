import { useState } from "react";
import { Stack } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { EvaluationResult } from "../../convex/correctionEvaluation";
import {
  Button,
  Copy,
  Loading,
  Notice,
  Panel,
  Row,
  Screen,
  SectionTitle,
  Sheet,
} from "@/components/ui";
import { categoryById } from "@/lib/domain/categories";
import { formatDate } from "@/lib/format-date";
const categoryName = (id: string | null) =>
  id ? (categoryById.get(id)?.name ?? id) : "Ingen";

export default function Corrections() {
  const history = useQuery(api.corrections.list, {});
  const batches = useQuery(api.corrections.batches, {});
  const [selected, setSelected] = useState<Id<"corrections"> | null>(null);
  const preview = useQuery(
    api.corrections.preview,
    selected ? { id: selected } : "skip",
  );
  const evaluate = useAction(api.correctionEvaluation.evaluate);
  const apply = useMutation(api.corrections.apply);
  const undo = useMutation(api.corrections.undo);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke fullføre.");
    } finally {
      setBusy(false);
    }
  }
  const changes =
    history?.entries.filter((entry) => entry.previous !== entry.expected) ?? [];
  const selectedEntry = history?.entries.find(
    (entry) => entry._id === selected,
  );
  return (
    <Screen insetTop={false}>
      <Stack.Screen options={{ title: "Rettelser og læring" }} />
      {!history ? (
        <Loading />
      ) : (
        <>
          <Copy selectable size={24} weight="700">
            {changes.length} rettelser ·{" "}
            {history.entries.length - changes.length} bekreftelser
          </Copy>
          <Copy muted size={13}>
            Siste {history.entries.length} registrerte beslutninger
            {history.truncated ? " (eldre finnes)" : ""}. Vi lagrer nye
            kategori- og produktrettelser fra nå av. Automatisk godkjenning
            teller ikke som en rettelse.
          </Copy>
          <Button
            title="Test Jev mot rettelsene"
            secondary
            busy={busy}
            disabled={
              !history.entries.some((entry) => entry.field === "category")
            }
            onPress={() => void run(async () => setResult(await evaluate({})))}
          />
          {result && (
            <Panel>
              <Copy weight="700">
                {result.matched} av {result.checked} kategorier samsvarer
              </Copy>
              <Copy muted size={12}>
                {result.model}. Siste beslutning per vare. Dette er en test mot
                husstandens valg, ikke en generell nøyaktighetsmåling.
                Produktkoblinger testes ikke her.
              </Copy>
              {result.results
                .filter((entry) => entry.expected !== entry.actual)
                .map((entry) => (
                  <Row
                    key={entry.id}
                    title={entry.name}
                    detail={`Du: ${categoryName(entry.expected)} · Jev: ${categoryName(entry.actual)}`}
                  />
                ))}
            </Panel>
          )}
          {!!error && <Notice error>{error}</Notice>}
          <SectionTitle title="Siste beslutninger" />
          {!history.entries.length && (
            <Copy muted>
              Rett en kategori eller produktkobling på en kvittering.
              Beslutningen blir synlig her når du lagrer.
            </Copy>
          )}
          {history.entries.map((entry) => (
            <Row
              key={entry._id}
              title={entry.name}
              detail={
                entry.field === "category"
                  ? `${categoryName(entry.previous)} → ${categoryName(entry.expected)}`
                  : "Produktkobling endret"
              }
              value={entry.store ?? undefined}
              onPress={
                entry.field === "category" &&
                entry.expected &&
                entry.expected !== "fallback.unclear" &&
                categoryById.has(entry.expected)
                  ? () => setSelected(entry._id)
                  : undefined
              }
            />
          ))}
          {!!batches?.length && (
            <SectionTitle title="Rettelser på flere varer" />
          )}
          {batches?.map((batch) => (
            <Row
              key={batch._id}
              title={`${batch.changes.reduce((sum, change) => sum + change.before.length, 0)} varer rettet`}
              detail={
                batch.undone
                  ? "Angret"
                  : "Angre er tilgjengelig så lenge kvitteringene ikke er endret"
              }
              value={batch.undone ? undefined : "Angre"}
              onPress={
                batch.undone || busy
                  ? undefined
                  : () => void run(() => undo({ id: batch._id }))
              }
            />
          ))}
        </>
      )}
      <Sheet
        title="Bruk rettelsen på samme vare"
        visible={!!selected}
        onClose={() => setSelected(null)}
      >
        <Copy>
          Sett kategorien til {categoryName(selectedEntry?.expected ?? null)}{" "}
          for disse varene fra samme butikk. Varer du har rettet manuelt
          beholdes.
        </Copy>
        {preview === undefined ? (
          <Loading />
        ) : (
          <>
            {preview.targets.map((target) => (
              <Row
                key={`${target.receiptId}:${target.lineId}`}
                title={target.name}
                detail={`${formatDate(target.date)} · ${categoryName(target.categoryId)}`}
              />
            ))}
            {!preview.targets.length && (
              <Copy muted>Ingen andre varer kan rettes.</Copy>
            )}
            {preview.truncated && (
              <Notice>
                Viser inntil 20 varer fra de 200 nyeste kvitteringene.
              </Notice>
            )}
            {!!error && <Notice error>{error}</Notice>}
            <Button
              title={`Rett ${preview.targets.length} varer`}
              disabled={!preview.targets.length || busy}
              busy={busy}
              onPress={() =>
                void run(async () => {
                  if (!selected) return;
                  await apply({
                    id: selected,
                    targets: preview.targets.map(
                      ({ receiptId, lineId, revision }) => ({
                        receiptId,
                        lineId,
                        revision,
                      }),
                    ),
                  });
                  setSelected(null);
                })
              }
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
