import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { openDatabaseSync } from "expo-sqlite";
import { storageSuffix } from "@/lib/deployment-storage";
import { ReceiptDraftStorage } from "@/lib/receipt-draft-storage";
import { ReceiptDraftController } from "@/lib/receipt-draft-controller";
import { Notice, Screen } from "@/components/ui";
import { useHousehold } from "./household-context";
import { ReceiptEditor } from "./receipt-editor";
import { ReceiptDraftBoundary } from "./receipt-draft-boundary";
import { receiptDraftDiagnostics } from "@/lib/receipt-diagnostics";
import { recordEvent } from "@/lib/observability";

let draftDatabase: ReturnType<typeof openDatabaseSync> | undefined;

function openDraftDatabase() {
  draftDatabase ??= openDatabaseSync(`receipt-drafts${storageSuffix}.db`);

  return draftDatabase;
}

type EditorProps = Omit<
  ComponentProps<typeof ReceiptEditor>,
  "draft" | "dispatch" | "storageError"
>;

export function ReceiptEditorSession(props: EditorProps) {
  const { owner, household } = useHousehold();

  return (
    <ScopedReceiptEditor
      key={JSON.stringify([owner, household.id, props.receipt._id])}
      owner={owner}
      {...props}
    />
  );
}

function ScopedReceiptEditor({
  owner,
  ...props
}: EditorProps & { owner: string }) {
  const [controller] = useState(
    () =>
      new ReceiptDraftController(
        () =>
          new ReceiptDraftStorage(
            openDraftDatabase(),
            owner,
            props.receipt.householdId,
            props.receipt._id,
          ),
        props.receipt,
      ),
  );

  const snapshot = useSyncExternalStore(controller.subscribe, controller.read);
  useEffect(() => {
    const current = controller.read();

    if (current.kind === "ready" && current.draft.remote !== props.receipt) {
      recordEvent(
        "receipt.snapshot_received",
        receiptDraftDiagnostics(props.receipt.revision, current.draft),
      );
      controller.dispatch({ type: "remote", receipt: props.receipt });
    }
  }, [controller, props.receipt]);

  if (snapshot.kind === "blocked")
    return (
      <Screen title="Lagret utkast">
        <Notice tone="error">{snapshot.message}</Notice>
      </Screen>
    );

  return (
    <ReceiptDraftBoundary
      incomingRevision={props.receipt.revision}
      draft={snapshot.draft}
      dispatch={controller.dispatch}
    >
      <ReceiptEditor
        {...props}
        draft={snapshot.draft}
        dispatch={controller.dispatch}
        storageError={snapshot.storageError}
      />
    </ReceiptDraftBoundary>
  );
}
