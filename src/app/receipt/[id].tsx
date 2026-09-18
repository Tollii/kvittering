import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  View,
} from "react-native";
import {
  router,
  Stack,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { useConvex, useQuery } from "convex/react";
import { randomUUID } from "expo-crypto";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  Button,
  Chip,
  Copy,
  Disclosure,
  Icon,
  IconButton,
  Loading,
  Notice,
  Panel,
  Row,
  Screen,
  Segments,
  Sheet,
  Toggle,
  pressed,
} from "@/components/ui";
import { Mosaic } from "@/components/mosaic";
import {
  ReceiptLineEditor,
  type ProductChoice,
} from "@/features/receipt-line-editor";
import { ReceiptFields } from "@/features/receipt-fields";
import { ReceiptImages } from "@/features/receipt-images";
import {
  aliasKey,
  formatMoney,
  emptyLine,
  reconcile,
  type ReceiptData,
} from "@/lib/domain/receipt";
import {
  balanceWithAdjustment,
  canAcceptReceipt,
  canConfirmSuggestedCategory,
  categoryUncertainIssue,
  confirmSuggestedCategories,
  lineReviewIssues,
  reviewTasks,
  type ReviewTask,
} from "@/lib/domain/receipt-review";
import { useHousehold } from "@/features/session";
import type { Receipt } from "@/lib/domain/insights";
import { receiptStatusLabel } from "@/components/receipt-card";
import { formatDate } from "@/lib/format-date";
import { useTheme } from "@/constants/theme";
import { errorFeedback, successFeedback, tapFeedback } from "@/lib/haptics";

export default function ReceiptPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReceiptDetail key={id} id={id} />;
}
function ReceiptDetail({ id }: { id: string }) {
  const { online } = useHousehold();
  const detail = useQuery(api.receipts.detail, { id: id ?? "" });
  const [deletion, setDeletion] = useState<"idle" | "deleting" | "deleted">(
    "idle",
  );
  useEffect(() => {
    // The editor has unmounted, so its unsaved-change guard cannot block leaving.
    if (deletion === "deleted") {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/history");
    }
  }, [deletion]);
  if (deletion === "deleted" || (deletion === "deleting" && detail === null))
    return (
      <Screen insetTop={false}>
        <Loading title="Sletter kvittering …" />
      </Screen>
    );
  if (detail === undefined)
    return (
      <Screen insetTop={false}>
        <Loading title="Henter kvittering …" />
      </Screen>
    );
  if (detail === null)
    return (
      <Screen insetTop={false}>
        <Stack.Screen
          options={{ title: "Kvittering", headerRight: () => null }}
        />
        <View style={{ paddingVertical: 48, gap: 16, alignItems: "center" }}>
          <Icon name="doc.questionmark" size={44} />
          <Copy
            accessibilityRole="header"
            size={22}
            weight="600"
            style={{ textAlign: "center" }}
          >
            Kvitteringen er ikke tilgjengelig
          </Copy>
          <Copy muted style={{ textAlign: "center", maxWidth: 340 }}>
            Den kan være slettet.
          </Copy>
          <Button
            title="Til kvitteringene"
            onPress={() => router.dismissTo("/(tabs)/history")}
          />
        </View>
      </Screen>
    );
  return (
    <ReceiptEditor
      key={id}
      receipt={detail.receipt}
      readings={detail.extractions}
      online={online}
      onDeletionChange={setDeletion}
    />
  );
}
function ReceiptEditor({
  receipt,
  readings,
  online,
  onDeletionChange,
}: {
  receipt: Receipt;
  readings: Doc<"extractions">[];
  online: boolean;
  onDeletionChange: (state: "idle" | "deleting" | "deleted") => void;
}) {
  const client = useConvex();
  const colors = useTheme();
  const { receipts } = useHousehold();
  const [data, setData] = useState<ReceiptData | null>(receipt.data);
  const [loadedData, setLoadedData] = useState(receipt.data);
  const [revision, setRevision] = useState(receipt.revision);
  const [duplicateResolved, setDuplicateResolved] = useState(
    receipt.duplicateResolved,
  );
  const [excluded, setExcluded] = useState(receipt.excluded);
  const [remember, setRemember] = useState<string[]>([]);
  const [productChanges, setProductChanges] = useState<
    Record<string, ProductChoice>
  >({});
  const [physicalStoreId, setPhysicalStoreId] = useState<
    number | null | undefined
  >(undefined);
  const [moneyErrors, setMoneyErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const operationActive = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [approved, setApproved] = useState(false);
  const [allLines, setAllLines] = useState(receipt.status === "reviewed");
  const [reviewLineIds, setReviewLineIds] = useState(
    () =>
      new Set(
        receipt.data?.lines
          .filter((line) => lineReviewIssues(line).length)
          .map((line) => line.id),
      ),
  );
  const [summaryLines, setSummaryLines] = useState(false);
  const [fields, setFields] = useState(false);
  const [actions, setActions] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);
  const navigation = useNavigation();
  usePreventRemove(dirty && !busy, ({ data: action }) => {
    Alert.alert("Forkaste endringene?", "Endringene er ikke lagret.", [
      { text: "Fortsett å redigere", style: "cancel" },
      {
        text: "Forkast",
        style: "destructive",
        onPress: () => navigation.dispatch(action.action),
      },
    ]);
  });
  const processing = ["processing", "uploaded", "uploading"].includes(
    receipt.status,
  );
  const catalogRequested = useRef(false);
  useEffect(() => {
    if (
      !online ||
      dirty ||
      processing ||
      !receipt.data ||
      receipt.catalogStatus ||
      catalogRequested.current
    )
      return;
    catalogRequested.current = true;
    void client
      .mutation(api.catalogMatching.enrich, {
        id: receipt._id,
        onlyIfMissing: true,
      })
      .catch(() => setError("Produktsøket startet ikke."));
  }, [
    client,
    dirty,
    online,
    processing,
    receipt._id,
    receipt.catalogStatus,
    receipt.data,
  ]);
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
  const recentCategories = receipts.flatMap(
    (item) =>
      item.data?.lines.flatMap((line) =>
        line.categoryId ? [line.categoryId] : [],
      ) ?? [],
  );
  const productLines =
    data?.lines.filter((line) => !["summary", "vat"].includes(line.kind)) ?? [];
  const visibleLines =
    data?.lines.filter((line) =>
      allLines
        ? summaryLines ||
          !["summary", "vat"].includes(line.kind) ||
          lineReviewIssues(line).length
        : reviewLineIds.has(line.id) || lineReviewIssues(line).length,
    ) ?? [];
  const nextPending = receipts.find(
    (item) =>
      item._id !== receipt._id &&
      ["needs_review", "failed"].includes(item.status) &&
      !item.excluded,
  );

  function change(next: ReceiptData) {
    if (data && (next.store !== data.store || next.branch !== data.branch)) {
      next = { ...next, physicalStore: null, physicalStoreManual: false };
      setPhysicalStoreId(undefined);
    }
    setData(next);
    setDirty(true);
    setMessage("");
    setApproved(false);
  }
  /** A person's category decision is worth keeping for the next receipt with the same item. */
  function rememberLines(ids: string[], value = true) {
    setRemember((previous) =>
      value
        ? [...new Set([...previous, ...ids])]
        : previous.filter((id) => !ids.includes(id)),
    );
    setDirty(true);
  }
  function reset(current: Receipt) {
    setData(current.data);
    setLoadedData(current.data);
    setRevision(current.revision);
    setDuplicateResolved(current.duplicateResolved);
    setExcluded(current.excluded);
    setRemember([]);
    setProductChanges({});
    setPhysicalStoreId(undefined);
    setMoneyErrors({});
    setDirty(false);
    setReviewLineIds(
      new Set(
        current.data?.lines
          .filter((line) => lineReviewIssues(line).length)
          .map((line) => line.id),
      ),
    );
    setAllLines(current.status === "reviewed");
    setGeneration((value) => value + 1);
  }
  if (
    !dirty &&
    !busy &&
    (revision !== receipt.revision || loadedData !== receipt.data)
  )
    reset(receipt);
  const moneyError = (key: string, value: string | null) =>
    setMoneyErrors((previous) => {
      const next = { ...previous };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  async function run(action: () => Promise<void>) {
    if (operationActive.current) return;
    operationActive.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      errorFeedback();
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre.");
    } finally {
      operationActive.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!data || saveDisabled) return;
    await run(async () => {
      await client.mutation(api.receipts.save, {
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
            !!line.categoryId &&
            line.categoryId !== "fallback.unclear" &&
            aliasKey(data, line) !== null
          );
        }),
        productChanges: Object.entries(productChanges)
          .filter(([, choice]) => choice.kind !== "catalog")
          .map(([lineId, choice]) => ({
            lineId,
            productId: choice.kind === "existing" ? choice.id : null,
            createNew: choice.kind === "new",
          })),
        catalogChanges: Object.entries(productChanges).flatMap<{
          lineId: string;
          key: string | null;
        }>(([lineId, choice]) =>
          choice.kind === "catalog"
            ? [{ lineId, key: choice.product.key }]
            : choice.kind === "separate"
              ? [{ lineId, key: null }]
              : [],
        ),
        physicalStoreId,
        duplicateResolved,
        excluded,
      });
      const result = await client.query(api.receipts.detail, {
        id: receipt._id,
      });
      if (!result) return;
      reset(result.receipt);
      setApproved(ready);
      if (ready) successFeedback();
      setMessage(ready ? "Godkjent" : "Lagret");
    });
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
                await client.mutation(api.receipts.remove, {
                  id: receipt._id,
                  revision,
                });
                onDeletionChange("deleted");
              } catch (cause) {
                onDeletionChange("idle");
                throw cause;
              }
            }),
        },
      ],
    );
  }
  const retry = () =>
    void run(async () => {
      await client.mutation(api.receipts.retry, { id: receipt._id });
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
  /** One compact chip per open question. Tapping it jumps straight to the fix. */
  function taskChip(task: ReviewTask) {
    const chip = (
      label: string,
      icon: Parameters<typeof Chip>[0]["icon"],
      onPress: () => void,
    ) => (
      <Chip
        key={task.kind}
        label={label}
        icon={icon}
        tone="warning"
        trailing="none"
        onPress={onPress}
      />
    );
    const toLines = () => setAllLines(false);
    switch (task.kind) {
      case "duplicate":
        return chip("Mulig duplikat", "doc.on.doc", () =>
          Alert.alert(
            "Mulig duplikat",
            "Samme bilde eller kjøp finnes fra før.",
            [
              { text: "Avbryt", style: "cancel" },
              {
                text: "Dette er et eget kjøp",
                onPress: () => {
                  setDuplicateResolved(true);
                  setDirty(true);
                },
              },
            ],
          ),
        );
      case "store":
        return chip("Butikk mangler", "storefront", () => setFields(true));
      case "total":
        return chip("Betalt beløp mangler", "banknote", () => setFields(true));
      case "date":
        return chip("Dato mangler", "calendar", () => setFields(true));
      case "currency":
        return chip(
          `Valuta: ${data?.currency ?? "ukjent"}`,
          "coloncurrencysign.circle",
          () => setFields(true),
        );
      case "no-lines":
        return chip("Ingen varer lest", "plus", addLine);
      case "difference":
        return chip(
          `Avvik ${formatMoney(task.amountOre)}`,
          "equal.circle",
          () =>
            Alert.alert(
              `Avvik ${formatMoney(task.amountOre)}`,
              `Linjene gir ${formatMoney(totals?.calculated ?? null)}. Kvitteringen sier ${formatMoney(data?.totalOre ?? null)}.`,
              [
                { text: "Avbryt", style: "cancel" },
                { text: "Se alle linjer", onPress: () => setAllLines(true) },
                {
                  text: "Legg inn justering",
                  onPress: () => {
                    if (data) change(balanceWithAdjustment(data, randomUUID()));
                    setAllLines(true);
                  },
                },
              ],
            ),
        );
      case "receipt-issues":
        return chip(
          task.issues.length === 1
            ? "1 merknad"
            : `${task.issues.length} merknader`,
          "exclamationmark.bubble",
          () =>
            Alert.alert(
              "Merknader fra lesingen",
              task.issues.join("\n"),
              data?.issues.length
                ? [
                    { text: "Avbryt", style: "cancel" },
                    {
                      text: "Dette stemmer",
                      onPress: () => data && change({ ...data, issues: [] }),
                    },
                  ]
                : [{ text: "OK" }],
            ),
        );
      case "categories":
        return chip(
          `${task.count} ${task.count === 1 ? "kategori" : "kategorier"}`,
          "tag",
          toLines,
        );
      case "amounts":
        return chip(`${task.count} beløp mangler`, "numbers", toLines);
      case "names":
        return chip(`${task.count} navn mangler`, "textformat", toLines);
      case "line-issues":
        return chip(
          `${task.count} ${task.count === 1 ? "vare" : "varer"} å sjekke`,
          "exclamationmark.circle",
          toLines,
        );
    }
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
  return (
    <>
      <Stack.Screen
        options={{
          title: data?.store || receipt.data?.store || "Kvittering",
          ...(Platform.OS !== "ios"
            ? {
                headerRight: () => (
                  <IconButton
                    name="ellipsis"
                    label="Flere handlinger"
                    onPress={() => setActions(true)}
                  />
                ),
              }
            : {}),
        }}
      />
      {Platform.OS === "ios" && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="ellipsis" title="Flere handlinger">
            <Stack.Toolbar.MenuAction
              icon="pencil"
              disabled={!data || busy}
              onPress={() => setFields(true)}
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
                setExcluded(!excluded);
                setDirty(true);
              }}
            >
              Utelat fra forbruk
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="barcode.viewfinder"
              disabled={
                processing ||
                !online ||
                busy ||
                dirty ||
                receipt.catalogStatus === "pending"
              }
              onPress={() =>
                void run(async () => {
                  await client.mutation(api.catalogMatching.enrich, {
                    id: receipt._id,
                  });
                  setMessage("Søker etter produkter …");
                })
              }
            >
              Finn produkter på nytt
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
        </Stack.Toolbar>
      )}
      <Screen
        insetTop={false}
        footer={
          data && !processing ? (
            <>
              {!!error && (
                <Copy
                  size={13}
                  style={{ color: colors.danger }}
                  accessibilityRole="alert"
                >
                  {error}
                </Copy>
              )}
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Icon
                  name={
                    ready || approved
                      ? "checkmark.circle.fill"
                      : "circle.dotted"
                  }
                  size={17}
                  color={ready || approved ? colors.success : colors.primary}
                />
                <Copy
                  size={13}
                  weight="500"
                  muted
                  style={{ flex: 1 }}
                  accessibilityLiveRegion="polite"
                >
                  {message || footerLabel}
                </Copy>
              </View>
              {approved ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Til innboksen"
                      secondary
                      onPress={() => router.dismissTo("/(tabs)/inbox")}
                    />
                  </View>
                  {nextPending && (
                    <View style={{ flex: 1.4 }}>
                      <Button
                        title="Neste til kontroll"
                        icon="arrow.right"
                        onPress={() =>
                          router.replace({
                            pathname: "/receipt/[id]",
                            params: { id: nextPending._id },
                          })
                        }
                      />
                    </View>
                  )}
                </View>
              ) : (
                (dirty || receipt.status !== "reviewed") && (
                  <Button
                    title={
                      !ready && dirty
                        ? "Lagre for senere"
                        : dirty
                          ? "Lagre og godkjenn"
                          : "Godkjenn kvittering"
                    }
                    icon={ready ? "checkmark" : undefined}
                    busy={busy}
                    disabled={saveDisabled || (!dirty && !ready)}
                    onPress={() => void save()}
                  />
                )
              )}
            </>
          ) : undefined
        }
      >
        {!online && <Notice icon="wifi.slash">Uten nett</Notice>}
        {receipt.revision !== revision && (
          <Panel>
            <Notice tone="warning">Endret på en annen enhet</Notice>
            <Button
              title="Hent siste versjon"
              secondary
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
        <Panel tone="primary" style={{ padding: 0, gap: 0 }}>
          <Mosaic
            seed={receipt._creationTime % 9973}
            height={6}
            block={5}
            columns={80}
            fade={false}
          />
          <View style={{ padding: 16, gap: 10 }}>
            <View
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Copy
                  size={13}
                  weight="600"
                  style={{ color: colors.onHero, opacity: 0.8 }}
                >
                  {formatDate(data?.purchaseDate)}
                  {data?.purchaseDate && data.purchaseTime
                    ? ` kl. ${data.purchaseTime}`
                    : ""}
                  {data?.branch ? ` · ${data.branch}` : ""}
                </Copy>
                <Copy size={40} weight="800" style={{ color: colors.onHero }}>
                  {formatMoney(data?.totalOre ?? null)}
                </Copy>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <ReceiptImages
                  receipt={receipt}
                  compact
                  color={colors.onHero}
                  background="#FFFFFF22"
                />
                <IconButton
                  name="pencil"
                  label="Rediger kvitteringsdetaljer"
                  filled="#FFFFFF22"
                  size={17}
                  color={colors.onHero}
                  disabled={!data || busy}
                  onPress={() => setFields(true)}
                />
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <Chip
                label={receiptStatusLabel(receipt)}
                tone={receipt.status === "reviewed" ? "success" : "muted"}
                icon={
                  receipt.status === "reviewed"
                    ? "checkmark.seal"
                    : processing
                      ? "hourglass"
                      : receipt.status === "failed"
                        ? "exclamationmark.triangle"
                        : "doc.text.magnifyingglass"
                }
              />
              {excluded && <Chip label="Utelatt" icon="eye.slash" />}
              {!approved && tasks.map(taskChip)}
            </View>
          </View>
        </Panel>
        {receipt.provider.includes("mock") && <Notice>Demodata</Notice>}
        {!!receipt.error && <Notice error>{receipt.error}</Notice>}
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
            {productLines.length > 0 && (
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
            {visibleLines.length > 0 && (
              <Panel
                style={{ gap: 0, paddingVertical: 2, paddingHorizontal: 14 }}
              >
                {visibleLines.map((line) => (
                  <ReceiptLineEditor
                    key={`${generation}-${line.id}`}
                    line={line}
                    lines={data.lines}
                    receiptId={receipt._id}
                    retailer={data.store ?? ""}
                    recentCategories={recentCategories}
                    remember={remember.includes(line.id)}
                    productChoice={productChanges[line.id]}
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
                          (line.issues.includes(categoryUncertainIssue) &&
                            !next.issues.includes(categoryUncertainIssue)));
                      if (categoryDecided) rememberLines([line.id]);
                    }}
                    onRemember={(value) => rememberLines([line.id], value)}
                    onProduct={(choice) => {
                      setProductChanges((previous) => ({
                        ...previous,
                        [line.id]: choice,
                      }));
                      setDirty(true);
                    }}
                    onMoneyError={(value) => moneyError(line.id, value)}
                    onRemove={() => {
                      change({
                        ...data,
                        lines: data.lines.filter((item) => item.id !== line.id),
                      });
                      moneyError(line.id, null);
                      setRemember((previous) =>
                        previous.filter((id) => id !== line.id),
                      );
                      setProductChanges((previous) => {
                        const next = { ...previous };
                        delete next[line.id];
                        return next;
                      });
                    }}
                  />
                ))}
              </Panel>
            )}
            {Object.values(moneyErrors).map((value, index) => (
              <Notice key={index} error>
                {value}
              </Notice>
            ))}
            <Disclosure
              title={
                totals.difference === 0
                  ? "Beløpene stemmer"
                  : totals.difference === null
                    ? "Betalt beløp mangler"
                    : `Avvik ${formatMoney(totals.difference)}`
              }
              value={`${data.lines.filter((line) => line.kind === "product").length} varer`}
            >
              {[
                { label: "Varer før rabatt", amount: totals.products },
                { label: "Rabatter", amount: totals.discounts },
                {
                  label: "Pant og pantretur",
                  amount: totals.deposits + totals.returns,
                },
                { label: "Andre justeringer", amount: totals.adjustments },
                { label: "Sum av linjene", amount: totals.calculated },
                { label: "Betalt", amount: data.totalOre },
              ]
                .filter(
                  (row) =>
                    row.amount !== 0 ||
                    ["Sum av linjene", "Betalt"].includes(row.label),
                )
                .map((row) => (
                  <View
                    key={row.label}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: 16,
                      paddingVertical: 3,
                    }}
                  >
                    <Copy size={14} muted>
                      {row.label}
                    </Copy>
                    <Copy
                      size={14}
                      weight={row.label === "Betalt" ? "700" : "500"}
                    >
                      {formatMoney(row.amount)}
                    </Copy>
                  </View>
                ))}
            </Disclosure>
            <Disclosure title="Om lesingen" value={receipt.uploaderName}>
              <Row title="Lest med" detail={receipt.provider} icon="sparkles" />
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
                            await client.mutation(api.catalogMatching.enrich, {
                              id: receipt._id,
                            });
                          })
                  }
                />
              )}
            </Disclosure>
            <ReceiptFields
              key={`fields-${generation}`}
              visible={fields}
              receiptId={receipt._id}
              onPhysicalStore={(store) => {
                setPhysicalStoreId(store?.id ?? null);
                change({
                  ...data,
                  physicalStore: store,
                  physicalStoreManual: true,
                });
              }}
              data={data}
              onChange={change}
              onMoneyError={(value) => moneyError("total", value)}
              onClose={() => setFields(false)}
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
        {(!data || processing) && !!error && <Notice error>{error}</Notice>}
        {actions && (
          <Sheet
            title="Flere handlinger"
            visible
            onClose={() => setActions(false)}
          >
            <Row
              title="Kvitteringsdetaljer"
              onPress={() => {
                setActions(false);
                setFields(true);
              }}
            />
            <Row
              title="Legg til linje"
              onPress={() => {
                setActions(false);
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
                setExcluded(value);
                setDirty(true);
              }}
            />
            <Button
              title="Les bildene på nytt"
              secondary
              disabled={processing || !online || busy || dirty}
              onPress={() => {
                setActions(false);
                retry();
              }}
            />
            <Button
              title="Slett kvittering"
              danger
              disabled={!online || busy || receipt.status === "uploading"}
              onPress={removeReceipt}
            />
          </Sheet>
        )}
      </Screen>
    </>
  );
}
