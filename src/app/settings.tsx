import { ReceiptSearchSettings } from "@/features/spotlight";
import { FormSection, NativeForm } from "@/components/ui/native-form";
import { CameraPreferences } from "@/features/camera-preferences";
import { ReleaseSettings } from "@/features/release-settings";
import { releaseMutation } from "@/lib/releases/requests";
import { useState } from "react";
import { Alert, Platform, Share, View } from "react-native";
import { router, Stack } from "expo-router";
import { useConvex } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button, Copy, Icon, Notice, Row, Screen } from "@/components/ui";
import { useHousehold } from "@/features/session";
import { BudgetSettings } from "@/features/budget-settings";
import {
  disableNotifications,
  NotificationSettings,
} from "@/features/notifications";
import { useTheme } from "@/constants/theme";

export default function Settings() {
  const colors = useTheme();
  const { details, household, queue, online } = useHousehold();
  const client = useConvex();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run<Result>(action: () => Promise<Result>) {
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

  const full = (details?.members.length ?? 0) >= 2;

  return (
    <Screen insetTop={false} scrollable={false}>
      <Stack.Screen
        options={{
          title: "Husstanden",
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => <Button title="Ferdig" onPress={() => router.back()} />,
        }}
      />
      {Platform.OS === "ios" && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button onPress={() => router.back()}>
            Ferdig
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      )}
      <NativeForm>
        <FormSection title={household.name}>
          <View>
            {details?.members.map((member, index) => (
              <View
                key={member._id}
                style={{
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.line,
                }}
              >
                <Row title={member.name} icon="person" />
              </View>
            ))}
            {!details && (
              <Copy muted style={{ paddingVertical: 10 }}>
                Koble til nettet for å se medlemmene.
              </Copy>
            )}
          </View>
        </FormSection>
        {!full && (
          <>
            <FormSection title="Inviter partneren din">
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 12,
                    borderRadius: 12,
                    borderCurve: "continuous",
                    backgroundColor: colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Icon name="key" size={16} />
                  <Copy
                    selectable
                    size={14}
                    weight="600"
                    style={{ flex: 1, fontVariant: ["tabular-nums"] }}
                  >
                    {details?.household.invitation ??
                      "Koble til nettet for å hente koden."}
                  </Copy>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Kopier"
                      tint
                      icon="doc.on.doc"
                      disabled={!details || busy}
                      onPress={() =>
                        void run(async () => {
                          await Clipboard.setStringAsync(
                            details!.household.invitation,
                          );
                          setMessage("Koden er kopiert.");
                        })
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Del"
                      icon="square.and.arrow.up"
                      disabled={!details || busy}
                      onPress={() =>
                        void run(() =>
                          Share.share({
                            message: `Bli med i ${household.name} i Kvitto. Invitasjonskode: ${details!.household.invitation}`,
                          }),
                        )
                      }
                    />
                  </View>
                </View>
                {!!message && (
                  <Copy size={13} style={{ color: colors.success }}>
                    {message}
                  </Copy>
                )}
                <Row
                  title="Lag ny invitasjonskode"
                  onPress={
                    !online || busy
                      ? undefined
                      : () =>
                          Alert.alert(
                            "Lage ny kode?",
                            "Den gamle koden vil slutte å virke.",
                            [
                              { text: "Avbryt", style: "cancel" },
                              {
                                text: "Lag ny kode",
                                onPress: () =>
                                  void run(() =>
                                    releaseMutation(
                                      client,
                                      api.households.rotateInvitation,
                                      {
                                        invitation: randomUUID().replaceAll(
                                          "-",
                                          "",
                                        ),
                                      },
                                    ),
                                  ),
                              },
                            ],
                          )
                  }
                />
              </View>
            </FormSection>
          </>
        )}
        <FormSection title="Kategorisering">
          <Row
            title="Rettelser og læring"
            detail="Se beslutninger og test kategorisering"
            icon="checkmark.circle"
            onPress={() => router.push("/corrections")}
          />
        </FormSection>
        <FormSection title="Budsjett">
          <BudgetSettings />
        </FormSection>
        <FormSection title="Varsler">
          <NotificationSettings />
        </FormSection>
        <FormSection title="App og oppdateringer">
          <ReleaseSettings />
        </FormSection>
        <FormSection title="Spotlight">
          <ReceiptSearchSettings />
        </FormSection>
        <FormSection title="Kamera">
          <View style={{ gap: 12 }}>
            <CameraPreferences />
          </View>
        </FormSection>
        <FormSection title="På denne enheten">
          <View style={{ gap: 12 }}>
            <Copy muted size={14}>
              {queue.length === 0
                ? "Ingenting venter på opplasting"
                : `${queue.length} ${queue.length === 1 ? "kvittering" : "kvitteringer"} venter på opplasting`}
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
          </View>
          {!!error && <Notice error>{error}</Notice>}
        </FormSection>
      </NativeForm>
    </Screen>
  );
}
