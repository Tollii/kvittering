import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button, Field, Notice, Row, Sheet } from "@/components/ui";
import { useReleaseMutation } from "@/lib/releases/requests";
import { useHousehold } from "./household-context";
import { failureMessage } from "@/lib/failure-message";

export function HouseholdNameSettings() {
  const { household, online } = useHousehold();

  const [draft, setDraft] = useState<{
    name: string;
    previousName: string;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rename = useReleaseMutation(api.households.rename);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");

    try {
      await rename(draft);
      setDraft(null);
    } catch (cause) {
      setError(
        failureMessage(cause, "household.rename", "Kunne ikke lagre navnet."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Row
        title="Endre navn"
        icon="pencil"
        onPress={() => {
          setError("");
          setDraft({ name: household.name, previousName: household.name });
        }}
      />
      <Sheet
        title="Navn på husstanden"
        visible={draft !== null}
        dismissible={!busy}
        onClose={() => setDraft(null)}
      >
        <Field
          label="Navn"
          value={draft?.name ?? ""}
          maxLength={80}
          editable={!busy}
          onChangeText={(name) =>
            setDraft((current) => (current ? { ...current, name } : null))
          }
        />
        {!!error && <Notice tone="error">{error}</Notice>}
        <Button
          title="Lagre"
          busy={busy}
          disabled={
            !online ||
            !draft?.name.trim() ||
            draft.name.trim() === draft.previousName
          }
          onPress={() => void save()}
        />
      </Sheet>
    </>
  );
}
