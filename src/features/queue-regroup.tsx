import { useState } from "react";
import { Image, View } from "react-native";
import { Button, Copy, Notice, Sheet, Toggle } from "@/components/ui";
import {
  maxReceiptImages,
  receiptImageLimitMessage,
} from "@/lib/domain/receipt-images";
import { imageFile } from "@/lib/receipt-storage";
import type { LocalReceipt } from "@/lib/upload-queue";
import { useHousehold } from "./household-context";

/** Older unreserved queues keep every image until the person selects two receipt groups. */
export function QueueRegroup({ entry }: Readonly<{ entry: LocalReceipt }>) {
  const { regroup } = useHousehold();
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");

  if (
    entry.receiptId ||
    entry.images.length <= maxReceiptImages ||
    !entry.error?.includes(receiptImageLimitMessage)
  )
    return null;
  const remaining = entry.images.length - selected.length;

  return (
    <>
      <Button
        title="Del opp bilder"
        variant="secondary"
        onPress={() => setVisible(true)}
      />
      <Sheet
        title="Velg bilder til første kvittering"
        visible={visible}
        onClose={() => setVisible(false)}
        footer={
          <>
            {!!error && <Notice tone="error">{error}</Notice>}
            <Button
              title="Lagre som to kvitteringer"
              disabled={
                !selected.length ||
                selected.length > maxReceiptImages ||
                !remaining ||
                remaining > maxReceiptImages
              }
              onPress={() => {
                try {
                  regroup(entry.id, selected);
                  setVisible(false);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Kunne ikke dele opp bildene.",
                  );
                }
              }}
            />
          </>
        }
      >
        <Copy>
          Hver kvittering kan ha opptil fem bilder. Valgte bilder blir én
          kvittering. Resten blir en annen kvittering. Ingen bilder slettes.
        </Copy>
        {entry.images.map((name, position) => (
          <View key={name} style={{ gap: 8 }}>
            <Image
              source={{ uri: imageFile(name).uri }}
              style={{ width: "100%", height: 220 }}
              resizeMode="contain"
              accessibilityLabel={`Kvitteringsbilde ${position + 1}`}
            />
            <Toggle
              label={`Bilde ${position + 1}`}
              value={selected.includes(position)}
              onChange={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...current, position]
                    : current.filter((item) => item !== position),
                )
              }
            />
          </View>
        ))}
      </Sheet>
    </>
  );
}
