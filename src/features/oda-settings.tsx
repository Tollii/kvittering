import { useState } from "react";
import { Alert, View } from "react-native";
import { useConvex, useQuery } from "convex/react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import { Button, Copy, Notice, Row } from "@/components/ui";
import { releaseMutation } from "@/lib/releases/requests";
import { failureMessage } from "@/lib/failure-message";
import { useHousehold } from "./household-context";

const syncTime = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Sign in at Oda once; delivered orders then arrive as receipts on their own. */
export function OdaSettings() {
  const client = useConvex();
  const { online } = useHousehold();
  const status = useQuery(api.oda.status);

  const [busy, setBusy] = useState<"signIn" | "sync" | "disconnect" | null>(
    null,
  );

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const blocked = !online || busy !== null;

  async function run(operation: NonNullable<typeof busy>) {
    setBusy(operation);
    setError("");
    setMessage("");

    try {
      if (operation === "signIn") {
        const returnUrl = Linking.createURL("oda");

        const url = await releaseMutation(client, api.oda.start, {
          request: randomUUID(),
          returnUrl,
        });

        const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);

        if (result.type !== "success") return;

        const outcome = new URL(result.url).searchParams.get("status");

        if (outcome === "connected")
          setMessage("Oda er koblet til. Bestillingene hentes nå.");
        else if (outcome === "failed")
          setError("Innloggingen hos Oda mislyktes. Prøv igjen.");
      } else if (operation === "sync") {
        await releaseMutation(client, api.oda.sync, {});
        setMessage("Ser etter nye bestillinger.");
      } else {
        await releaseMutation(client, api.oda.disconnect, {});
      }
    } catch (cause) {
      setError(
        failureMessage(cause, `oda.${operation}`, "Kunne ikke fullføre."),
      );
    } finally {
      setBusy(null);
    }
  }

  const signIn = (title: string) => (
    <Button
      title={title}
      icon="cart"
      disabled={blocked}
      busy={busy === "signIn"}
      onPress={() => void run("signIn")}
    />
  );

  return (
    <View style={{ gap: 12 }}>
      {status === undefined && !online && (
        <Copy muted>Koble til nettet for å se Oda-kontoen.</Copy>
      )}
      {status === null && (
        <>
          <Copy muted>
            Logg inn med Oda-kontoen din, så kommer leverte bestillinger inn som
            kvitteringer av seg selv.
          </Copy>
          {signIn("Logg inn med Oda")}
        </>
      )}
      {!!status && (
        <>
          <Row
            title="Oda er koblet til"
            icon="checkmark.circle"
            detail={[
              `${status.importedCount} ${status.importedCount === 1 ? "bestilling" : "bestillinger"} hentet`,
              status.lastSyncAt
                ? `sist ${syncTime.format(status.lastSyncAt)}`
                : "henter nå",
            ].join(" · ")}
          />
          {status.expired ? (
            <>
              <Notice tone="warning">
                Innloggingen hos Oda er utløpt. Logg inn på nytt for å hente nye
                bestillinger.
              </Notice>
              {signIn("Logg inn med Oda på nytt")}
            </>
          ) : (
            !!status.error && <Notice tone="warning">{status.error}</Notice>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {!status.expired && (
              <View style={{ flex: 1 }}>
                <Button
                  title="Hent nå"
                  variant="tint"
                  icon="arrow.clockwise"
                  disabled={blocked}
                  busy={busy === "sync"}
                  onPress={() => void run("sync")}
                />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button
                title="Koble fra"
                variant="secondary"
                disabled={blocked}
                busy={busy === "disconnect"}
                onPress={() =>
                  Alert.alert(
                    "Koble fra Oda?",
                    "Kvitteringene som allerede er hentet, blir liggende.",
                    [
                      { text: "Avbryt", style: "cancel" },
                      {
                        text: "Koble fra",
                        style: "destructive",
                        onPress: () => void run("disconnect"),
                      },
                    ],
                  )
                }
              />
            </View>
          </View>
        </>
      )}
      {!!message && <Notice tone="success">{message}</Notice>}
      {!!error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}
