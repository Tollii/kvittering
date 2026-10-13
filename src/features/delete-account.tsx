import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useConvex, useQuery, type ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { requestAppleAuthorization } from "@/lib/apple-authentication";
import { failureMessage } from "@/lib/failure-message";
import { reportError } from "@/lib/observability";
import { releaseAction } from "@/lib/releases/requests";
import { useAppleAuthentication } from "./apple-authentication";

/** The household the account belongs to; null before one is created or joined. */
export type DeletedHousehold = {
  name: string;
  partner: string | null;
  queued: number;
  discardQueue: () => void;
} | null;

/** What deleting the account removes, and what stays with a partner. */
function consequence(household: DeletedHousehold, apple: boolean) {
  return [
    !household
      ? "Kontoen din blir slettet. Det kan ikke angres."
      : household.partner
        ? `Kontoen din blir slettet, og du forlater ${household.name}. Kvitteringene blir værende hos ${household.partner}.`
        : `Kontoen din, ${household.name} og alle kvitteringer og bilder blir slettet. Det kan ikke angres.`,
    !!household?.queued &&
      `${household.queued} ${household.queued === 1 ? "kvittering" : "kvitteringer"} som venter på opplasting, blir slettet fra telefonen.`,
    apple && "Du bekrefter med Apple før kontoen slettes.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function deleteAccount({
  client,
  appleLinked,
  household,
}: Readonly<{
  client: ConvexReactClient;
  appleLinked: boolean;
  household: DeletedHousehold;
}>) {
  // A linked Apple ID is confirmed and revoked before anything is deleted.
  const appleAuthorizationCode = appleLinked
    ? await requestAppleAuthorization()
    : undefined;

  if (appleAuthorizationCode === null) return;

  await releaseAction(client, api.account.remove, { appleAuthorizationCode });

  try {
    // The account and its household are gone, so nothing queued can upload.
    household?.discardQueue();
  } catch (error) {
    // An upload attempt in progress keeps its files; the account stays deleted.
    reportError(error, "auth.delete_account");
  }

  // The server already removed every session, so the sign-out only clears this device.
  await authClient.signOut();
}

/** "Slett kontoen", confirmed with an alert and, for a linked Apple ID, with Apple. */
export function DeleteAccountButton({
  household,
  disabled,
}: Readonly<{ household: DeletedHousehold; disabled: boolean }>) {
  const available = useAppleAuthentication();
  const connected = useQuery(api.auth.appleConnected, available ? {} : "skip");
  const client = useConvex();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const appleLinked = connected === true;

  async function remove() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");

    try {
      await deleteAccount({ client, appleLinked, household });
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          "auth.delete_account",
          "Kunne ikke slette kontoen. Prøv igjen.",
        ),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Button
        title="Slett kontoen"
        variant="danger"
        // Deleting a linked Apple account needs to know it is linked.
        disabled={disabled || (!!available && connected === undefined)}
        busy={busy}
        onPress={() =>
          Alert.alert("Slette kontoen?", consequence(household, appleLinked), [
            { text: "Avbryt", style: "cancel" },
            {
              text: "Slett",
              style: "destructive",
              onPress: () => void remove(),
            },
          ])
        }
      />
      {!!error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}
