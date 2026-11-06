import { ActivityIndicator, View } from "react-native";
import { Copy, Icon, IconButton, Panel } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import type { LocalReceipt } from "@/lib/upload-queue";
import { phaseTone, uploadPhase, type UploadPhase } from "@/lib/upload-phase";
import { phaseSymbol, toneColor } from "./upload-phase-style";

/** What Kamera last saved: photos that follow through upload, or a typed purchase. */
export type LastSave =
  | { kind: "photos"; count: number }
  | { kind: "purchase" }
  | null;

/** The upload phase the note speaks for, or null once nothing is left to upload. */
type SaveNote = { phase: UploadPhase | null; title: string };

/** Which phase the note names when captures stand in different ones: lower first. */
const notePriority = {
  uploading: 0,
  offline: 0,
  rejected: 1,
  regroup: 1,
  failed: 2,
  deferred: 3,
} satisfies Record<UploadPhase["kind"], number>;

/** The phase of the whole queue: the one that most needs saying. */
function queuePhase(queue: readonly LocalReceipt[], online: boolean) {
  let first: UploadPhase | null = null;

  for (const entry of queue) {
    const phase = uploadPhase(entry, online);

    if (!first || notePriority[phase.kind] < notePriority[first.kind])
      first = phase;
  }

  return first;
}

/** The title of the note that follows the saved receipts through upload. */
function uploadStatusTitle(saved: number, phase: UploadPhase | null) {
  switch (phase?.kind) {
    case "uploading":
      return "Laster opp …";
    case "offline":
      return "Venter på nett";
    case "failed":
      return "Prøver igjen";
    case "rejected":
    case "regroup":
      return "Kunne ikke laste opp";
    case "deferred":
      return "Lastes opp senere";
    case undefined:
      return saved === 1 ? "Lastet opp" : `${saved} kvitteringer lastet opp`;
  }
}

/** The note Kamera shows after saving, or null when there is nothing to say. */
export function saveNote(
  lastSave: LastSave,
  queue: readonly LocalReceipt[],
  online: boolean,
): SaveNote | null {
  switch (lastSave?.kind) {
    case "photos": {
      const phase = queuePhase(queue, online);

      return { phase, title: uploadStatusTitle(lastSave.count, phase) };
    }

    case "purchase":
      return { phase: null, title: "Kjøpet er lagt inn" };
    case undefined:
      return null;
  }
}

export function SaveNotePanel({
  note,
  onClose,
}: Readonly<{ note: SaveNote; onClose: () => void }>) {
  const colors = useTheme();

  // Once nothing is left to upload, the note shows a check.
  const symbol = note.phase
    ? phaseSymbol[note.phase.kind]
    : "checkmark.circle.fill";

  const color = note.phase
    ? toneColor(phaseTone(note.phase), colors)
    : colors.success;

  return (
    <Panel style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {symbol ? (
          <Icon name={symbol} size={22} color={color} />
        ) : (
          <ActivityIndicator color={color} />
        )}
        <Copy weight="700" style={{ flex: 1 }}>
          {note.title}
        </Copy>
        <IconButton
          name="xmark"
          label="Lukk"
          size={14}
          color={colors.secondary}
          onPress={onClose}
        />
      </View>
    </Panel>
  );
}
