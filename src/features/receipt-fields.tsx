import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button, Copy, Field, Notice, Row, Sheet } from "@/components/ui";
import { MoneyField } from "@/components/money-field";
import type { ReceiptData } from "@/lib/domain/receipt";
import { formatDate } from "@/lib/format-date";
import { CatalogStorePicker } from "./catalog-store-picker";
import type { Id } from "../../convex/_generated/dataModel";
import type { PhysicalStore } from "@/lib/catalog/model";

export function ReceiptFields({
  visible,
  receiptId,
  onPhysicalStore,
  data,
  onChange,
  onMoneyError,
  onClose,
}: {
  visible: boolean;
  receiptId: Id<"receipts">;
  onPhysicalStore: (store: PhysicalStore | null) => void;
  data: ReceiptData;
  onChange: (value: ReceiptData) => void;
  onMoneyError: (value: string | null) => void;
  onClose: () => void;
}) {
  const [showDate, setShowDate] = useState(false);
  const [more, setMore] = useState(false);
  const [totalError, setTotalError] = useState<string | null>(null);
  const [storePicker, setStorePicker] = useState(false);
  const close = () => {
    if (totalError) Alert.alert("Kontroller beløpet", totalError);
    else onClose();
  };
  return (
    <Sheet
      title="Kvitteringsdetaljer"
      visible={visible}
      onClose={close}
      footer={
        <>
          <Copy muted size={12}>
            Endringene lagres sammen med kvitteringen.
          </Copy>
          {!!totalError && <Notice error>{totalError}</Notice>}
          <Button title="Ferdig" disabled={!!totalError} onPress={close} />
        </>
      }
    >
      <Field
        label="Butikk"
        value={data.store ?? ""}
        onChangeText={(store) => onChange({ ...data, store: store || null })}
      />
      <Field
        label="Avdeling / sted"
        value={data.branch ?? ""}
        onChangeText={(branch) => onChange({ ...data, branch: branch || null })}
      />
      <Row
        title="Kjøpsdato"
        value={formatDate(data.purchaseDate)}
        onPress={() => setShowDate(!showDate)}
      />
      <Row
        title={data.physicalStore?.name ?? "Koble til butikk"}
        detail={
          data.physicalStore?.address ?? "Valgfritt · finn den fysiske butikken"
        }
        onPress={() => setStorePicker(true)}
      />
      {storePicker && (
        <CatalogStorePicker
          receiptId={receiptId}
          name={data.branch ?? ""}
          onSelect={onPhysicalStore}
          onClose={() => setStorePicker(false)}
        />
      )}
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
              onChange({
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
            onChange({ ...data, purchaseDate: purchaseDate || null })
          }
        />
      )}
      <MoneyField
        label="Betalt (kr)"
        value={data.totalOre}
        onChange={(totalOre) => onChange({ ...data, totalOre })}
        onError={(error) => {
          setTotalError(error);
          onMoneyError(error);
        }}
      />
      <Row title="Flere detaljer" onPress={() => setMore(!more)} />
      {more && (
        <View style={{ gap: 10 }}>
          <Field
            label="Klokkeslett (TT:MM)"
            value={data.purchaseTime ?? ""}
            onChangeText={(purchaseTime) =>
              onChange({ ...data, purchaseTime: purchaseTime || null })
            }
          />
          <Field
            label="Valuta"
            value={data.currency ?? ""}
            autoCapitalize="characters"
            onChangeText={(currency) =>
              onChange({ ...data, currency: currency || null })
            }
          />
          <Field
            label="Kvitteringsnummer"
            value={data.receiptNumber ?? ""}
            onChangeText={(receiptNumber) =>
              onChange({ ...data, receiptNumber: receiptNumber || null })
            }
          />
        </View>
      )}
    </Sheet>
  );
}
