import { useRef, useState } from "react";
import { View } from "react-native";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Copy, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { reportError } from "@/lib/observability";
import {
  appleAuthenticationError,
  requestAppleIdentity,
} from "@/lib/apple-authentication";
import {
  AppleAuthenticationButton,
  useAppleAuthentication,
} from "./apple-authentication";
import { disableNotifications } from "./notifications";
import { useHousehold } from "./household-context";
import { failureMessage } from "@/lib/failure-message";
import { UserError } from "@/lib/user-errors";

export function AccountSettings({ disabled }: Readonly<{ disabled: boolean }>) {
  const available = useAppleAuthentication();
  const connected = useQuery(api.auth.appleConnected, available ? {} : "skip");
  const client = useConvex();
  const { queue, online } = useHousehold();
  const [pending, setPending] = useState<"apple" | "signOut" | null>(null);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const blocked = disabled || !online || pending !== null;

  async function run(operation: "apple" | "signOut") {
    if (submitting.current || blocked) return;
    submitting.current = true;
    setPending(operation);
    setError("");

    try {
      if (operation === "apple") {
        const idToken = await requestAppleIdentity();

        if (!idToken) return;

        const result = await authClient.linkSocial({
          provider: "apple",
          idToken,
        });

        if (result.error) {
          reportError(result.error, "auth.apple_link");
          throw new UserError({
            code: "REJECTED",
            message: appleAuthenticationError(result.error.code),
          });
        }
      } else {
        await disableNotifications(client);
        const result = await authClient.signOut();

        if (result.error) throw new Error(result.error.message);
      }
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          operation === "apple" ? "auth.apple_link" : "auth.sign_out",
          "Kunne ikke fullføre.",
        ),
      );
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {available && (
        <>
          <Copy weight="600">
            {connected ? "Apple er koblet til" : "Koble til Apple"}
          </Copy>
          <Copy muted size={14}>
            {connected === true
              ? "Du kan logge inn på denne kontoen med Apple."
              : connected === false
                ? "Bruk Apple neste gang du logger inn. Du beholder kontoen og husstanden din."
                : "Henter innloggingsmetoder …"}
          </Copy>
          {connected === false && (
            <AppleAuthenticationButton
              busy={pending === "apple"}
              disabled={blocked}
              onPress={() => void run("apple")}
            />
          )}
        </>
      )}
      <Copy muted size={14}>
        {queue.length === 0
          ? "Ingenting venter på opplasting"
          : `${queue.length} ${queue.length === 1 ? "kvittering" : "kvitteringer"} venter på opplasting`}
      </Copy>
      <Button
        title="Logg ut"
        variant="secondary"
        disabled={blocked}
        busy={pending === "signOut"}
        onPress={() => void run("signOut")}
      />
      {!!error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}
