import { FormSection, NativeForm } from "@/components/ui/native-form";
import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button, Field, Notice, Row, Sheet } from "@/components/ui";
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
}: Readonly<{
  visible: boolean;
  receiptId: Id<"receipts">;
  onPhysicalStore: (store: PhysicalStore | null) => void;
  data: ReceiptData;
  onChange: (value: ReceiptData) => void;
  onMoneyError: (value: string | null) => void;
  onClose: () => void;
}>) {
  const [showDate, setShowDate] = useState(false);
  const [totalError, setTotalError] = useState<string | null>(null);
  const [storePicker, setStorePicker] = useState(false);

  const close = () => {
    if (totalError) Alert.alert("Kontroller beløpet", totalError);
    else onClose();
  };

  const missingStore = !data.store?.trim();
  const missingTotal = data.totalOre === null;

  return (
    <Sheet
      title="Kvitteringsdetaljer"
      visible={visible}
      scrollable={false}
      dismissible={!totalError}
      onClose={close}
      footer={
        <>
          {!!totalError && <Notice tone="error">{totalError}</Notice>}
          <Button
            title="Ferdig"
            icon="checkmark"
            disabled={!!totalError}
            onPress={close}
          />
        </>
      }
    >
      <NativeForm>
        <FormSection title="Butikk">
          <Field
            label="Butikk"
            value={data.store ?? ""}
            placeholder="F.eks. REMA 1000"
            autoFocus={missingStore}
            onChangeText={(store) =>
              onChange({ ...data, store: store || null })
            }
          />
          <Field
            label="Avdeling / sted"
            value={data.branch ?? ""}
            placeholder="Valgfritt"
            onChangeText={(branch) =>
              onChange({ ...data, branch: branch || null })
            }
          />
          <Row
            title={data.physicalStore?.name ?? "Koble til fysisk butikk"}
            detail={data.physicalStore?.address ?? "Valgfritt"}
            icon="storefront"
            onPress={() => setStorePicker(true)}
          />
        </FormSection>
        <FormSection title="Kjøp">
          <MoneyField
            label="Betalt (kr)"
            value={data.totalOre}
            autoFocus={!missingStore && missingTotal}
            onChange={(totalOre) => onChange({ ...data, totalOre })}
            onError={(error) => {
              setTotalError(error);
              onMoneyError(error);
            }}
          />
          <Row
            title="Kjøpsdato"
            value={formatDate(data.purchaseDate)}
            icon="calendar"
            onPress={() => setShowDate(!showDate)}
          />
          {showDate && (
            <DateTimePicker
              value={
                new Date(
                  `${data.purchaseDate || new Date().toISOString().slice(0, 10)}T12:00:00`,
                )
              }
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              locale="nb-NO"
              maximumDate={new Date()}
              onDismiss={() => setShowDate(false)}
              onValueChange={(_event, date) => {
                if (Platform.OS !== "ios") setShowDate(false);

                onChange({
                  ...data,
                  purchaseDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                });
              }}
            />
          )}
        </FormSection>
        <FormSection title="Flere detaljer">
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
        </FormSection>
      </NativeForm>
      {storePicker && (
        <CatalogStorePicker
          receiptId={receiptId}
          name={data.branch ?? ""}
          onSelect={onPhysicalStore}
          onClose={() => setStorePicker(false)}
        />
      )}
    </Sheet>
  );
}
