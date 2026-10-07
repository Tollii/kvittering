import { isDecidedCategory } from "@/lib/domain/categories";
import { isReceiptProcessing } from "@/lib/domain/receipt-state";
import { releaseMutation } from "@/lib/releases/requests";
import { useRef, useState, type ComponentProps } from "react";
import { Alert, Platform, View } from "react-native";
import { Stack } from "expo-router";
import { useConvex } from "convex/react";

import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import {
  isDraftBusy,
  type ReceiptDraft,
  type ReceiptDraftAction,
} from "@/lib/receipt-draft";
import { Button, IconButton, Notice, Screen } from "@/components/ui";
import { ReceiptLineEditor } from "@/features/receipt-line-editor";
import { ReceiptCategorySpending } from "@/features/receipt-category-spending";
import { ReceiptFields } from "@/features/receipt-fields";
import {
  PurchaseTotals,
  ReceiptFooter,
  ReceiptLineList,
  ReceiptSummary,
  ReviewTaskChips,
} from "@/features/receipt-editor-sections";
import {
  ReceiptActionsSheet,
  ReceiptEditorToolbar,
  type ReceiptActionMenu,
} from "@/features/receipt-editor-actions";
import {
  ReceiptDetails,
  ReceiptLineControls,
  ReceiptPlaceholder,
  StaleRevisionNotice,
} from "@/features/receipt-editor-panels";
import {
  aliasKey,
  emptyLine,
  isTotalsLine,
  reconcile,
  type ReceiptData,
  type ReceiptLine,
} from "@/lib/domain/receipt";
import type { ProductChoice } from "@/lib/domain/product-reference";
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
import { failureMessage } from "@/lib/failure-message";

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

  const { approved, error } = operationOutcome(draft.operation);
  const [message, setMessage] = useState("");
  const operationActive = useRef(false);

  const [allLinesSelected, setAllLines] = useState(false);
  const allLines = receipt.status === "reviewed" || allLinesSelected;

  const [reviewLineIds, setReviewLineIds] = useState(() =>
    linesForReview(receipt),
  );

  const [summaryLines, setSummaryLines] = useState(false);
  const [sheet, setSheet] = useState<"fields" | "actions" | null>(null);

  const processing = isReceiptProcessing(receipt.status);

  const unresolvedDuplicate = !!receipt.duplicateOf && !duplicateResolved;

  const { totals, tasks, remaining, confirmable, ready, productLineCount } =
    lineReview(data, unresolvedDuplicate);

  const stale = receipt.revision !== revision;

  const saveDisabled =
    !online || processing || stale || !!Object.keys(moneyErrors).length;

  const requestBlocked = !online || busy || dirty;
  const retryDisabled = processing || requestBlocked;

  const signals = priceSignals(
    history.completeReceipts ? history.receipts : [],
    receipt,
  );

  const recentCategories = context?.recentCategories ?? [];

  const visibleLines =
    data?.lines.filter((line) =>
      isLineShown(line, { allLines, summaryLines, reviewLineIds }),
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

  function edit(
    values: Extract<ReceiptDraftAction, { type: "edit" }>["values"],
  ) {
    dispatch({ type: "edit", values });
    setMessage("");
  }

  function reset(current: Receipt) {
    dispatch({ type: "remote", receipt: current });
    dispatch({ type: "discard" });
    setReviewLineIds(linesForReview(current));
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
        error: failureMessage(cause, "receipt.edit", "Kunne ikke lagre."),
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
        rememberLineIds: rememberableLineIds(data, remember),
        selections: productSelections(productChanges),
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

  async function deleteReceipt() {
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
          onPress: () => void run(deleteReceipt, "deleting"),
        },
      ],
    );
  }

  const retry = () =>
    void run(async () => {
      await releaseMutation(client, api.receipts.retry, { id: receipt._id });
      setMessage("Leser på nytt …");
    });

  const retryCatalog = () =>
    void run(async () => {
      await releaseMutation(client, api.catalogMatching.enrich, {
        id: receipt._id,
      });
    });

  const retryAnalysis = () =>
    void run(async () => {
      await releaseMutation(client, api.productAnalysis.ensure, {
        ids: [receipt._id],
      });
      setMessage("Mengdene beregnes på nytt.");
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

  function changeLine(
    current: ReceiptData,
    line: ReceiptLine,
    next: ReceiptLine,
  ) {
    change({
      ...current,
      lines: current.lines.map((item) => (item.id === line.id ? next : item)),
    });

    if (isCategoryDecided(line, next)) rememberLines([line.id]);
  }

  const menu: ReceiptActionMenu = {
    busy,
    summaryLines,
    excluded,
    fieldsDisabled: !data || busy,
    addLineDisabled: !data || busy || processing,
    retryDisabled,
    deleteDisabled: !online || busy || receipt.status === "uploading",
    onEditFields: () => setSheet("fields"),
    onAddLine: addLine,
    onSummaryLines: (value) => {
      setSummaryLines(value);
      setAllLines(true);
    },
    onExcluded: (value) => edit({ excluded: value }),
    onRetry: retry,
    onDelete: removeReceipt,
  };

  return (
    <>
      <Stack.Screen
        options={screenOptions({
          title: data?.store || receipt.data?.store || "Kvittering",
          colors,
          onShowActions: () => setSheet("actions"),
        })}
      />
      <ReceiptEditorToolbar
        menu={menu}
        saveOffered={
          !!data &&
          !processing &&
          !approved &&
          (dirty || receipt.status !== "reviewed")
        }
        saveDisabled={saveDisabled}
        dirty={dirty}
        ready={ready}
        onSave={() => void save()}
      />
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
                onResolveDuplicate={() => edit({ duplicateResolved: true })}
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
              label={footerLabel({
                receipt,
                operation: draft.operation,
                message,
                processing,
                ready,
                dirty,
                taskCount: tasks.length,
              })}
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
        {!!storageError && <Notice tone="error">{storageError}</Notice>}
        {stale && (
          <StaleRevisionNotice dirty={dirty} onReload={() => reset(receipt)} />
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
            <PurchaseTotals
              data={data}
              totals={totals}
              difference={tasks.find((task) => task.kind === "difference")}
              onChange={change}
              onShowLines={(lines) => setAllLines(lines === "all")}
            />
            <ReceiptCategorySpending data={data} />
            <ReceiptLineControls
              allLines={allLines}
              showLineChoice={
                receipt.status !== "reviewed" && productLineCount > 0
              }
              remaining={remaining}
              productLineCount={productLineCount}
              confirmable={confirmable}
              reviewComplete={visibleLines.length === 0}
              hasTasks={tasks.length > 0}
              difference={totals.difference}
              onShowLines={(lines) => setAllLines(lines === "all")}
              onConfirmAll={confirmAllCategories}
            />
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
                  onChange={(next) => changeLine(data, line, next)}
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
            <ReceiptDetails
              receipt={receipt}
              data={data}
              onRetryCatalog={requestBlocked ? undefined : retryCatalog}
              onRetryAnalysis={retryDisabled ? undefined : retryAnalysis}
            />
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
          <ReceiptPlaceholder
            processing={processing}
            hasResult={!!receipt.data}
            onShowResult={() => reset(receipt)}
          />
        )}
        {(!data || processing) && !!error && (
          <Notice tone="error">{error}</Notice>
        )}
        {sheet === "actions" && (
          <ReceiptActionsSheet menu={menu} onClose={() => setSheet(null)} />
        )}
      </Screen>
    </>
  );
}

/** The lines that have review issues when the editor opens or reloads a receipt. */
function linesForReview(receipt: Receipt): Set<string> {
  return new Set(
    receipt.data?.lines
      .filter((line) => lineReviewIssues(line).length)
      .map((line) => line.id),
  );
}

/** The review state that the editor derives from the draft data. */
function lineReview(data: ReceiptData | null, unresolvedDuplicate: boolean) {
  if (!data)
    return {
      totals: null,
      tasks: [],
      remaining: 0,
      confirmable: 0,
      ready: false,
      productLineCount: 0,
    };

  return {
    totals: reconcile(data),
    tasks: reviewTasks(data, unresolvedDuplicate),
    remaining: data.lines.filter((line) => lineReviewIssues(line).length)
      .length,
    confirmable: data.lines.filter(canConfirmSuggestedCategory).length,
    ready: canAcceptReceipt(data, unresolvedDuplicate),
    productLineCount: data.lines.filter((line) => !isTotalsLine(line.kind))
      .length,
  };
}

/**
 * All-lines mode hides totals lines unless the person asks for them.
 * Review mode keeps the lines that needed review when the receipt loaded.
 * Both modes show every line with a review issue.
 */
function isLineShown(
  line: ReceiptLine,
  view: Readonly<{
    allLines: boolean;
    summaryLines: boolean;
    reviewLineIds: Set<string>;
  }>,
): boolean {
  const hasIssues = lineReviewIssues(line).length > 0;

  if (view.allLines)
    return view.summaryLines || !isTotalsLine(line.kind) || hasIssues;

  return view.reviewLineIds.has(line.id) || hasIssues;
}

/** The person chose a category, or resolved an uncertain suggestion. */
function isCategoryDecided(line: ReceiptLine, next: ReceiptLine): boolean {
  return (
    next.kind === "product" &&
    (next.categoryId !== line.categoryId ||
      (line.issues.some(isCategoryUncertain) &&
        !next.issues.some(isCategoryUncertain)))
  );
}

// The server needs a store and a name to build a memory key.
function rememberableLineIds(data: ReceiptData, remember: string[]) {
  return remember.filter((id) => {
    const line = data.lines.find((item) => item.id === id);

    return (
      line &&
      line.kind === "product" &&
      isDecidedCategory(line.categoryId) &&
      aliasKey(data, line) !== null
    );
  });
}

function productSelections(changes: Record<string, ProductChoice>) {
  return Object.entries(changes).map(([lineId, choice]) =>
    choice.kind === "catalog"
      ? { kind: "catalog" as const, lineId, key: choice.key }
      : { ...choice, lineId },
  );
}

/** The footer status. A message from the last action comes first. */
function footerLabel({
  receipt,
  operation,
  message,
  processing,
  ready,
  dirty,
  taskCount,
}: Readonly<{
  receipt: Receipt;
  operation: ReceiptDraft["operation"];
  message: string;
  processing: boolean;
  ready: boolean;
  dirty: boolean;
  taskCount: number;
}>): string {
  if (message) return message;

  if (operation.kind === "saved")
    return operation.approved ? "Godkjent" : "Lagret";

  if (processing) return receiptStatusLabel(receipt);

  if (ready)
    return !dirty && receipt.status === "reviewed"
      ? receiptStatusLabel(receipt)
      : "Klar til godkjenning";

  return taskCount === 1 ? "Én ting igjen" : `${taskCount} ting igjen`;
}

/** Whether the last save approved the receipt, and the last request failure. */
function operationOutcome(operation: ReceiptDraft["operation"]) {
  return {
    approved: operation.kind === "saved" && operation.approved,
    error: operation.kind === "failed" ? operation.error : "",
  };
}

/** The navigation bar. Platforms without the iOS toolbar get an actions button. */
function screenOptions({
  title,
  colors,
  onShowActions,
}: Readonly<{
  title: string;
  colors: ReturnType<typeof useTheme>;
  onShowActions: () => void;
}>): ComponentProps<typeof Stack.Screen>["options"] {
  const options: ComponentProps<typeof Stack.Screen>["options"] = {
    title,
    headerStyle: { backgroundColor: colors.hero },
    headerTintColor: colors.onHero,
    headerTitleStyle: { color: colors.onHero, fontWeight: "600" },
  };

  if (Platform.OS !== "ios")
    options.headerRight = () => (
      <IconButton
        name="ellipsis"
        label="Flere handlinger"
        onPress={onShowActions}
      />
    );

  return options;
}
