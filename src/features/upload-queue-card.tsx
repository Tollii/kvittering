import { ActivityIndicator, View } from "react-native";
import { Button, Copy, IconTile, Panel } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import type { LocalReceipt } from "@/lib/upload-queue";
import { QueueRegroup } from "./queue-regroup";

/** A receipt whose images are still on this phone, with its upload progress. */
export function UploadQueueCard({
  entry,
  online,
  onRetry,
}: Readonly<{
  entry: LocalReceipt;
  online: boolean;
  onRetry: () => void;
}>) {
  const colors = useTheme();
  const uploaded = entry.uploaded.filter(Boolean).length;

  return (
    <Panel style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {/* A failed upload is a warning: the images are safe and wait for a retry. */}
        {entry.error ? (
          <IconTile icon="arrow.clockwise.circle" color={colors.warning} />
        ) : (
          <IconTile>
            <ActivityIndicator color={colors.primary} />
          </IconTile>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Copy weight="600">
            {entry.images.length === 1
              ? "Ny kvittering"
              : `Ny kvittering · ${entry.images.length} bilder`}
          </Copy>
          <Copy size={13} muted>
            {entry.error
              ? "Prøver igjen"
              : online
                ? `Laster opp · ${uploaded} av ${entry.images.length}`
                : "Venter på nett"}
          </Copy>
        </View>
      </View>
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.muted,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 4,
            width: `${Math.max(6, (uploaded / entry.images.length) * 100)}%`,
            backgroundColor: entry.error ? colors.warning : colors.primary,
          }}
        />
      </View>
      <QueueRegroup entry={entry} />
      {!!entry.error && (
        <Button
          title="Prøv igjen"
          variant="tint"
          compact
          icon="arrow.clockwise"
          onPress={onRetry}
          disabled={!online}
        />
      )}
    </Panel>
  );
}
