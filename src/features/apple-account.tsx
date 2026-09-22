import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Copy, Notice } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import {
  appleAuthenticationError,
  requestAppleIdentity,
} from "@/lib/apple-authentication";
import {
  AppleAuthenticationButton,
  useAppleAuthentication,
} from "./apple-authentication";

export function AppleAccount({ disabled }: Readonly<{ disabled: boolean }>) {
  const available = useAppleAuthentication();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    if (!available || disabled) return undefined;
    let active = true;

    void authClient
      .listAccounts()
      .then((result) => {
        if (result.error)
          throw new Error("Kunne ikke hente innloggingsmetoder.");

        if (
          active &&
          result.data?.some((account) => account.providerId === "apple")
        )
          setConnected(true);
      })
      .catch(() => {
        if (active)
          setError(
            "Kunne ikke hente innloggingsmetoder. Du kan fortsatt koble til Apple.",
          );
      });

    return () => {
      active = false;
    };
  }, [available, disabled]);

  async function connect() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");

    try {
      const idToken = await requestAppleIdentity();

      if (!idToken) return;

      const result = await authClient.linkSocial({
        provider: "apple",
        idToken,
      });

      if (result.error)
        throw new Error(appleAuthenticationError(result.error.code));
      setConnected(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Kunne ikke koble til Apple.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!available) return null;

  return (
    <View style={{ gap: 12 }}>
      <Copy weight="600">
        {connected ? "Apple er koblet til" : "Koble til Apple"}
      </Copy>
      <Copy muted size={14}>
        {connected
          ? "Du kan logge inn på denne kontoen med Apple."
          : "Bruk Apple neste gang du logger inn. Du beholder kontoen og husstanden din."}
      </Copy>
      {!connected && (
        <AppleAuthenticationButton
          busy={busy}
          disabled={disabled}
          onPress={() => void connect()}
        />
      )}
      {!!error && <Notice error>{error}</Notice>}
    </View>
  );
}
