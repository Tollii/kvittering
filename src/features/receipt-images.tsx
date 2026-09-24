import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { Button, IconButton, Notice, Sheet } from "@/components/ui";
import { cachedReceiptImages } from "@/lib/receipt-image-cache";
import type { Receipt } from "@/lib/domain/insights";

export function ReceiptImages({
  receipt,
  compact = false,
  color,
  background,
}: Readonly<{
  receipt: Receipt;
  compact?: boolean;
  color?: string;
  background?: string;
}>) {
  const [images, setImages] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");

    try {
      const images = await cachedReceiptImages(receipt._id, receipt.imageCount);

      if (ReceiptIntelligence?.previewLocalReceipts) {
        await ReceiptIntelligence.previewLocalReceipts(images);
      } else {
        setImages(images);
        setOpen(true);
      }
    } catch {
      setError("Bildene kunne ikke hentes. Kontroller nettilkoblingen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {compact ? (
        <IconButton
          name="doc.viewfinder"
          label="Vis originalkvittering"
          filled={background ?? true}
          size={17}
          color={color}
          disabled={busy}
          onPress={() => void load()}
        />
      ) : (
        <Button
          title="Vis originalkvittering"
          variant="secondary"
          busy={busy}
          onPress={() => void load()}
        />
      )}
      {!!error && !open && <Notice tone="error">{error}</Notice>}
      <Sheet
        title="Originalkvittering"
        visible={open}
        onClose={() => setOpen(false)}
      >
        {!!error && (
          <>
            <Notice tone="error">{error}</Notice>
            <Button title="Prøv igjen" onPress={() => void load()} />
          </>
        )}
        {images.map((uri, position) => (
          <ScrollView
            key={uri}
            maximumZoomScale={5}
            minimumZoomScale={1}
            centerContent
            style={{ height: 650 }}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <View style={{ flex: 1 }}>
              <Image
                accessibilityLabel={`Originalkvittering, bilde ${position + 1}`}
                source={{ uri }}
                resizeMode="contain"
                style={{ width: "100%", height: 650 }}
                onError={() =>
                  setError("Bildet kunne ikke hentes. Prøv igjen.")
                }
              />
            </View>
          </ScrollView>
        ))}
      </Sheet>
    </>
  );
}
