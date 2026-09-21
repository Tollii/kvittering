import type { ReactNode } from "react";
import { Image, Pressable, View, useWindowDimensions } from "react-native";
import {
  Button,
  Copy,
  Icon,
  Notice,
  Panel,
  Sheet,
  Toggle,
  pressed,
} from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { maxReceiptImages } from "@/lib/receipt-import";

const onCamera = "#F6F3EA";

/** Review prepared images before saving them to the upload queue. */
export function CaptureReview({
  photos,
  combined,
  visible,
  busy,
  error,
  importRecovery,
  onClose,
  onSave,
  onChoosePhotos,
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
  onChoosePhotos: () => void;
  onRemovePhoto: (uri: string) => void;
  onCombinedChange: (value: boolean) => void;
}>) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - 32 - 10) / 2);

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
          {!!error && <Notice error>{error}</Notice>}
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {photos.map((uri, index) => (
          <View key={uri} style={{ width: tile, height: tile * 1.33 }}>
            <Image
              source={{ uri }}
              style={{
                width: tile,
                height: tile * 1.33,
                borderRadius: 14,
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
                backgroundColor: "#101C51CC",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Copy size={12} weight="700" style={{ color: onCamera }}>
                {index + 1}
              </Copy>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Fjern bilde ${index + 1}`}
              disabled={busy}
              hitSlop={8}
              onPress={() => onRemovePhoto(uri)}
              style={(state) => [
                {
                  position: "absolute",
                  right: 8,
                  top: 8,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: "#101C51CC",
                  alignItems: "center",
                  justifyContent: "center",
                },
                pressed(state),
              ]}
            >
              <Icon name="xmark" size={12} color={onCamera} />
            </Pressable>
          </View>
        ))}
      </View>
      {photos.length > 1 && (
        <Panel style={{ gap: 4 }}>
          <Toggle
            label="Samme kvittering"
            value={combined}
            onChange={onCombinedChange}
            disabled={busy}
          />
        </Panel>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Ta flere"
            secondary
            icon="camera"
            disabled={busy || photos.length >= maxReceiptImages}
            onPress={onClose}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Velg flere"
            secondary
            icon="photo.on.rectangle"
            disabled={busy || photos.length >= maxReceiptImages}
            onPress={onChoosePhotos}
          />
        </View>
      </View>
    </Sheet>
  );
}
