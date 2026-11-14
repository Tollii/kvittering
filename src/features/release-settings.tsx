import { useState } from "react";
import { View } from "react-native";
import * as Updates from "expo-updates";
import { Button, Copy, Notice } from "@/components/ui";
import { installedRelease } from "@/lib/releases/installed";
import { useReleasePolicy } from "./release-policy";
import { recordEvent, reportError } from "@/lib/observability";

/** OTA reload is explicit so a downloaded update cannot interrupt an edit. */
export function ReleaseSettings() {
  const { refresh } = useReleasePolicy();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  async function check() {
    setBusy(true);
    setMessage("");
    let phase = "policy_refresh";

    try {
      await refresh();

      if (__DEV__ || !Updates.isEnabled) {
        recordEvent("update.checked", { outcome: "unavailable" });
        setMessage(
          "Direkteoppdateringer er tilgjengelige i installerte utgivelsesbygg.",
        );

        return;
      }

      phase = "update_check";
      const result = await Updates.checkForUpdateAsync();

      if (result.isAvailable || result.isRollBackToEmbedded) {
        phase = "update_download";
        await Updates.fetchUpdateAsync();
        setReady(true);
        // One event per check; a failed check reports itself below.
        recordEvent("update.checked", {
          outcome: result.isRollBackToEmbedded ? "rollback" : "update",
        });
      } else {
        recordEvent("update.checked", { outcome: "current" });
        setMessage("Appen er oppdatert.");
      }
    } catch (error) {
      reportError(error, "update.check", {
        phase,
        updatesEnabled: Updates.isEnabled,
        development: __DEV__,
      });
      setMessage("Kunne ikke hente oppdateringen. Prøv igjen med nett.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Copy>
        Versjon {installedRelease.version} ({installedRelease.build})
      </Copy>
      <Button
        title="Se etter oppdateringer"
        variant="secondary"
        busy={busy}
        onPress={() => void check()}
      />
      {ready && (
        <>
          <Copy>
            Oppdateringen er klar. Fullfør endringene dine før du starter appen
            på nytt.
          </Copy>
          <Button
            title="Start appen på nytt"
            onPress={() =>
              void Updates.reloadAsync().catch((error) => {
                reportError(error, "update.reload");
                setMessage("Lukk og åpne appen for å bruke oppdateringen.");
              })
            }
          />
        </>
      )}
      {!!message && <Notice>{message}</Notice>}
    </View>
  );
}
