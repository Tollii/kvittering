import { isDecidedCategory } from "@/lib/domain/categories";
import { isReceiptProcessing } from "@/lib/domain/receipt-state";
import { releaseMutation } from "@/lib/releases/requests";
import { useDraftNavigation } from "./receipt-draft-navigation";
import { useRef, useState, type ReactNode, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { useConvex } from "convex/react";

import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import {
  isDraftBusy,
  type ReceiptDraft,
  type ReceiptDraftAction,
} from "@/features/receipt-draft";
import {
  Button,
  Copy,
  Disclosure,
  Icon,
  IconButton,
  Notice,
  Panel,
  Row,
  Screen,
  Segments,
  Sheet,
  Toggle,
  pressed,
} from "@/components/ui";
import { ReceiptLineEditor } from "@/features/receipt-line-editor";
import { ReceiptFields } from "@/features/receipt-fields";
import {
  PurchaseTotals,
  ReceiptFooter,
  ReceiptLineList,
  ReceiptSummary,
  ReviewTaskChips,
} from "@/features/receipt-editor-sections";
import {
  aliasKey,
  emptyLine,
  isTotalsLine,
  reconcile,
  type ReceiptData,
} from "@/lib/domain/receipt";
import {
  canAcceptReceipt,
  canConfirmSuggestedCategory,
  isCategoryUncertain,
  confirmSuggestedCategories,
  lineReviewIssues,
  reviewTasks,
} from "@/lib/domain/receipt-review";
import {
  useCompleteReceipts,
  useReceiptEditorContext,
} from "./receipt-queries";
import type { Receipt } from "@/lib/domain/insights";
import { receiptStatusLabel } from "@/components/receipt-card";
import { useTheme } from "@/constants/theme";
import { priceSignals } from "@/lib/domain/price-signals";
import { errorFeedback, successFeedback, tapFeedback } from "@/lib/haptics";

export function ReceiptEditor({
  receipt,
  online,
  onDeletionChange,
  draft,
  dispatch,
  storageError,
}: Readonly<{
  receipt: Receipt;
  draft: ReceiptDraft;
  dispatch: (action: ReceiptDraftAction) => void;
  storageError: string;
  online: boolean;
  onDeletionChange: (state: "idle" | "deleting" | "deleted") => void;
}>) {
  const client = useConvex();
  const colors = useTheme();

  const history = useCompleteReceipts({
    kind: "priceHistory",
    receiptId: receipt._id,
  });

  const context = useReceiptEditorContext(receipt._id);

  const {
    data,
    duplicateResolved,
    excluded,
    remember,
    productChanges,
    physicalStoreId,
  } = draft.values;

  const { moneyErrors, dirty, generation } = draft;
  const revision = draft.baseline.revision;

  const busy = isDraftBusy(draft);

  const approved = draft.operation.kind === "saved" && draft.operation.approved;
  const error = draft.operation.kind === "failed" ? draft.operation.error : "";
  const [message, setMessage] = useState("");
  const operationActive = useRef(false);

  const [allLinesSelected, setAllLines] = useState(false);
  const allLines = receipt.status === "reviewed" || allLinesSelected;

  const [reviewLineIds, setReviewLineIds] = useState(
    () =>
      new Set(
        receipt.data?.lines
          .filter((line) => lineReviewIssues(line).length)
          .map((line) => line.id),
      ),
  );

  const [summaryLines, setSummaryLines] = useState(false);
  const [sheet, setSheet] = useState<"fields" | "actions" | null>(null);
  useDraftNavigation(draft, () => dispatch({ type: "discard" }));

  const processing = isReceiptProcessing(receipt.status);

  const totals = data ? reconcile(data) : null;
  const unresolvedDuplicate = !!receipt.duplicateOf && !duplicateResolved;
  const tasks = data ? reviewTasks(data, unresolvedDuplicate) : [];

  const remaining =
    data?.lines.filter((line) => lineReviewIssues(line).length).length ?? 0;

  const confirmable =
    data?.lines.filter(canConfirmSuggestedCategory).length ?? 0;

  const ready = !!data && canAcceptReceipt(data, unresolvedDuplicate);

  const saveDisabled =
    !online ||
    processing ||
    receipt.revision !== revision ||
    !!Object.keys(moneyErrors).length;

  const signals = priceSignals(
    history.completeReceipts ? history.receipts : [],
    receipt,
  );

  const recentCategories = context?.recentCategories ?? [];

  const productLines =
    data?.lines.filter((line) => !isTotalsLine(line.kind)) ?? [];

  const visibleLines =
    data?.lines.filter((line) =>
      allLines
        ? summaryLines ||
          !isTotalsLine(line.kind) ||
          lineReviewIssues(line).length
        : reviewLineIds.has(line.id) || lineReviewIssues(line).length,
    ) ?? [];

  const nextPending = context?.nextPendingId
    ? { _id: context.nextPendingId }
    : undefined;

  function change(next: ReceiptData) {
    dispatch({ type: "data", data: next });
    setMessage("");
  }

  function rememberLines(ids: string[], value = true) {
    dispatch({ type: "remember", ids, value });
    setMessage("");
  }

  function reset(current: Receipt) {
    dispatch({ type: "remote", receipt: current });
    dispatch({ type: "discard" });
    setReviewLineIds(
      new Set(
        current.data?.lines
          .filter((line) => lineReviewIssues(line).length)
          .map((line) => line.id),
      ),
    );
    setAllLines(current.status === "reviewed");
    setMessage("");
  }

  const moneyError = (key: string, error: string | null) =>
    dispatch({ type: "money-error", key, error });

  async function run(
    action: () => Promise<void>,
    operation: "saving" | "deleting" | "working" = "working",
  ) {
    if (operationActive.current) return;
    operationActive.current = true;
    dispatch({ type: "start", operation });
    setMessage("");

    try {
      await action();
    } catch (cause) {
      errorFeedback();
      dispatch({
        type: "failed",
        error: cause instanceof Error ? cause.message : "Kunne ikke lagre.",
      });
    } finally {
      operationActive.current = false;
      dispatch({ type: "finished" });
    }
  }

  async function save() {
    if (!data || saveDisabled) return;
    await run(async () => {
      const acknowledgement = await releaseMutation(client, api.receipts.save, {
        id: receipt._id,
        revision,
        data,
        reviewed: ready,
        // The server needs a store and a name to build a memory key.
        rememberLineIds: remember.filter((id) => {
          const line = data.lines.find((item) => item.id === id);

          return (
            line &&
            line.kind === "product" &&
            isDecidedCategory(line.categoryId) &&
            aliasKey(data, line) !== null
          );
        }),
        selections: Object.entries(productChanges).map(([lineId, choice]) =>
          choice.kind === "catalog"
            ? { kind: "catalog" as const, lineId, key: choice.key }
            : { ...choice, lineId },
        ),
        physicalStoreId,
        duplicateResolved,
        excluded,
      });

      dispatch({
        type: "saved",
        revision: acknowledgement.revision,
        approved: ready,
      });

      if (ready) successFeedback();
    }, "saving");
  }

  function addLine() {
    if (!data) return;
    change({ ...data, lines: [emptyLine(randomUUID()), ...data.lines] });
    setAllLines(true);
  }

  function removeReceipt() {
    Alert.alert(
      "Slett kvitteringen?",
      "Kvitteringen og bildene blir slettet.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Slett",
          style: "destructive",
          onPress: () =>
            void run(async () => {
              onDeletionChange("deleting");

              try {
                await releaseMutation(client, api.receipts.remove, {
                  id: receipt._id,
                  revision,
                });
                dispatch({ type: "deleted" });
                onDeletionChange("deleted");
              } catch (cause) {
                onDeletionChange("idle");
                throw cause;
              }
            }, "deleting"),
        },
      ],
    );
  }

  const retry = () =>
    void run(async () => {
      await releaseMutation(client, api.receipts.retry, { id: receipt._id });
      setMessage("Leser på nytt …");
    });

  function confirmAllCategories() {
    if (!data) return;
    tapFeedback();

    const ids = data.lines
      .filter(canConfirmSuggestedCategory)
      .map((line) => line.id);

    change(confirmSuggestedCategories(data));
    rememberLines(ids);
  }

  const footerLabel = processing
    ? receiptStatusLabel(receipt)
    : approved
      ? "Godkjent"
      : ready
        ? dirty
          ? "Klar til godkjenning"
          : receipt.status === "reviewed"
            ? receiptStatusLabel(receipt)
            : "Klar til godkjenning"
        : tasks.length === 1
          ? "Én ting igjen"
          : `${tasks.length} ting igjen`;

  const screenOptions: ComponentProps<typeof Stack.Screen>["options"] = {
    title: data?.store || receipt.data?.store || "Kvittering",
    headerStyle: { backgroundColor: colors.hero },
    headerTintColor: colors.onHero,
    headerTitleStyle: { color: colors.onHero, fontWeight: "600" },
  };

  if (Platform.OS !== "ios")
    screenOptions.headerRight = () => (
      <IconButton
        name="ellipsis"
        label="Flere handlinger"
        onPress={() => setSheet("actions")}
      />
    );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <ReceiptToolbar>
        {data &&
          !processing &&
          !approved &&
          (dirty || receipt.status !== "reviewed") && (
            <Stack.Toolbar.Button
              icon="checkmark"
              disabled={saveDisabled || busy || (!dirty && !ready)}
              onPress={() => void save()}
            >
              {busy ? "Lagrer …" : dirty ? "Lagre" : "Godkjenn"}
            </Stack.Toolbar.Button>
          )}
        <Stack.Toolbar.Menu icon="ellipsis" title="Flere handlinger">
          <Stack.Toolbar.MenuAction
            icon="pencil"
            disabled={!data || busy}
            onPress={() => setSheet("fields")}
          >
            Kvitteringsdetaljer
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="plus"
            disabled={!data || busy || processing}
            onPress={addLine}
          >
            Legg til linje
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="list.bullet"
            isOn={summaryLines}
            onPress={() => {
              setSummaryLines(!summaryLines);
              setAllLines(true);
            }}
          >
            Vis MVA og oppsummering
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="eye.slash"
            isOn={excluded}
            disabled={busy}
            onPress={() => {
              dispatch({ type: "edit", values: { excluded: !excluded } });
              setMessage("");
            }}
          >
            Utelat fra forbruk
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="arrow.clockwise"
            disabled={processing || !online || busy || dirty}
            onPress={retry}
          >
            Les bildene på nytt
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="trash"
            destructive
            disabled={!online || busy || receipt.status === "uploading"}
            onPress={removeReceipt}
          >
            Slett kvittering
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </ReceiptToolbar>
      <Screen
        summary={
          <ReceiptSummary
            receipt={receipt}
            data={data}
            dirty={dirty}
            excluded={excluded}
            approved={approved}
            processing={processing}
            busy={busy}
            chips={
              <ReviewTaskChips
                tasks={tasks}
                data={data}
                totals={totals}
                onResolveDuplicate={() => {
                  dispatch({
                    type: "edit",
                    values: { duplicateResolved: true },
                  });
                  setMessage("");
                }}
                onEditFields={() => setSheet("fields")}
                onShowLines={(lines) => setAllLines(lines === "all")}
                onAddLine={addLine}
                onChange={change}
              />
            }
            onEditFields={() => setSheet("fields")}
          />
        }
        insetTop={false}
        statusBarStyle="light"
        footer={
          data && !processing ? (
            <ReceiptFooter
              error={error}
              ready={ready}
              approved={approved}
              label={
                message ||
                (draft.operation.kind === "saved"
                  ? approved
                    ? "Godkjent"
                    : "Lagret"
                  : footerLabel)
              }
              nextPending={nextPending}
              dirty={dirty}
              receipt={receipt}
              busy={busy}
              saveDisabled={saveDisabled}
              onSave={() => void save()}
            />
          ) : undefined
        }
      >
        {!online && <Notice icon="wifi.slash">Uten nett</Notice>}
        {!!storageError && <Notice error>{storageError}</Notice>}
        {receipt.revision !== revision && (
          <Panel>
            <Notice tone="warning">Endret på en annen enhet</Notice>
            <Button
              title="Hent siste versjon"
              variant="secondary"
              onPress={() => {
                if (dirty)
                  Alert.alert(
                    "Hente siste versjon?",
                    "Dine ulagrede endringer blir fjernet.",
                    [
                      { text: "Avbryt", style: "cancel" },
                      { text: "Hent", onPress: () => reset(receipt) },
                    ],
                  );
                else reset(receipt);
              }}
            />
          </Panel>
        )}

        {receipt.provider.includes("mock") && <Notice>Demodata</Notice>}
        {!!receipt.error && <Notice tone="error">{receipt.error}</Notice>}
        {receipt.status === "failed" && !processing && (
          <Button
            title="Les bildene på nytt"
            icon="arrow.clockwise"
            disabled={!online || busy}
            onPress={retry}
          />
        )}
        {data && totals ? (
          <View
            pointerEvents={busy || processing ? "none" : "auto"}
            style={{ gap: 12 }}
          >
            <PurchaseTotals data={data} totals={totals} />
            {receipt.status !== "reviewed" && productLines.length > 0 && (
              <Segments
                value={allLines ? "all" : "review"}
                onChange={(value) => setAllLines(value === "all")}
                options={[
                  { value: "review", label: `Til kontroll (${remaining})` },
                  {
                    value: "all",
                    label: `Alle linjer (${productLines.length})`,
                  },
                ]}
              />
            )}
            {!allLines && confirmable > 1 && (
              <Pressable
                accessibilityRole="button"
                onPress={confirmAllCategories}
                style={(state) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    borderCurve: "continuous",
                    backgroundColor: colors.surface,
                    borderWidth: 1.5,
                    borderColor: colors.primary,
                  },
                  pressed(state),
                ]}
              >
                <Icon name="checkmark.circle" size={20} />
                <Copy weight="600" style={{ color: colors.primary, flex: 1 }}>
                  Bekreft alle {confirmable} foreslåtte kategorier
                </Copy>
              </Pressable>
            )}
            {!allLines && visibleLines.length === 0 && (
              <Panel style={{ alignItems: "center", paddingVertical: 24 }}>
                <Icon
                  name="checkmark.circle"
                  size={28}
                  color={colors.success}
                />
                <Copy weight="600">
                  {tasks.length ? "Varene er avklart" : "Klar til godkjenning"}
                </Copy>
              </Panel>
            )}
            {allLines && (
              <Copy accessibilityRole="header" size={19} weight="600">
                Varelinjer
              </Copy>
            )}
            <ReceiptLineList
              lines={visibleLines}
              renderLine={(line) => (
                <ReceiptLineEditor
                  key={`${generation}-${line.id}`}
                  line={line}
                  lines={data.lines}
                  receiptId={receipt._id}
                  retailer={data.store ?? ""}
                  recentCategories={recentCategories}
                  remember={remember.includes(line.id)}
                  productChoice={productChanges[line.id]}
                  priceSignal={signals.get(line.id)}
                  review={!allLines}
                  onChange={(next) => {
                    change({
                      ...data,
                      lines: data.lines.map((item) =>
                        item.id === line.id ? next : item,
                      ),
                    });

                    const categoryDecided =
                      next.kind === "product" &&
                      (next.categoryId !== line.categoryId ||
                        (line.issues.some(isCategoryUncertain) &&
                          !next.issues.some(isCategoryUncertain)));

                    if (categoryDecided) rememberLines([line.id]);
                  }}
                  onRemember={(value) => rememberLines([line.id], value)}
                  onProduct={(choice) => {
                    dispatch({ type: "product", lineId: line.id, choice });
                    setMessage("");
                  }}
                  onMoneyError={(value) => moneyError(line.id, value)}
                  onRemove={() => {
                    dispatch({ type: "remove-line", lineId: line.id });
                    setMessage("");
                  }}
                />
              )}
            />
            {Object.entries(moneyErrors).map(([field, value]) => (
              <Notice key={field} tone="error">
                {value}
              </Notice>
            ))}
            <Disclosure title="Om kvitteringen" value={receipt.uploaderName}>
              {receipt.catalogStatus === "pending" && (
                <Row title="Henter produktinformasjon …" icon="barcode" />
              )}
              {receipt.catalogStatus === "complete" && (
                <Row
                  title="Produktkatalog"
                  detail={`${data.lines.filter((line) => line.catalogProduct).length} av ${data.lines.filter((line) => line.kind === "product").length} varer koblet`}
                  icon="barcode"
                />
              )}
              {receipt.catalogStatus === "error" && (
                <Row
                  title="Prøv produktsøk igjen"
                  icon="barcode"
                  onPress={
                    !online || busy || dirty
                      ? undefined
                      : () =>
                          void run(async () => {
                            await releaseMutation(
                              client,
                              api.catalogMatching.enrich,
                              {
                                id: receipt._id,
                              },
                            );
                          })
                  }
                />
              )}
              {receipt.productAnalysis?.state === "error" && (
                <Row
                  title="Prøv mengdeberegning igjen"
                  icon="arrow.clockwise"
                  onPress={
                    !online || busy || dirty || processing
                      ? undefined
                      : () =>
                          void run(async () => {
                            await releaseMutation(
                              client,
                              api.productAnalysis.ensure,
                              { ids: [receipt._id] },
                            );
                            setMessage("Mengdene beregnes på nytt.");
                          })
                  }
                />
              )}
            </Disclosure>
            <ReceiptFields
              key={`fields-${generation}`}
              visible={sheet === "fields"}
              receiptId={receipt._id}
              onPhysicalStore={(store) => {
                dispatch({
                  type: "edit",
                  values: { physicalStoreId: store?.id ?? null },
                });
                change({
                  ...data,
                  physicalStore: store,
                  physicalStoreManual: true,
                });
              }}
              data={data}
              onChange={change}
              onMoneyError={(value) => moneyError("total", value)}
              onClose={() => setSheet(null)}
            />
          </View>
        ) : (
          <Panel style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
            {processing && <ActivityIndicator color={colors.accent} />}
            <Copy weight="600" size={18}>
              {processing ? "Kvitteringen leses" : "Ingen resultater ennå"}
            </Copy>
            {receipt.data && (
              <Button title="Vis resultatet" onPress={() => reset(receipt)} />
            )}
          </Panel>
        )}
        {(!data || processing) && !!error && (
          <Notice tone="error">{error}</Notice>
        )}
        {sheet === "actions" && (
          <Sheet
            title="Flere handlinger"
            visible
            onClose={() => setSheet(null)}
          >
            <Row
              title="Kvitteringsdetaljer"
              onPress={() => {
                setSheet("fields");
              }}
            />
            <Row
              title="Legg til linje"
              onPress={() => {
                setSheet(null);
                addLine();
              }}
            />
            <Toggle
              label="Vis MVA og oppsummering"
              value={summaryLines}
              onChange={(value) => {
                setSummaryLines(value);
                setAllLines(true);
              }}
            />
            <Toggle
              label="Utelat fra forbruk"
              value={excluded}
              onChange={(value) => {
                dispatch({ type: "edit", values: { excluded: value } });
                setMessage("");
              }}
            />
            <Button
              title="Les bildene på nytt"
              variant="secondary"
              disabled={processing || !online || busy || dirty}
              onPress={() => {
                setSheet(null);
                retry();
              }}
            />
            <Button
              title="Slett kvittering"
              variant="danger"
              disabled={!online || busy || receipt.status === "uploading"}
              onPress={removeReceipt}
            />
          </Sheet>
        )}
      </Screen>
    </>
  );
}

function ReceiptToolbar({ children }: { children: ReactNode }) {
  return Platform.OS === "ios" ? (
    <Stack.Toolbar placement="right">{children}</Stack.Toolbar>
  ) : null;
}
