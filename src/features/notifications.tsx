import {
  nextReviewEvening,
  receiptReviewCategory,
  reviewReceiptAction,
  remindReceiptAction,
} from "@/lib/receipt-notifications";
import { reportError } from "@/lib/observability";
import { z } from "zod";
import { releaseMutation } from "@/lib/releases/requests";
import { useEffect, useState } from "react";
import { AppState, Linking, Platform, View } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { router } from "expo-router";
import { useConvex, useQuery, type ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Copy, Notice } from "@/components/ui";
import { useHousehold } from "./session";

const tokenKey = "kvitto.push-token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function disableNotifications(client: ConvexReactClient) {
  const token = await SecureStore.getItemAsync(tokenKey);

  if (token) {
    await releaseMutation(client, api.notifications.unsubscribe, { token });
    await SecureStore.deleteItemAsync(tokenKey);
  }
}

export function NotificationSettings() {
  const client = useConvex();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [granted, setGranted] = useState(true);

  const enabled = useQuery(
    api.notifications.enabled,
    token ? { token } : "skip",
  );

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  const available =
    Device.isDevice &&
    !!projectId &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

  useEffect(() => {
    const refresh = async () => {
      try {
        setToken(await SecureStore.getItemAsync(tokenKey));
        setGranted((await Notifications.getPermissionsAsync()).granted);
      } catch {
        setError("Kunne ikke hente varslingsinnstillingene.");
      }
    };

    void refresh();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });

    return () => subscription.remove();
  }, []);

  async function change() {
    setBusy(true);
    setError("");

    try {
      if (enabled) {
        await disableNotifications(client);
        setToken(null);
      } else {
        const permission = await Notifications.requestPermissionsAsync();
        setGranted(permission.granted);

        if (!permission.granted)
          throw new Error("Tillat varsler i iPhone-innstillingene.");

        if (Platform.OS === "android")
          await Notifications.setNotificationChannelAsync("default", {
            name: "Kvitteringer",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        const result = await Notifications.getExpoPushTokenAsync({ projectId });
        // Keep the token before registering it, so sign-out can always revoke it.
        await SecureStore.setItemAsync(tokenKey, result.data);
        setToken(result.data);
        await releaseMutation(client, api.notifications.subscribe, {
          token: result.data,
        });
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Kunne ikke endre varsler.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {!available && (
        <Copy size={13} muted>
          Ikke tilgjengelig i denne versjonen
        </Copy>
      )}
      {available && (
        <Button
          title={enabled ? "Slå av varsler" : "Slå på varsler"}
          tint={!enabled}
          secondary={!!enabled}
          icon={enabled ? "bell.slash" : "bell"}
          busy={busy}
          onPress={() => void change()}
        />
      )}
      {!granted && (
        <Button
          secondary
          title="Åpne innstillinger"
          onPress={() => void Linking.openSettings()}
        />
      )}
      {!!error && <Notice error>{error}</Notice>}
    </View>
  );
}

export function NotificationRouting() {
  const client = useConvex();
  const { household } = useHousehold();
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    let active = true;
    const handled = new Set<string>();
    void Notifications.setNotificationCategoryAsync(receiptReviewCategory, [
      {
        identifier: reviewReceiptAction,
        buttonTitle: "Kontroller",
        options: { opensAppToForeground: true },
      },
      {
        identifier: remindReceiptAction,
        buttonTitle: "Minn meg kl. 20",
        options: { opensAppToForeground: true },
      },
    ]).catch((cause) => reportError(cause, "notifications.register_actions"));

    async function open(response: Notifications.NotificationResponse | null) {
      if (!response) return;
      const identifier = `${response.notification.request.identifier}:${response.actionIdentifier}`;

      if (handled.has(identifier)) return;
      handled.add(identifier);

      if (
        ![
          Notifications.DEFAULT_ACTION_IDENTIFIER,
          reviewReceiptAction,
          remindReceiptAction,
        ].includes(response.actionIdentifier)
      )
        return;
      setError("");
      setConfirmation("");
      const data = response.notification.request.content.data ?? {};

      if (data.route === "/spending") {
        router.navigate("/spending");
        Notifications.clearLastNotificationResponse();

        return;
      }

      const id = z.string().safeParse(data.receiptId).data;

      if (!id) return;

      try {
        const result = await client.query(api.receipts.detail, {
          id: id,
        });

        if (!result) throw new Error("Receipt unavailable");

        if (!active) return;

        if (result.receipt.householdId !== household.id)
          throw new Error("Receipt unavailable");

        if (response.actionIdentifier === remindReceiptAction) {
          const token = await SecureStore.getItemAsync(tokenKey);

          if (!active) return;

          if (!token) throw new Error("Notifications disabled");
          const evening = nextReviewEvening(new Date());
          await releaseMutation(client, api.notifications.remindLater, {
            receiptId: result.receipt._id,
            token,
            at: evening.getTime(),
          });

          if (active)
            setConfirmation(
              `Påminnelse satt til ${evening.toLocaleString("nb-NO", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`,
            );
        } else {
          router.push({ pathname: "/receipt/[id]", params: { id } });
        }
      } catch (cause) {
        reportError(cause, "notifications.response");

        if (active)
          setError(
            response.actionIdentifier === remindReceiptAction
              ? "Kunne ikke sette påminnelsen. Kontroller nettet og at varsler er på og kvitteringen fortsatt trenger kontroll."
              : "Kvitteringen i varselet er ikke tilgjengelig for denne kontoen.",
          );
      } finally {
        Notifications.clearLastNotificationResponse();
      }
    }

    try {
      void open(Notifications.getLastNotificationResponse()).catch(() => {});
    } catch {
      // A launch response is optional; the listener still handles later notifications.
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => void open(response),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, [client, household.id]);

  return error ? (
    <Notice error>{error}</Notice>
  ) : confirmation ? (
    <Notice>{confirmation}</Notice>
  ) : null;
}
