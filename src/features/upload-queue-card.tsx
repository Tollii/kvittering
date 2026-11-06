import { ActivityIndicator, View } from "react-native";
import Animated from "react-native-reanimated";
import { Button, Copy, IconTile, Panel, easeOut } from "@/components/ui";
import { motion, useTheme } from "@/constants/theme";
import { maxReceiptImages } from "@/lib/domain/receipt-images";
import {
  phaseAction,
  phaseTone,
  uploadPhase,
  type LocalReceipt,
  type UploadPhase,
} from "@/lib/upload-queue";
import { QueueRegroup } from "./queue-regroup";
import { phaseSymbol, toneColor } from "./upload-phase-style";

/** The one line under the title that says where the upload stands. */
function phaseDetail(phase: UploadPhase, uploaded: number, total: number) {
  switch (phase.kind) {
    case "uploading":
      return `Laster opp · ${uploaded} av ${total}`;
    case "offline":
      return "Venter på nett";
    case "deferred":
    case "rejected":
      return phase.message;
    case "failed":
      return "Venter på nytt forsøk";
    case "regroup":
      return `Maks ${maxReceiptImages} bilder per kvittering. Bildene er beholdt.`;
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
  const color = toneColor(phaseTone(phase), colors);
  const symbol = phaseSymbol[phase.kind];
  const action = phaseAction(phase);
  const uploaded = entry.uploaded.filter(Boolean).length;
  const total = entry.images.length;

  return (
    <Panel style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {symbol ? (
          <IconTile icon={symbol} color={color} />
        ) : (
          <IconTile>
            <ActivityIndicator color={color} />
          </IconTile>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Copy weight="600">
            {total === 1 ? "Ny kvittering" : `Ny kvittering · ${total} bilder`}
          </Copy>
          <Copy role="detail" muted>
            {phaseDetail(phase, uploaded, total)}
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
            width: `${Math.max(6, (uploaded / total) * 100)}%`,
            backgroundColor: color,
            transitionProperty: "width",
            transitionDuration: motion.state,
            transitionTimingFunction: easeOut,
          }}
        />
      </View>
      {action === "regroup" && <QueueRegroup entry={entry} />}
      {action === "retry" && (
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
