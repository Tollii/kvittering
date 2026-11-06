import { ActivityIndicator, View } from "react-native";
import Animated from "react-native-reanimated";
import { Button, Copy, IconTile, Panel, easeOut } from "@/components/ui";
import { motion, useTheme } from "@/constants/theme";
import {
  uploadPhase,
  type LocalReceipt,
  type UploadPhase,
} from "@/lib/upload-queue";
import { QueueRegroup } from "./queue-regroup";

/** The one line under the title that says where the upload stands. */
function phaseDetail(phase: UploadPhase) {
  switch (phase.kind) {
    case "uploading":
      return `Laster opp · ${phase.uploaded} av ${phase.total}`;
    case "offline":
      return "Venter på nett";
    case "waiting":
    case "rejected":
      return phase.message;
    case "retrying":
      return "Venter på nytt forsøk";
    case "regroup":
      return "Maks 5 bilder per kvittering. Bildene er beholdt.";
  }
}

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
  const phase = uploadPhase(entry, online);
  const uploaded = entry.uploaded.filter(Boolean).length;
  const active = phase.kind === "uploading" || phase.kind === "offline";

  // A failure is a warning: the images are safe and wait for the person.
  const stopped =
    phase.kind === "retrying" ||
    phase.kind === "rejected" ||
    phase.kind === "regroup";

  return (
    <Panel style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {active ? (
          <IconTile>
            <ActivityIndicator color={colors.primary} />
          </IconTile>
        ) : phase.kind === "waiting" ? (
          <IconTile icon="hourglass" color={colors.secondary} />
        ) : (
          <IconTile
            icon={
              phase.kind === "retrying"
                ? "arrow.clockwise.circle"
                : "exclamationmark.circle"
            }
            color={colors.warning}
          />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Copy weight="600">
            {entry.images.length === 1
              ? "Ny kvittering"
              : `Ny kvittering · ${entry.images.length} bilder`}
          </Copy>
          <Copy role="detail" muted>
            {phaseDetail(phase)}
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
        {/* A childless fill, so easing its width re-lays out nothing else. */}
        <Animated.View
          style={{
            height: 4,
            width: `${Math.max(6, (uploaded / entry.images.length) * 100)}%`,
            backgroundColor: stopped
              ? colors.warning
              : active
                ? colors.primary
                : colors.secondary,
            transitionProperty: "width",
            transitionDuration: motion.state,
            transitionTimingFunction: easeOut,
          }}
        />
      </View>
      {phase.kind === "regroup" && <QueueRegroup entry={entry} />}
      {(phase.kind === "retrying" || phase.kind === "rejected") && (
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
