import { usePreventRemove } from "expo-router/react-navigation";
import { useState } from "react";
import { Alert, Platform } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useConvex, useQuery } from "convex/react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { randomUUID } from "expo-crypto";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Button,
  Copy,
  Field,
  Loading,
  Notice,
  Panel,
  Row,
  Screen,
  Toggle,
} from "@/components/ui";
import { MoneyField } from "@/components/money-field";
import {
  ReceiptLineEditor,
  type ProductChoice,
} from "@/features/receipt-line-editor";
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
import { statusLabels } from "@/components/receipt-card";

export default function ReceiptPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { online } = useHousehold();
  const detail = useQuery(api.receipts.detail, { id: id as Id<"receipts"> });
  if (!detail)
    return (
      <Screen>
        <Loading title="Henter kvittering …" />
      </Screen>
    );
  return <ReceiptEditor key={id} receipt={detail.receipt} online={online} />;
}
function ReceiptEditor({
  receipt,
  online,
}: {
  receipt: Receipt;
  online: boolean;
}) {
  const client = useConvex();
  const [data, setData] = useState<ReceiptData | null>(receipt.data);
  const [revision, setRevision] = useState(receipt.revision);
  const [duplicateResolved, setDuplicateResolved] = useState(
    receipt.duplicateResolved,
  );
  const [excluded, setExcluded] = useState(receipt.excluded);
  const [remember, setRemember] = useState<string[]>([]);
  const [productChanges, setProductChanges] = useState<
    Record<string, ProductChoice>
  >({});
  const [moneyErrors, setMoneyErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [allLines, setAllLines] = useState(receipt.status === "reviewed");
  const [summaryLines, setSummaryLines] = useState(false);
  const [fields, setFields] = useState(
    !data?.store || !data.purchaseDate || data.totalOre === null,
  );
  const [generation, setGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [showDate, setShowDate] = useState(false);
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
  const totals = data ? reconcile(data) : null;
  const issues = data ? receiptReviewIssues(data) : [];
  function change(next: ReceiptData) {
    setData(next);
    setDirty(true);
    setMessage("");
  }
  function reset(current: Receipt) {
    setData(current.data);
    setRevision(current.revision);
    setDuplicateResolved(current.duplicateResolved);
    setExcluded(current.excluded);
    setRemember([]);
    setProductChanges({});
    setMoneyErrors({});
    setDirty(false);
    setGeneration((value) => value + 1);
  }
  const moneyError = (key: string, value: string | null) =>
    setMoneyErrors((previous) => {
      const next = { ...previous };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre.");
    } finally {
      setBusy(false);
    }
  }
  async function save(reviewed: boolean) {
    if (!data || Object.keys(moneyErrors).length) return;
    await run(async () => {
      await client.mutation(api.receipts.save, {
        id: receipt._id,
        revision,
        data,
        reviewed,
        rememberLineIds: remember,
        productChanges: Object.entries(productChanges).map(
          ([lineId, choice]) => ({
            lineId,
            productId: choice.kind === "existing" ? choice.id : null,
            createNew: choice.kind === "new",
          }),
        ),
        duplicateResolved,
        excluded,
      });
      const result = await client.query(api.receipts.detail, {
        id: receipt._id,
      });
      reset(result.receipt);
      setMessage("Endringene er lagret.");
    });
  }
  function close() {
    router.back();
  }
  return (
    <Screen
      insetTop={false}
      title={data?.store || receipt.data?.store || "Ny kvittering"}
      subtitle={`Lastet opp av ${receipt.uploaderName}`}
    >
      <Copy muted>{statusLabels[receipt.status]}</Copy>
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
      <ReceiptImages receipt={receipt} />
      {receipt.provider.includes("mock") && (
        <Notice>
          Demodata fra en testleverandør. Bildet er ikke lest av en modell.
        </Notice>
      )}
      {!!receipt.error && <Notice error>{receipt.error}</Notice>}
      {receipt.duplicateOf && (
        <Panel>
          <Copy weight="600">Mulig duplikat</Copy>
          <Copy muted>Samme bilde eller kjøpsdetaljer finnes fra før.</Copy>
          <Toggle
            label="Jeg har kontrollert duplikatet"
            value={duplicateResolved}
            onChange={(value) => {
              setDuplicateResolved(value);
              setDirty(true);
            }}
          />
        </Panel>
      )}
      {data && totals ? (
        <>
          <Button
            secondary
            title="Butikk, dato og betalingsdetaljer"
            onPress={() => setFields(!fields)}
          />
          {fields && (
            <Panel key={`fields-${generation}`}>
              <Field
                label="Butikk"
                value={data.store ?? ""}
                onChangeText={(store) =>
                  change({ ...data, store: store || null })
                }
              />
              <Field
                label="Avdeling / sted"
                value={data.branch ?? ""}
                onChangeText={(branch) =>
                  change({ ...data, branch: branch || null })
                }
              />
              <Row
                title="Kjøpsdato"
                detail={data.purchaseDate ?? "Dato ukjent"}
                onPress={() => setShowDate(!showDate)}
              />
              {showDate && Platform.OS !== "web" && (
                <DateTimePicker
                  value={
                    new Date(
                      `${data.purchaseDate || new Date().toISOString().slice(0, 10)}T12:00:00`,
                    )
                  }
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  locale="nb-NO"
                  onChange={(_event, date) => {
                    if (Platform.OS !== "ios") setShowDate(false);
                    if (date)
                      change({
                        ...data,
                        purchaseDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                      });
                  }}
                />
              )}
              {Platform.OS === "web" && (
                <Field
                  label="Kjøpsdato (ÅÅÅÅ-MM-DD)"
                  value={data.purchaseDate ?? ""}
                  onChangeText={(purchaseDate) =>
                    change({ ...data, purchaseDate: purchaseDate || null })
                  }
                />
              )}
              <Field
                label="Klokkeslett (TT:MM)"
                value={data.purchaseTime ?? ""}
                onChangeText={(purchaseTime) =>
                  change({ ...data, purchaseTime: purchaseTime || null })
                }
              />
              <MoneyField
                label="Betalt (kr)"
                value={data.totalOre}
                onChange={(totalOre) => change({ ...data, totalOre })}
                onError={(value) => moneyError("total", value)}
              />
              <Field
                label="Valuta"
                value={data.currency ?? ""}
                autoCapitalize="characters"
                onChangeText={(currency) =>
                  change({ ...data, currency: currency || null })
                }
              />
              <Field
                label="Kvitteringsnummer"
                value={data.receiptNumber ?? ""}
                onChangeText={(receiptNumber) =>
                  change({ ...data, receiptNumber: receiptNumber || null })
                }
              />
            </Panel>
          )}
          {issues.length > 0 && (
            <Panel>
              <Notice>{issues.join("\n")}</Notice>
              {data.issues.length > 0 && (
                <Button
                  title="Feltene er kontrollert"
                  secondary
                  onPress={() => change({ ...data, issues: [] })}
                />
              )}
            </Panel>
          )}
          <Button
            title={
              allLines ? "Vis bare det som må kontrolleres" : "Vis alle linjer"
            }
            secondary
            onPress={() => setAllLines(!allLines)}
          />
          {allLines && (
            <Toggle
              label="Vis betalings- og avgiftssammendrag"
              value={summaryLines}
              onChange={setSummaryLines}
            />
          )}
          {!allLines &&
            data.lines.every((line) => !lineReviewIssues(line).length) && (
              <Copy muted>Ingen varelinjer trenger kontroll.</Copy>
            )}
          {data.lines
            .filter((line) =>
              allLines
                ? summaryLines ||
                  !["summary", "vat"].includes(line.kind) ||
                  lineReviewIssues(line).length
                : lineReviewIssues(line).length,
            )
            .map((line) => (
              <ReceiptLineEditor
                key={`${generation}-${line.id}`}
                line={line}
                lines={data.lines}
                receiptId={receipt._id}
                retailer={data.store ?? ""}
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
                      ? [...previous, line.id]
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
          {allLines && (
            <Button
              title="Legg til manglende linje"
              secondary
              onPress={() =>
                change({
                  ...data,
                  lines: [...data.lines, emptyLine(randomUUID())],
                })
              }
            />
          )}
          <Panel>
            <Copy size={20} weight="600">
              Stemmer beløpene?
            </Copy>
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
              <Row
                key={row.label}
                title={row.label}
                value={formatMoney(row.amount)}
              />
            ))}
            <Copy weight="600">
              {totals.difference === 0
                ? "Beløpene stemmer"
                : `Avvik: ${formatMoney(totals.difference)}`}
            </Copy>
          </Panel>
          <Toggle
            label="Utelat fra forbruk"
            value={excluded}
            onChange={(value) => {
              setExcluded(value);
              setDirty(true);
            }}
          />
          {Object.values(moneyErrors).map((value, index) => (
            <Notice key={index} error>
              {value}
            </Notice>
          ))}
          <Button
            title="Lagre endringer"
            secondary
            busy={busy}
            disabled={
              !online ||
              processing ||
              receipt.revision !== revision ||
              !!Object.keys(moneyErrors).length
            }
            onPress={() => void save(false)}
          />
          <Button
            title="Marker kontrollert"
            busy={busy}
            disabled={
              !online ||
              processing ||
              receipt.revision !== revision ||
              !!Object.keys(moneyErrors).length ||
              !canAcceptReceipt(
                data,
                !!receipt.duplicateOf && !duplicateResolved,
              )
            }
            onPress={() => void save(true)}
          />
        </>
      ) : (
        <Panel>
          <Copy size={20} weight="600">
            {processing ? "Kvitteringen behandles" : "Ingen resultater ennå"}
          </Copy>
          {receipt.data && (
            <Button title="Vis resultatet" onPress={() => reset(receipt)} />
          )}
        </Panel>
      )}
      {!!error && <Notice error>{error}</Notice>}
      {!!message && <Notice>{message}</Notice>}
      <Button
        title="Les bildene på nytt"
        secondary
        disabled={processing || !online || busy || dirty}
        onPress={() =>
          void run(async () => {
            await client.mutation(api.receipts.retry, { id: receipt._id });
            setMessage("Kvitteringen behandles på nytt.");
          })
        }
      />
      <Button
        title="Slett kvittering"
        danger
        disabled={!online || busy || receipt.status === "uploading"}
        onPress={() =>
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
          )
        }
      />
      <Button title="Tilbake" secondary onPress={close} />
    </Screen>
  );
}
