import { Platform } from "react-native";
import { Stack } from "expo-router";
import { Button, Row, Sheet, Toggle } from "@/components/ui";

/** The receipt actions that the iOS toolbar menu and the actions sheet share. */
export type ReceiptActionMenu = {
  busy: boolean;
  summaryLines: boolean;
  excluded: boolean;
  fieldsDisabled: boolean;
  addLineDisabled: boolean;
  retryDisabled: boolean;
  deleteDisabled: boolean;
  onEditFields: () => void;
  onAddLine: () => void;
  onSummaryLines: (value: boolean) => void;
  onExcluded: (value: boolean) => void;
  onRetry: () => void;
  onDelete: () => void;
};

/**
 * The save button and the action menu in the iOS navigation bar.
 * Other platforms show the actions in `ReceiptActionsSheet`.
 */
export function ReceiptEditorToolbar({
  menu,
  saveOffered,
  saveDisabled,
  dirty,
  ready,
  onSave,
}: Readonly<{
  menu: ReceiptActionMenu;
  /** The draft has changes to save, or the receipt waits for approval. */
  saveOffered: boolean;
  saveDisabled: boolean;
  dirty: boolean;
  ready: boolean;
  onSave: () => void;
}>) {
  if (Platform.OS !== "ios") return null;

  return (
    <Stack.Toolbar placement="right">
      {saveOffered && (
        <Stack.Toolbar.Button
          icon="checkmark"
          disabled={saveDisabled || menu.busy || (!dirty && !ready)}
          onPress={onSave}
        >
          {saveButtonLabel(menu.busy, dirty)}
        </Stack.Toolbar.Button>
      )}
      <Stack.Toolbar.Menu icon="ellipsis" title="Flere handlinger">
        <Stack.Toolbar.MenuAction
          icon="pencil"
          disabled={menu.fieldsDisabled}
          onPress={menu.onEditFields}
        >
          Kvitteringsdetaljer
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="plus"
          disabled={menu.addLineDisabled}
          onPress={menu.onAddLine}
        >
          Legg til linje
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="list.bullet"
          isOn={menu.summaryLines}
          onPress={() => menu.onSummaryLines(!menu.summaryLines)}
        >
          Vis MVA og oppsummering
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="eye.slash"
          isOn={menu.excluded}
          disabled={menu.busy}
          onPress={() => menu.onExcluded(!menu.excluded)}
        >
          Utelat fra forbruk
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="arrow.clockwise"
          disabled={menu.retryDisabled}
          onPress={menu.onRetry}
        >
          Les bildene på nytt
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="trash"
          destructive
          disabled={menu.deleteDisabled}
          onPress={menu.onDelete}
        >
          Slett kvittering
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}

function saveButtonLabel(busy: boolean, dirty: boolean): string {
  if (busy) return "Lagrer …";

  return dirty ? "Lagre" : "Godkjenn";
}

/** The receipt actions on platforms without the iOS toolbar menu. */
export function ReceiptActionsSheet({
  menu,
  onClose,
}: Readonly<{ menu: ReceiptActionMenu; onClose: () => void }>) {
  return (
    <Sheet title="Flere handlinger" visible onClose={onClose}>
      <Row title="Kvitteringsdetaljer" onPress={menu.onEditFields} />
      <Row
        title="Legg til linje"
        onPress={() => {
          onClose();
          menu.onAddLine();
        }}
      />
      <Toggle
        label="Vis MVA og oppsummering"
        value={menu.summaryLines}
        onChange={menu.onSummaryLines}
      />
      <Toggle
        label="Utelat fra forbruk"
        value={menu.excluded}
        onChange={menu.onExcluded}
      />
      <Button
        title="Les bildene på nytt"
        variant="secondary"
        disabled={menu.retryDisabled}
        onPress={() => {
          onClose();
          menu.onRetry();
        }}
      />
      <Button
        title="Slett kvittering"
        variant="danger"
        disabled={menu.deleteDisabled}
        onPress={menu.onDelete}
      />
    </Sheet>
  );
}
