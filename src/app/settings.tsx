import { useState } from "react";
import { Alert, Share } from "react-native";
import { router } from "expo-router";
import { useConvex } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button, Copy, Notice, Panel, Row, Screen } from "@/components/ui";
import { useHousehold } from "@/features/session";
import {
  disableNotifications,
  NotificationSettings,
} from "@/features/notifications";
export default function Settings() {
  const { details, household, queue, online } = useHousehold();
  const client = useConvex();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke fullføre.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title={household.name} insetTop={false}>
      <Button title="Ferdig" secondary onPress={() => router.back()} />
      <Panel>
        <Copy size={20} weight="600">
          Medlemmer
        </Copy>
        {details?.members.map((member) => (
          <Row key={member._id} title={member.name} />
        ))}
      </Panel>
      <Panel>
        <Copy size={20} weight="600">
          Inviter partneren din
        </Copy>
        <Copy muted>
          Partneren oppretter en konto og bruker denne koden. Husstanden har
          plass til to.
        </Copy>
        <Copy selectable size={14}>
          {details?.household.invitation ??
            "Koble til nettet for å hente koden."}
        </Copy>
        <Button
          title="Kopier kode"
          secondary
          disabled={!details || busy}
          onPress={() =>
            void run(async () => {
              await Clipboard.setStringAsync(details!.household.invitation);
              setMessage("Koden er kopiert.");
            })
          }
        />
        <Button
          title="Del invitasjonskode"
          secondary
          disabled={!details || busy}
          onPress={() =>
            void run(() =>
              Share.share({
                message: `Bli med i ${household.name} i Kvitto. Invitasjonskode: ${details!.household.invitation}`,
              }),
            )
          }
        />
        <Button
          title="Lag ny invitasjonskode"
          secondary
          disabled={!online || busy}
          onPress={() =>
            Alert.alert(
              "Lage ny kode?",
              "Den gamle koden vil slutte å virke.",
              [
                { text: "Avbryt", style: "cancel" },
                {
                  text: "Lag ny kode",
                  onPress: () =>
                    void run(() =>
                      client.mutation(api.households.rotateInvitation, {
                        invitation: randomUUID().replaceAll("-", ""),
                      }),
                    ),
                },
              ],
            )
          }
        />
        {!!message && <Copy>{message}</Copy>}
      </Panel>
      <NotificationSettings />
      <Panel>
        <Copy size={20} weight="600">
          På denne enheten
        </Copy>
        <Copy muted>
          {queue.length} kvittering(er) venter på opplasting. Hold appen åpen
          mens bildene lastes opp.
        </Copy>
        <Copy size={13} muted>
          Lokale bilder beholdes for denne kontoen til neste innlogging og
          fullført opplasting.
        </Copy>
        <Button
          title="Logg ut"
          secondary
          disabled={!online}
          busy={busy}
          onPress={() =>
            void run(async () => {
              await disableNotifications(client);
              const result = await authClient.signOut();
              if (result.error) throw new Error(result.error.message);
            })
          }
        />
      </Panel>
      {!!error && <Notice error>{error}</Notice>}
    </Screen>
  );
}
