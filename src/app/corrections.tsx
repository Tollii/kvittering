import { CalendarDate } from "@/lib/domain/calendar";
import { useReleaseMutation } from "@/lib/releases/requests";
import { useState } from "react";
import { Stack } from "expo-router";
import { useQuery, usePaginatedQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Amount,
  Button,
  Copy,
  Disclosure,
  Empty,
  List,
  Loading,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Sheet,
} from "@/components/ui";
import { OfflineNotice } from "@/features/offline-notice";
import {
  category,
  isDecidedCategory,
  parseCategoryId,
} from "@/lib/domain/categories";
import { failureMessage } from "@/lib/failure-message";
import { plural } from "@/lib/domain/receipt-review";

/** Corrections record ids as stored, which may predate the current categories. */
const categoryName = (id: string | null) => {
  const parsed = parseCategoryId(id);

  return parsed ? category(parsed).name : (id ?? "Ingen");
};

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
      setError(
        failureMessage(cause, "corrections.action", "Kunne ikke fullføre."),
      );
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
      <OfflineNotice />
      {!history ? (
        <Loading />
      ) : (
        <>
          <Amount
            detail={`${plural(history.entries.length - changes.length, "bekreftelse", "bekreftelser")} · siste ${history.entries.length} beslutninger${history.truncated ? ", eldre finnes" : ""}`}
          >
            {plural(changes.length, "rettelse", "rettelser")}
          </Amount>
          {!!error && <Notice tone="error">{error}</Notice>}
          <SectionTitle
            title="Siste beslutninger"
            detail="Trykk på en rettelse for å bruke den på samme vare i andre kvitteringer"
          />
          {!history.entries.length && (
            <Empty
              title="Ingen rettelser ennå"
              message="Rett en kategori eller produktkobling på en kvittering. Valget vises her når du lagrer."
              icon="checkmark.circle"
            />
          )}
          <List>
            {history.entries.map((entry) => (
              <Row
                key={entry._id}
                title={entry.name}
                detail={
                  entry.field !== "category"
                    ? "Produktkobling endret"
                    : entry.previous === entry.expected
                      ? `Bekreftet: ${categoryName(entry.expected)}`
                      : `${categoryName(entry.previous)} → ${categoryName(entry.expected)}`
                }
                value={entry.store ?? undefined}
                onPress={
                  entry.field === "category" &&
                  isDecidedCategory(entry.expected)
                    ? () => {
                        setTargetKeys([]);
                        setSelected(entry._id);
                      }
                    : undefined
                }
              />
            ))}
          </List>
          {historyPage.status === "CanLoadMore" && (
            <Button
              title="Vis eldre beslutninger"
              variant="secondary"
              onPress={() => historyPage.loadMore(50)}
            />
          )}
          <Disclosure title="Om rettelser">
            <Copy size={14} muted>
              Nye kategori- og produktrettelser lagres fra nå av. Automatisk
              godkjenning teller ikke som en rettelse.
            </Copy>
          </Disclosure>
          {!!batches?.length && (
            <>
              <SectionTitle title="Rettelser på flere varer" />
              <List>
                {batches.map((batch) => (
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
              </List>
            </>
          )}
        </>
      )}
      <Sheet
        title="Bruk rettelsen på samme vare"
        visible={!!selected}
        onClose={() => setSelected(null)}
        footer={
          <>
            {!!error && <Notice tone="error">{error}</Notice>}
            <Button
              title={`Rett ${plural(targets.length, "vare", "varer")}`}
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
        }
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
            <List>
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
                  detail={`${CalendarDate.format(target.date)} · ${categoryName(target.categoryId)}`}
                />
              ))}
            </List>
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
                variant="secondary"
                onPress={() => previewPage.loadMore(20)}
              />
            )}
          </>
        )}
      </Sheet>
    </Screen>
  );
}
