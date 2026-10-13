import { ActivityIndicator, View } from "react-native";
import { Copy, Icon, IconButton, Panel } from "@/components/ui";
import { useTheme } from "@/constants/theme";

/** What Kamera last saved: photos that follow through upload, or a typed purchase. */
export type LastSave =
  | { kind: "photos"; count: number }
  | { kind: "purchase" }
  | null;

type SaveNote = { uploading: boolean; failed: boolean; title: string };

/** The title of the note that follows the saved receipts through upload. */
function uploadStatusTitle(
  saved: number,
  uploading: boolean,
  failed: boolean,
  online: boolean,
) {
  if (uploading) return online ? "Laster opp …" : "Venter på nett";

  if (failed) return "Prøver igjen";

  return saved === 1 ? "Lastet opp" : `${saved} kvitteringer lastet opp`;
}

/** The note Kamera shows after saving, or null when there is nothing to say. */
export function saveNote(
  lastSave: LastSave,
  queue: readonly { error?: unknown }[],
  online: boolean,
): SaveNote | null {
  switch (lastSave?.kind) {
    case "photos": {
      const uploading = queue.some((entry) => !entry.error);
      const failed = queue.some((entry) => !!entry.error);

      return {
        uploading,
        failed,
        title: uploadStatusTitle(lastSave.count, uploading, failed, online),
      };
    }

    case "purchase":
      return { uploading: false, failed: false, title: "Kjøpet er lagt inn" };
    case undefined:
      return null;
  }
}

export function SaveNotePanel({
  note,
  onClose,
}: Readonly<{ note: SaveNote; onClose: () => void }>) {
  const colors = useTheme();

  return (
    <Panel style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {note.uploading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Icon
            name={
              note.failed ? "arrow.clockwise.circle" : "checkmark.circle.fill"
            }
            size={22}
            color={note.failed ? colors.warning : colors.success}
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
