import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useConvex, useQuery, type ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Copy, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { reportError } from "@/lib/observability";
import {
  appleAuthenticationError,
  isAppleRejection,
  requestAppleAuthorization,
  requestAppleIdentity,
} from "@/lib/apple-authentication";
import { releaseAction } from "@/lib/releases/requests";
import { receiptStorage } from "@/lib/receipt-storage";
import type { LocalReceipt } from "@/lib/upload-queue";
import {
  AppleAuthenticationButton,
  useAppleAuthentication,
} from "./apple-authentication";
import { disableNotifications } from "./notifications";
import { useHousehold } from "./household-context";
import { failureMessage } from "@/lib/failure-message";
import { UserError } from "@/lib/user-errors";

type Operation = "apple" | "signOut" | "delete";

const operationName: Record<Operation, string> = {
  apple: "auth.apple_link",
  signOut: "auth.sign_out",
  delete: "auth.delete_account",
};

/** What deleting the account removes, and what stays with a partner. */
function deletionConsequence({
  household,
  partner,
  queued,
  apple,
}: Readonly<{
  household: string;
  partner: string | null;
  queued: number;
  apple: boolean;
}>) {
  return [
    partner
      ? `Kontoen din blir slettet, og du forlater ${household}. Kvitteringene blir værende hos ${partner}.`
      : `Kontoen din, ${household} og alle kvitteringer og bilder blir slettet. Det kan ikke angres.`,
    queued > 0 &&
      `${queued} ${queued === 1 ? "kvittering" : "kvitteringer"} som venter på opplasting, blir slettet fra telefonen.`,
    apple && "Du bekrefter med Apple før kontoen slettes.",
  ]
    .filter(Boolean)
    .join(" ");
}

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

async function deleteAccount(
  client: ConvexReactClient,
  appleLinked: boolean,
  queue: readonly LocalReceipt[],
) {
  // A linked Apple ID is confirmed and revoked before anything is deleted.
  const appleAuthorizationCode = appleLinked
    ? await requestAppleAuthorization()
    : undefined;

  if (appleAuthorizationCode === null) return;

  await releaseAction(client, api.account.remove, { appleAuthorizationCode });

  // The account and its household are gone, so nothing queued can upload.
  for (const entry of queue) receiptStorage.remove(entry);
  await authClient.signOut();
}

export function AccountSettings({ disabled }: Readonly<{ disabled: boolean }>) {
  const available = useAppleAuthentication();
  const connected = useQuery(api.auth.appleConnected, available ? {} : "skip");
  const client = useConvex();
  const { queue, online, details, household } = useHousehold();
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
          operationName[operation],
          operation === "delete"
            ? "Kunne ikke slette kontoen. Prøv igjen."
            : "Kunne ikke fullføre.",
        ),
      );
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  function confirmDeletion() {
    if (!details) return;

    const partner = details.members.find(
      (member) => member._id !== details.member._id,
    );

    Alert.alert(
      "Slette kontoen?",
      deletionConsequence({
        household: household.name,
        partner: partner?.name ?? null,
        queued: queue.length,
        apple: !!connected,
      }),
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Slett",
          style: "destructive",
          onPress: () =>
            void run("delete", () => deleteAccount(client, !!connected, queue)),
        },
      ],
    );
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
      <Button
        title="Slett kontoen"
        variant="danger"
        // Deleting a linked Apple account needs to know it is linked.
        disabled={
          blocked || !details || (!!available && connected === undefined)
        }
        busy={pending === "delete"}
        onPress={confirmDeletion}
      />
      {!!error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}
