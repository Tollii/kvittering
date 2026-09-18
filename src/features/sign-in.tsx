import { useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import {
  Button,
  Copy,
  Field,
  Icon,
  Notice,
  Panel,
  Screen,
} from "@/components/ui";
import { Mosaic } from "@/components/mosaic";
import { useTheme } from "@/constants/theme";

function Brand({ tagline }: { tagline: string }) {
  const colors = useTheme();
  return (
    <View style={{ paddingTop: 20, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            borderCurve: "continuous",
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="receipt" size={20} color={colors.onPrimary} />
        </View>
        <Copy size={20} weight="700">
          Kvitto
        </Copy>
      </View>
      <Copy size={44} weight="800" style={{ color: colors.primary }}>
        Dagligvarene.{"\n"}Samlet.
      </Copy>
      <Mosaic seed={1000} height={5} block={5} columns={44} />
      <Copy muted size={16}>
        {tagline}
      </Copy>
    </View>
  );
}

export function SignIn() {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
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
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Brand tagline="Handle. Ta et bilde. Ferdig." />
      <Panel style={{ gap: 12 }}>
        <Copy size={22} weight="700">
          {register ? "Opprett konto" : "Velkommen hjem"}
        </Copy>
        {register && (
          <Field
            label="Navn"
            value={name}
            onChangeText={setName}
            autoComplete="name"
            textContentType="name"
          />
        )}
        <Field
          label="E-post"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <Field
          label="Passord"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={register ? "new-password" : "current-password"}
          textContentType={register ? "newPassword" : "password"}
          onSubmitEditing={() => void submit()}
          hint={register ? "Minst 12 tegn" : undefined}
        />
        {!!error && <Notice error>{error}</Notice>}
        <Button
          title={register ? "Opprett konto" : "Logg inn"}
          busy={busy}
          disabled={
            !email.trim() ||
            password.length < (register ? 12 : 1) ||
            (register && !name.trim())
          }
          onPress={() => void submit()}
        />
        <Button
          secondary
          title={register ? "Har du konto? Logg inn" : "Ny her? Opprett konto"}
          disabled={busy}
          onPress={() => {
            setRegister(!register);
            setError("");
          }}
        />
      </Panel>
    </Screen>
  );
}
export function HouseholdSetup() {
  const [join, setJoin] = useState(false);
  const [name, setName] = useState("Hjemme");
  const [invitation, setInvitation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useMutation(api.households.create);
  const joinHousehold = useMutation(api.households.join);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (join) await joinHousehold({ invitation: invitation.trim() });
      else
        await create({
          name: name.trim(),
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
    <Screen title={join ? "Bli med hjem." : "En husstand for to."}>
      <Panel style={{ gap: 12 }}>
        {join ? (
          <Field
            label="Invitasjonskode"
            value={invitation}
            onChangeText={setInvitation}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : (
          <Field
            label="Navn på husstanden"
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
        )}
        {!!error && <Notice error>{error}</Notice>}
        <Button
          title={join ? "Bli med" : "Opprett husstand"}
          busy={busy}
          disabled={join ? !invitation.trim() : !name.trim()}
          onPress={() => void submit()}
        />
        <Button
          secondary
          title={join ? "Opprett en ny husstand" : "Jeg har en invitasjonskode"}
          onPress={() => {
            setJoin(!join);
            setError("");
          }}
        />
      </Panel>
      <Button
        secondary
        title="Logg ut"
        onPress={() => {
          void authClient
            .signOut()
            .catch(() => setError("Kunne ikke logge ut. Prøv igjen."));
        }}
      />
    </Screen>
  );
}
