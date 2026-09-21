import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { Button, IconButton, Notice, Sheet } from "@/components/ui";
import { convexSiteUrl, fetchAccessToken } from "@/lib/auth-client";
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
  const [token, setToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");

    try {
      const accessToken = await fetchAccessToken();

      if (ReceiptIntelligence?.previewReceipts) {
        await ReceiptIntelligence.previewReceipts(
          Array.from(
            { length: receipt.imageCount },
            (_, position) =>
              `${convexSiteUrl}/receipt-image?receipt=${receipt._id}&position=${position}`,
          ),
          accessToken,
        );
      } else {
        setToken(accessToken);
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
          secondary
          busy={busy}
          onPress={() => void load()}
        />
      )}
      {!!error && !open && <Notice error>{error}</Notice>}
      <Sheet
        title="Originalkvittering"
        visible={open}
        onClose={() => setOpen(false)}
      >
        {!!error && (
          <>
            <Notice error>{error}</Notice>
            <Button title="Prøv igjen" onPress={() => void load()} />
          </>
        )}
        {token &&
          Array.from({ length: receipt.imageCount }, (_, position) => (
            <ScrollView
              key={`${position}-${token}`}
              maximumZoomScale={5}
              minimumZoomScale={1}
              centerContent
              style={{ height: 650 }}
              contentContainerStyle={{ flexGrow: 1 }}
            >
              <View style={{ flex: 1 }}>
                <Image
                  accessibilityLabel={`Originalkvittering, bilde ${position + 1}`}
                  source={{
                    uri: `${convexSiteUrl}/receipt-image?receipt=${receipt._id}&position=${position}`,
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "reload",
                  }}
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
