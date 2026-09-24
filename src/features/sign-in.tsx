import { useReleaseMutation } from "@/lib/releases/requests";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button, Copy, Field, Notice, Panel, Screen } from "@/components/ui";
import {
  AuthenticationLayout,
  AuthenticationLink,
} from "./authentication-layout";
import { useTheme } from "@/constants/theme";
import {
  AppleAuthenticationButton,
  useAppleAuthentication,
} from "./apple-authentication";
import {
  appleAuthenticationError,
  requestAppleIdentity,
} from "@/lib/apple-authentication";

import { useFeatureFlag } from "./featureFlags";

export function SignIn() {
  const emailSignUp = useFeatureFlag("emailSignUp");
  const appleAvailable = useAppleAuthentication();
  const colors = useTheme();
  const [emailMode, setEmailMode] = useState<"login" | "register" | null>(null);
  const register = emailSignUp && emailMode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"apple" | "email" | null>(null);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const busy = pending !== null;
  const showEmail = emailMode !== null || appleAvailable === false;

  async function continueWithApple() {
    if (submitting.current) return;
    submitting.current = true;
    setPending("apple");
    setError("");

    try {
      const idToken = await requestAppleIdentity();

      if (!idToken) return;

      const result = await authClient.signIn.social({
        provider: "apple",
        idToken,
      });

      if (result.error) {
        if (result.error.code === "OAUTH_LINK_ERROR") setEmailMode("login");
        throw new Error(appleAuthenticationError(result.error.code));
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Innlogging mislyktes.",
      );
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  const canSubmit =
    !!email.trim() &&
    password.length >= (register ? 12 : 1) &&
    (!register || !!name.trim());

  async function submit() {
    if (submitting.current || !canSubmit) return;
    submitting.current = true;
    setPending("email");
    setError("");

    try {
      const result = register
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
          })
        : await authClient.signIn.email({ email: email.trim(), password });

      if (result.error)
        throw new Error(result.error.message ?? "Innlogging mislyktes.");
      setPassword("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Innlogging mislyktes.",
      );
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  return (
    <AuthenticationLayout
      compact={showEmail}
      title={
        showEmail
          ? register
            ? "Opprett konto"
            : "Logg inn"
          : "Velkommen til Kvitto"
      }
      subtitle={
        showEmail
          ? "Fortsett med e-post og passord."
          : "Kvitteringer og dagligvarer.\nSamlet for hele husstanden."
      }
      navigation={
        showEmail && appleAvailable ? (
          <AuthenticationLink
            back
            title="Alle innloggingsvalg"
            disabled={busy}
            onPress={() => {
              setEmailMode(null);
              setError("");
            }}
          />
        ) : undefined
      }
    >
      <View style={{ gap: 20 }}>
        {!!error && <Notice tone="error">{error}</Notice>}
        {!showEmail && (
          <>
            {appleAvailable && (
              <AppleAuthenticationButton
                busy={pending === "apple"}
                disabled={busy}
                onPress={() => void continueWithApple()}
              />
            )}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
            >
              <View
                style={{
                  flex: 1,
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: colors.line,
                }}
              />
              <Copy muted size={14}>
                eller
              </Copy>
              <View
                style={{
                  flex: 1,
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: colors.line,
                }}
              />
            </View>
            {emailSignUp && (
              <Button
                variant="secondary"
                title="Opprett konto med e-post"
                disabled={busy}
                style={{
                  minHeight: 56,
                  borderRadius: 28,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
                onPress={() => setEmailMode("register")}
              />
            )}
            <View style={{ paddingTop: 12, gap: 2 }}>
              <Copy muted size={14} style={{ textAlign: "center" }}>
                Har du allerede en konto?
              </Copy>
              <AuthenticationLink
                title="Logg inn med e-post"
                disabled={busy}
                onPress={() => setEmailMode("login")}
              />
            </View>
          </>
        )}
        {showEmail && (
          <>
            <View style={{ gap: 16 }}>
              {register && (
                <Field
                  label="Navn"
                  testID="sign-in-name"
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                  textContentType="name"
                  editable={!busy}
                  style={{ borderRadius: 14 }}
                />
              )}
              <Field
                label="E-post"
                testID="sign-in-email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                editable={!busy}
                style={{ borderRadius: 14 }}
              />
              <Field
                label="Passord"
                testID="sign-in-password"
                value={password}
                onChangeText={setPassword}
                returnKeyType={register ? "done" : "go"}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={register ? "new-password" : "current-password"}
                textContentType={register ? "newPassword" : "password"}
                onSubmitEditing={() => void submit()}
                hint={register ? "Minst 12 tegn" : undefined}
                editable={!busy}
                style={{ borderRadius: 14 }}
              />
            </View>
            <Button
              title={register ? "Opprett konto" : "Logg inn"}
              testID="sign-in-submit"
              busy={pending === "email"}
              style={{ minHeight: 56, borderRadius: 28 }}
              disabled={busy || !canSubmit}
              onPress={() => void submit()}
            />
            {emailSignUp && (
              <AuthenticationLink
                title={
                  register ? "Har du konto? Logg inn" : "Ny her? Opprett konto"
                }
                disabled={busy}
                onPress={() => {
                  setEmailMode(register ? "login" : "register");
                  setError("");
                }}
              />
            )}
          </>
        )}
      </View>
    </AuthenticationLayout>
  );
}

export function HouseholdSetup() {
  const [join, setJoin] = useState(false);
  const [invitation, setInvitation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useReleaseMutation(api.households.create);
  const joinHousehold = useReleaseMutation(api.households.join);
  const canSubmit = !join || !!invitation.trim();

  async function submit() {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError("");

    try {
      if (join) await joinHousehold({ invitation: invitation.trim() });
      else
        await create({
          name: "Hjemme",
          invitation: randomUUID().replaceAll("-", ""),
        });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Kunne ikke lagre husstanden.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={join ? "Bli med i husstanden" : "Kom i gang"}>
      <Copy muted>
        {join
          ? "Bruk invitasjonskoden fra den du deler husstand med."
          : "Start med dine egne kvitteringer i Hjemme. Du kan endre navnet og invitere en person senere."}
      </Copy>
      <Panel style={{ gap: 16 }}>
        {join && (
          <Field
            label="Invitasjonskode"
            value={invitation}
            onChangeText={setInvitation}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
        )}
        {!!error && <Notice tone="error">{error}</Notice>}
        <Button
          title={join ? "Bli med" : "Start med mine kvitteringer"}
          busy={busy}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
        <Button
          variant="secondary"
          disabled={busy}
          title={join ? "Tilbake" : "Jeg har en invitasjonskode"}
          onPress={() => {
            setJoin(!join);
            setError("");
          }}
        />
      </Panel>
      <Button
        variant="secondary"
        title="Logg ut"
        disabled={busy}
        onPress={() => {
          void authClient
            .signOut()
            .catch(() => setError("Kunne ikke logge ut. Prøv igjen."));
        }}
      />
    </Screen>
  );
}
