import { useProcessingEngine } from "@/lib/processing-preferences";
import { processingEngineName } from "@/lib/domain/processing-engine";
import { rereadWithFoundation } from "@/lib/foundation-reprocessing";
import { ReceiptReadingHistory } from "@/features/receipt-reading-history";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, Platform, View } from "react-native";
import {
  router,
  Stack,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { useConvex, useQuery } from "convex/react";
import { randomUUID } from "expo-crypto";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Button,
  Copy,
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
} from "@/components/ui";
import {
  ReceiptLineEditor,
  type ProductChoice,
} from "@/features/receipt-line-editor";
import { ReceiptFields } from "@/features/receipt-fields";
import { ReceiptImages } from "@/features/receipt-images";
import {
  formatMoney,
  emptyLine,
  reconcile,
  type ReceiptData,
} from "@/lib/domain/receipt";
import {
  canAcceptReceipt,
  lineReviewIssues,
  receiptReviewIssues,
} from "@/lib/domain/receipt-review";
import { useHousehold } from "@/features/session";
import type { Receipt } from "@/lib/domain/insights";
import { receiptStatusLabel } from "@/components/receipt-card";
import { formatDate } from "@/lib/format-date";
import { useTheme } from "@/constants/theme";

export default function ReceiptPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { online } = useHousehold();
  const detail = useQuery(api.receipts.detail, { id: id as Id<"receipts"> });
  if (!detail)
    return (
      <Screen insetTop={false}>
        <Loading title="Henter kvittering …" />
      </Screen>
    );
  return (
    <ReceiptEditor
      key={id}
      receipt={detail.receipt}
      readings={detail.extractions}
      online={online}
    />
  );
}
function ReceiptEditor({
  receipt,
  readings,
  online,
}: {
  receipt: Receipt;
  readings: Doc<"extractions">[];
  online: boolean;
}) {
  const engine = useProcessingEngine();
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
      .catch(() =>
        setError(
          "Kunne ikke starte produktsøk. Kvitteringen kan brukes som vanlig.",
        ),
      );
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
  const issues = data ? receiptReviewIssues(data) : [];
  const remaining =
    data?.lines.filter((line) => lineReviewIssues(line).length).length ?? 0;
  const ready =
    !!data &&
    canAcceptReceipt(data, !!receipt.duplicateOf && !duplicateResolved);
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
  const visibleLines =
    data?.lines.filter((line) =>
      allLines
        ? summaryLines ||
          !["summary", "vat"].includes(line.kind) ||
          lineReviewIssues(line).length
        : reviewLineIds.has(line.id) || lineReviewIssues(line).length,
    ) ?? [];

  function change(next: ReceiptData) {
    if (data && (next.store !== data.store || next.branch !== data.branch)) {
      next = { ...next, physicalStore: null, physicalStoreManual: false };
      setPhysicalStoreId(undefined);
    }
    setData(next);
    setDirty(true);
    setMessage("");
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
        rememberLineIds: remember,
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
      reset(result.receipt);
      setMessage(
        ready
          ? "Kvitteringen er kontrollert."
          : "Lagret. Du kan fortsette kontrollen senere.",
      );
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
              await client.mutation(api.receipts.remove, {
                id: receipt._id,
                revision,
              });
              router.back();
            }),
        },
      ],
    );
  }
  const retry = () =>
    void run(async () => {
      if (engine === "foundation") {
        const result = await rereadWithFoundation(receipt);
        await client.mutation(api.receipts.reprocessFoundation, {
          id: receipt._id,
          revision: receipt.revision,
          generation: receipt.generation,
          result,
        });
      } else
        await client.mutation(api.receipts.retry, {
          id: receipt._id,
          processingEngine: "gpt",
        });
      setMessage("Kvitteringen behandles på nytt.");
    });
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
              icon="arrow.clockwise"
              disabled={processing || !online || busy || dirty}
              onPress={retry}
            >
              Les bildene på nytt ({processingEngineName(engine)})
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
              {!!message && (
                <Copy
                  size={13}
                  style={{ color: colors.primary }}
                  accessibilityLiveRegion="polite"
                >
                  {message}
                </Copy>
              )}
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Icon
                  name={ready ? "checkmark.circle" : "exclamationmark.circle"}
                  size={17}
                  color={ready ? colors.primary : colors.warning}
                />
                <Copy size={13} muted style={{ flex: 1 }}>
                  {remaining
                    ? `${remaining} ${remaining === 1 ? "vare" : "varer"} må kontrolleres`
                    : !ready
                      ? "Kontroller kvitteringsdetaljene"
                      : dirty
                        ? "Endringene er klare til lagring"
                        : receiptStatusLabel(receipt)}
                </Copy>
              </View>
              {(dirty || receipt.status !== "reviewed") && (
                <Button
                  title={
                    !ready && dirty
                      ? "Lagre for senere"
                      : dirty
                        ? "Lagre og godkjenn"
                        : "Godkjenn kvittering"
                  }
                  busy={busy}
                  disabled={saveDisabled || (!dirty && !ready)}
                  onPress={() => void save()}
                />
              )}
            </>
          ) : undefined
        }
      >
        {!online && (
          <Notice>Uten nett. Koble til nettet før du lagrer endringer.</Notice>
        )}
        {receipt.revision !== revision && (
          <Panel>
            <Notice>
              Kvitteringen har nye endringer. Hent siste versjon før du lagrer.
            </Notice>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Copy size={28} weight="700">
              {formatMoney(data?.totalOre ?? null)}
            </Copy>
            <Copy size={13} muted>
              {formatDate(data?.purchaseDate)}
              {data?.branch ? ` · ${data.branch}` : ""}
            </Copy>
          </View>
          <ReceiptImages receipt={receipt} compact />
          <IconButton
            name="pencil"
            label="Rediger kvitteringsdetaljer"
            disabled={!data || busy}
            onPress={() => setFields(true)}
          />
        </View>
        <Copy size={12} muted>
          Seneste lesing: {receipt.provider}
        </Copy>
        {readings.length > 0 && <ReceiptReadingHistory readings={readings} />}
        {busy && engine === "foundation" && (
          <Notice>Leser med Foundation Models. Hold appen åpen …</Notice>
        )}
        {excluded && <Notice>Utelatt fra forbruk.</Notice>}
        {data && !processing && receipt.catalogStatus === "pending" && (
          <Copy size={13} muted>
            Henter produktinformasjon automatisk …
          </Copy>
        )}
        {data && !processing && receipt.catalogStatus === "error" && (
          <Row
            title="Prøv produktsøk igjen"
            detail="Produktinformasjonen kunne ikke hentes. Kvitteringen kan brukes som vanlig."
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
        {receipt.provider.includes("mock") && (
          <Notice>Demodata. Bildet er ikke lest av en modell.</Notice>
        )}
        {!!receipt.error && <Notice error>{receipt.error}</Notice>}
        {!!receipt.duplicateOf && !duplicateResolved && (
          <Panel>
            <Copy weight="600">Mulig duplikat</Copy>
            <Copy muted size={13}>
              Samme bilde eller kjøpsdetaljer finnes fra før.
            </Copy>
            <Button
              title="Dette er et eget kjøp"
              secondary
              disabled={busy}
              onPress={() => {
                setDuplicateResolved(true);
                setDirty(true);
              }}
            />
          </Panel>
        )}
        {data && totals ? (
          <View
            pointerEvents={busy || processing ? "none" : "auto"}
            style={{ gap: 10 }}
          >
            {issues.length > 0 && (
              <Panel>
                <Notice>{issues.join("\n")}</Notice>
                <Row
                  title="Kontroller kvitteringsdetaljer"
                  onPress={() => setFields(true)}
                />
                {data.issues.length > 0 && (
                  <Button
                    title="Bekreft opplysningene"
                    secondary
                    onPress={() => change({ ...data, issues: [] })}
                  />
                )}
              </Panel>
            )}
            <Segments
              value={allLines ? "all" : "review"}
              onChange={(value) => setAllLines(value === "all")}
              options={[
                { value: "review", label: `Til kontroll (${remaining})` },
                {
                  value: "all",
                  label: `Alle (${data.lines.filter((line) => !["summary", "vat"].includes(line.kind)).length})`,
                },
              ]}
            />
            {!allLines && visibleLines.length === 0 && (
              <Panel>
                <Copy weight="600">Ingen varer trenger kontroll</Copy>
                <Copy size={13} muted>
                  Du kan se alle linjene eller godkjenne kvitteringen.
                </Copy>
              </Panel>
            )}
            {visibleLines.length > 0 && (
              <Panel
                style={{ gap: 0, paddingVertical: 0, paddingHorizontal: 14 }}
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
                    onChange={(next) =>
                      change({
                        ...data,
                        lines: data.lines.map((item) =>
                          item.id === line.id ? next : item,
                        ),
                      })
                    }
                    onRemember={(value) => {
                      setRemember((previous) =>
                        value
                          ? [...new Set([...previous, line.id])]
                          : previous.filter((id) => id !== line.id),
                      );
                      setDirty(true);
                    }}
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
            <Panel style={{ gap: 8 }}>
              <Row
                title={
                  totals.difference === 0
                    ? "Beløpene stemmer"
                    : `Avvik: ${formatMoney(totals.difference)}`
                }
                detail={`${data.lines.filter((line) => line.kind === "product").length} varer · ${receipt.uploaderName}`}
              />
              {[
                { label: "Varer før rabatt", amount: totals.products },
                { label: "Rabatter", amount: totals.discounts },
                {
                  label: "Pant og pantretur",
                  amount: totals.deposits + totals.returns,
                },
                { label: "Andre justeringer", amount: totals.adjustments },
                { label: "Beregnet", amount: totals.calculated },
                { label: "Betalt", amount: data.totalOre },
              ].map((row) => (
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
            </Panel>
            {Object.values(moneyErrors).map((value, index) => (
              <Notice key={index} error>
                {value}
              </Notice>
            ))}
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
          <Panel>
            <Copy weight="600">
              {processing ? "Kvitteringen behandles" : "Ingen resultater ennå"}
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
