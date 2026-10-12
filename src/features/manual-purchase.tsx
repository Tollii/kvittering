import { useRef, useState } from "react";
import { View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Button,
  Copy,
  Field,
  IconButton,
  Notice,
  Sheet,
  useLargeText,
} from "@/components/ui";
import { FormSection, NativeForm } from "@/components/ui/native-form";
import { MoneyField } from "@/components/money-field";
import { useTheme } from "@/constants/theme";
import { CalendarDate } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import {
  manualPurchaseReceipt,
  type ManualPurchase,
} from "@/lib/domain/manual-purchase";
import { reviewTaskLabel, reviewTasks } from "@/lib/domain/receipt-review";
import { failureMessage } from "@/lib/failure-message";
import { releaseMutation } from "@/lib/releases/requests";
import { useFeatureFlag } from "./featureFlags";
import { useHousehold } from "./household-context";
import { PurchaseDateRow } from "./purchase-date-row";

type DraftLine = {
  key: string;
  name: string;
  amountOre: Ore | null;
  amountError: string | null;
};

const newLine = (): DraftLine => ({
  key: randomUUID(),
  name: "",
  amountOre: null,
  amountError: null,
});

/** The lines a person filled in; a row left empty is not a line. */
function typedLines(lines: DraftLine[]): ManualPurchase["lines"] {
  return lines.flatMap(({ name, amountOre }) =>
    name.trim() || amountOre !== null ? [{ name, amountOre }] : [],
  );
}

/**
 * Record a purchase without a photo, such as a cash purchase or a lost
 * receipt. Store, date and paid amount are required; lines are optional.
 */
export function ManualPurchaseSheet({
  visible,
  onClose,
  onSaved,
}: Readonly<{
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const client = useConvex();
  const colors = useTheme();
  const largeText = useLargeText();
  const { household, online } = useHousehold();
  const available = useFeatureFlag("receiptProcessing");
  const [store, setStore] = useState("");
  // Null until chosen: the sheet stays mounted, so today is read when it is used.
  const [chosenDate, setChosenDate] = useState<CalendarDate | null>(null);
  const purchaseDate = chosenDate ?? CalendarDate.today();
  const [totalOre, setTotalOre] = useState<Ore | null>(null);
  const [totalError, setTotalError] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A retry after a lost answer sends the same ID, so the purchase is recorded once.
  const clientId = useRef(randomUUID());
  // Remounts the amount fields after a reset, since they keep their own text.
  const [generation, setGeneration] = useState(0);

  const purchase: ManualPurchase | null =
    totalOre === null
      ? null
      : { store, purchaseDate, totalOre, lines: typedLines(lines) };

  const checked = purchase && manualPurchaseReceipt(purchase);

  const problem =
    totalError ??
    lines.find((line) => line.amountError !== null)?.amountError ??
    (checked?.kind === "invalid" ? checked.message : null);

  const ready =
    checked?.kind === "valid" && !problem && online && available && !busy;

  // The same rules as a photographed receipt decide whether it needs a look.
  const review =
    checked?.kind === "valid"
      ? reviewTasks(checked.receipt, false).map(reviewTaskLabel)
      : [];

  const lineSum = Ore.sum(lines.map((line) => line.amountOre ?? Ore.zero));
  const ofTotal = totalOre === null ? "" : ` av ${Ore.format(totalOre)}`;

  const linesCaption = lines.length
    ? `Varene er til sammen ${Ore.format(lineSum)}${ofTotal}.`
    : "Uten varer blir hele beløpet ett uspesifisert kjøp. Kategorien kan du velge etterpå.";

  const updateLine = (key: string, change: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );

  const reset = () => {
    setStore("");
    setChosenDate(null);
    setTotalOre(null);
    setTotalError(null);
    setLines([]);
    setError("");
    setGeneration((value) => value + 1);
    clientId.current = randomUUID();
  };

  const save = async () => {
    if (!purchase || !ready) return;
    setBusy(true);
    setError("");

    try {
      await releaseMutation(client, api.manualPurchases.add, {
        clientId: clientId.current,
        householdId: household.id,
        purchase,
      });
      reset();
      onSaved();
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          "receipt.add_purchase",
          "Kjøpet ble ikke lagret.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const status = !online
    ? "Du er uten nett. Kjøpet kan legges inn når du er på nett igjen."
    : !available
      ? "Kvitteringer tas ikke imot akkurat nå. Prøv igjen senere."
      : null;

  return (
    <Sheet
      title="Legg inn kjøp"
      visible={visible}
      scrollable={false}
      onClose={onClose}
      footer={
        <>
          {!!status && <Notice>{status}</Notice>}
          {!!(problem ?? error) && (
            <Notice tone="error">{problem ?? error}</Notice>
          )}
          {review.length > 0 && (
            <Copy role="caption" muted>
              {`Kjøpet blir lagt til kontroll: ${review.join(", ").toLocaleLowerCase("nb-NO")}.`}
            </Copy>
          )}
          <Button
            title="Lagre kjøp"
            icon="checkmark"
            disabled={!ready}
            busy={busy}
            onPress={() => void save()}
          />
        </>
      }
    >
      <NativeForm>
        <FormSection title="Kjøp">
          <Field
            label="Butikk"
            value={store}
            placeholder="F.eks. Torghandel"
            autoFocus
            onChangeText={setStore}
          />
          <MoneyField
            key={`total-${generation}`}
            label="Betalt (kr)"
            value={totalOre}
            onChange={setTotalOre}
            onError={setTotalError}
          />
          <PurchaseDateRow
            value={purchaseDate}
            shown={visible}
            onChange={setChosenDate}
          />
        </FormSection>
        <FormSection title="Varer (valgfritt)">
          {lines.map((line, index) => (
            <View
              key={line.key}
              style={{
                flexDirection: largeText ? "column" : "row",
                alignItems: largeText ? "stretch" : "flex-end",
                gap: 8,
              }}
            >
              <View style={{ flex: largeText ? undefined : 1 }}>
                <Field
                  label={`Vare ${index + 1}`}
                  value={line.name}
                  placeholder="Navn"
                  onChangeText={(name) => updateLine(line.key, { name })}
                />
              </View>
              <View style={{ width: largeText ? undefined : 116 }}>
                <MoneyField
                  key={`${line.key}-${generation}`}
                  label="Beløp (kr)"
                  accessibilityLabel={`Beløp for vare ${index + 1}`}
                  value={line.amountOre}
                  onChange={(amountOre) => updateLine(line.key, { amountOre })}
                  onError={(amountError) =>
                    updateLine(line.key, { amountError })
                  }
                />
              </View>
              <View style={{ alignSelf: largeText ? "flex-end" : undefined }}>
                <IconButton
                  name="minus.circle"
                  label={`Fjern vare ${index + 1}`}
                  color={colors.danger}
                  onPress={() =>
                    setLines((current) =>
                      current.filter((other) => other.key !== line.key),
                    )
                  }
                />
              </View>
            </View>
          ))}
          <Copy role="caption" muted>
            {linesCaption}
          </Copy>
          <Button
            title="Legg til vare"
            variant="secondary"
            icon="plus"
            onPress={() => setLines((current) => [...current, newLine()])}
          />
        </FormSection>
      </NativeForm>
    </Sheet>
  );
}
