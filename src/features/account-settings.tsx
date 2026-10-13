import { useRef, useState } from "react";
import { View } from "react-native";
import { useConvex, useQuery, type ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Copy, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { reportError } from "@/lib/observability";
import {
  appleAuthenticationError,
  isAppleRejection,
  requestAppleIdentity,
} from "@/lib/apple-authentication";
import {
  AppleAuthenticationButton,
  useAppleAuthentication,
} from "./apple-authentication";
import { disableNotifications } from "./notifications";
import { useHousehold } from "./household-context";
import { DeleteAccountButton } from "./delete-account";
import { failureMessage } from "@/lib/failure-message";
import { UserError } from "@/lib/user-errors";

type Operation = "apple" | "signOut";

const operations: Record<Operation, { event: string; fallback: string }> = {
  apple: { event: "auth.apple_link", fallback: "Kunne ikke fullføre." },
  signOut: { event: "auth.sign_out", fallback: "Kunne ikke fullføre." },
};

async function linkApple() {
  const idToken = await requestAppleIdentity();

  if (!idToken) return;

  const result = await authClient.linkSocial({ provider: "apple", idToken });

  if (result.error) {
    if (!isAppleRejection(result.error.code))
      reportError(result.error, "auth.apple_link");
    throw new UserError({
      code: "REJECTED",
      message: appleAuthenticationError(result.error.code),
    });
  }
}

async function signOut(client: ConvexReactClient) {
  await disableNotifications(client);
  const result = await authClient.signOut();

  if (result.error) throw new Error(result.error.message);
}

export function AccountSettings({ disabled }: Readonly<{ disabled: boolean }>) {
  const available = useAppleAuthentication();
  const connected = useQuery(api.auth.appleConnected, available ? {} : "skip");
  const client = useConvex();
  const { queue, online, details, household, discardQueue } = useHousehold();
  const [pending, setPending] = useState<Operation | null>(null);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const blocked = disabled || !online || pending !== null;

  async function run(operation: Operation, action: () => Promise<void>) {
    if (submitting.current || blocked) return;
    submitting.current = true;
    setPending(operation);
    setError("");

    try {
      await action();
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          operations[operation].event,
          operations[operation].fallback,
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
          <Copy muted role="detail">
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
              onPress={() => void run("apple", linkApple)}
            />
          )}
        </>
      )}
      <Copy muted role="detail">
        {queue.length === 0
          ? "Ingenting venter på opplasting"
          : `${queue.length} ${queue.length === 1 ? "kvittering" : "kvitteringer"} venter på opplasting`}
      </Copy>
      <Button
        title="Logg ut"
        variant="secondary"
        disabled={blocked}
        busy={pending === "signOut"}
        onPress={() => void run("signOut", () => signOut(client))}
      />
      <DeleteAccountButton
        disabled={blocked || !details}
        household={
          details
            ? {
                name: household.name,
                partner:
                  details.members.find(
                    (member) => member._id !== details.member._id,
                  )?.name ?? null,
                queued: queue.length,
                discardQueue,
              }
            : null
        }
      />
      {!!error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}
