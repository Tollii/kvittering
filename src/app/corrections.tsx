import { useReleaseMutation } from "@/lib/releases/requests";
import { useState } from "react";
import { Stack } from "expo-router";
import { useQuery, usePaginatedQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Button,
  Copy,
  Empty,
  Loading,
  Notice,
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
  const historyPage = usePaginatedQuery(
    api.corrections.listPage,
    {},
    { initialNumItems: 50 },
  );

  const history =
    historyPage.status === "LoadingFirstPage"
      ? undefined
      : {
          entries: historyPage.results,
          truncated: historyPage.status !== "Exhausted",
        };

  const batches = useQuery(api.corrections.batches, {});
  const [selected, setSelected] = useState<Id<"corrections"> | null>(null);
  const [targetKeys, setTargetKeys] = useState<string[]>([]);

  const previewPage = usePaginatedQuery(
    api.corrections.previewPage,
    selected ? { id: selected } : "skip",
    { initialNumItems: 20 },
  );

  const preview =
    previewPage.status === "LoadingFirstPage"
      ? undefined
      : {
          targets: previewPage.results.flatMap((group) => group.targets),
          truncated: previewPage.status !== "Exhausted",
        };

  const targets =
    preview?.targets.filter((target) =>
      targetKeys.includes(`${target.receiptId}:${target.lineId}`),
    ) ?? [];

  const apply = useReleaseMutation(api.corrections.apply);
  const undo = useReleaseMutation(api.corrections.undo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run<Result>(action: () => Promise<Result>) {
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
      <Stack.Screen options={{ title: "Rettelser" }} />
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
          {!!error && <Notice error>{error}</Notice>}
          <SectionTitle title="Siste beslutninger" />
          {!history.entries.length && (
            <Empty
              title="Ingen rettelser ennå"
              message="Rett en kategori eller produktkobling på en kvittering. Valget vises her når du lagrer."
              icon="checkmark.circle"
            />
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
                  ? () => {
                      setTargetKeys([]);
                      setSelected(entry._id);
                    }
                  : undefined
              }
            />
          ))}
          {historyPage.status === "CanLoadMore" && (
            <Button
              title="Vis eldre beslutninger"
              secondary
              onPress={() => historyPage.loadMore(50)}
            />
          )}
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
                selected={targetKeys.includes(
                  `${target.receiptId}:${target.lineId}`,
                )}
                onPress={() => {
                  const key = `${target.receiptId}:${target.lineId}`;
                  setTargetKeys((previous) =>
                    previous.includes(key)
                      ? previous.filter((value) => value !== key)
                      : previous.length < 20
                        ? [...previous, key]
                        : previous,
                  );
                }}
                detail={`${formatDate(target.date)} · ${categoryName(target.categoryId)}`}
              />
            ))}
            {!preview.targets.length && (
              <Copy muted>Ingen andre varer kan rettes.</Copy>
            )}
            {preview.truncated && (
              <Notice>
                Flere kvitteringer kan undersøkes. Velg inntil 20 varer.
              </Notice>
            )}
            {previewPage.status === "CanLoadMore" && (
              <Button
                title="Undersøk flere kvitteringer"
                secondary
                onPress={() => previewPage.loadMore(20)}
              />
            )}
            {!!error && <Notice error>{error}</Notice>}
            <Button
              title={`Rett ${targets.length} varer`}
              disabled={!targets.length || busy}
              busy={busy}
              onPress={() =>
                void run(async () => {
                  if (!selected) return;
                  await apply({
                    id: selected,
                    targets: targets.map(({ receiptId, lineId, revision }) => ({
                      receiptId,
                      lineId,
                      revision,
                    })),
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
