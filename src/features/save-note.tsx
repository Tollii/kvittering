import { ActivityIndicator, View } from "react-native";
import { Copy, Icon, IconButton, Panel } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { uploadPhase, type LocalReceipt } from "@/lib/upload-queue";

/** What Kamera last saved: photos that follow through upload, or a typed purchase. */
export type LastSave =
  | { kind: "photos"; count: number }
  | { kind: "purchase" }
  | null;

/**
 * Where the saved receipts stand. `waiting` continues by itself at the time the
 * service named; `stopped` waits for the person in Kvitteringer.
 */
type SaveNoteState = "uploading" | "retrying" | "stopped" | "waiting" | "done";

type SaveNote = { state: SaveNoteState; title: string };

/** The state of the whole queue: the one that most needs saying comes first. */
function queueState(queue: readonly LocalReceipt[], online: boolean) {
  const phases = new Set(queue.map((entry) => uploadPhase(entry, online).kind));

  if (phases.has("uploading") || phases.has("offline")) return "uploading";

  if (phases.has("retrying")) return "retrying";

  if (phases.has("rejected") || phases.has("regroup")) return "stopped";

  if (phases.has("waiting")) return "waiting";

  return "done";
}

/** The title of the note that follows the saved receipts through upload. */
function uploadStatusTitle(
  saved: number,
  state: SaveNoteState,
  online: boolean,
) {
  switch (state) {
    case "uploading":
      return online ? "Laster opp …" : "Venter på nett";
    case "retrying":
      return "Prøver igjen";
    case "stopped":
      return "Kunne ikke laste opp";
    case "waiting":
      return "Lastes opp senere";
    case "done":
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
      const state = queueState(queue, online);

      return {
        state,
        title: uploadStatusTitle(lastSave.count, state, online),
      };
    }

    case "purchase":
      return { state: "done", title: "Kjøpet er lagt inn" };
    case undefined:
      return null;
  }
}

const noteIcons = {
  retrying: "arrow.clockwise.circle",
  stopped: "exclamationmark.circle",
  waiting: "hourglass",
  done: "checkmark.circle.fill",
} as const;

export function SaveNotePanel({
  note,
  onClose,
}: Readonly<{ note: SaveNote; onClose: () => void }>) {
  const colors = useTheme();

  return (
    <Panel style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {note.state === "uploading" ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Icon
            name={noteIcons[note.state]}
            size={22}
            color={
              note.state === "done"
                ? colors.success
                : note.state === "waiting"
                  ? colors.secondary
                  : colors.warning
            }
          />
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
