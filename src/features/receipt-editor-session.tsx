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
import { useHousehold } from "./session";
import { ReceiptEditor } from "./receipt-editor";

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
            openDatabaseSync(`receipt-drafts${storageSuffix}.db`),
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

    if (current.kind === "ready" && current.draft.remote !== props.receipt)
      controller.dispatch({ type: "remote", receipt: props.receipt });
  }, [controller, props.receipt]);

  if (snapshot.kind === "blocked")
    return (
      <Screen title="Lagret utkast">
        <Notice error>{snapshot.message}</Notice>
      </Screen>
    );

  return (
    <ReceiptEditor
      {...props}
      draft={snapshot.draft}
      dispatch={controller.dispatch}
      storageError={snapshot.storageError}
    />
  );
}
