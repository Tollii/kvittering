import { useState, type ReactNode } from "react";
import { Image, View } from "react-native";
import {
  Button,
  Copy,
  Icon,
  Notice,
  Panel,
  Press,
  Sheet,
  Toggle,
} from "@/components/ui";
import { radius, useTheme } from "@/constants/theme";
import { maxReceiptImages } from "@/lib/receipt-import";

/** Review prepared images before saving them to the upload queue. */
export function CaptureReview({
  photos: selectedPhotos,
  combined: selectedCombined,
  visible,
  busy,
  error,
  importRecovery,
  onClose,
  onSave,
  onRemovePhoto,
  onCombinedChange,
}: Readonly<{
  photos: string[];
  combined: boolean;
  visible: boolean;
  busy: boolean;
  error: string;
  importRecovery: ReactNode;
  onClose: () => void;
  onSave: () => void;
  onRemovePhoto: (uri: string) => void;
  onCombinedChange: (value: boolean) => void;
}>) {
  const colors = useTheme();

  // Saving empties the selection while the sheet is still closing, so the
  // closing sheet keeps showing what was saved instead of "0 bilder".
  const [lastShown, setLastShown] = useState({
    photos: selectedPhotos,
    combined: selectedCombined,
  });

  if (
    visible &&
    (lastShown.photos !== selectedPhotos ||
      lastShown.combined !== selectedCombined)
  )
    setLastShown({ photos: selectedPhotos, combined: selectedCombined });

  const { photos, combined } = visible
    ? { photos: selectedPhotos, combined: selectedCombined }
    : lastShown;

  return (
    <Sheet
      title={
        photos.length === 1
          ? "Ett bilde valgt"
          : `${photos.length} bilder valgt`
      }
      visible={visible}
      dismissible={!busy}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          {!!error && <Notice tone="error">{error}</Notice>}
          {importRecovery}
          <Button
            title={
              combined || photos.length === 1
                ? "Lagre kvittering"
                : `Lagre som ${photos.length} kvitteringer`
            }
            icon="checkmark"
            disabled={!photos.length}
            busy={busy}
            onPress={onSave}
          />
        </>
      }
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 12,
        }}
      >
        {photos.map((uri, index) => (
          <View key={uri} style={{ width: "48%", aspectRatio: 0.75 }}>
            <Image
              source={{ uri }}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: radius.inner,
                borderWidth: 1,
                borderColor: colors.imageOutline,
                backgroundColor: colors.muted,
              }}
              resizeMode="cover"
              accessibilityLabel={`Kvitteringsbilde ${index + 1}`}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 8,
                top: 8,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.cameraOverlayStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Copy size={12} weight="700" style={{ color: colors.onCamera }}>
                {index + 1}
              </Copy>
            </View>
            <Press
              accessibilityRole="button"
              accessibilityLabel={`Fjern bilde ${index + 1}`}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() => onRemovePhoto(uri)}
              style={[
                {
                  position: "absolute",
                  right: 4,
                  top: 4,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.cameraOverlayStrong,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Icon name="xmark" size={12} color={colors.onCamera} />
            </Press>
          </View>
        ))}
      </View>
      {photos.length > 1 && (
        <Panel style={{ gap: 4 }}>
          <Toggle
            label="Samme kvittering"
            detail="Slå på hvis bildene viser deler av én lang kvittering."
            value={combined}
            onChange={onCombinedChange}
            disabled={busy}
          />
        </Panel>
      )}
      {/* The camera behind the sheet has both the shutter and the import buttons. */}
      <Button
        title="Legg til flere bilder"
        variant="secondary"
        icon="plus"
        disabled={busy || photos.length >= maxReceiptImages}
        onPress={onClose}
      />
    </Sheet>
  );
}
