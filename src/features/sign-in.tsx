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
      <View style={{ paddingTop: 24, gap: 12 }}>
        <Icon name="receipt" size={42} />
        <Copy size={20} weight="700">
          Kvitto.
        </Copy>
        <Copy size={44} weight="700">
          Dagligvarene.{"\n"}Samlet.
        </Copy>
        <Copy muted>Handle. Ta et bilde. Ferdig.</Copy>
      </View>
      <Panel>
        <Copy size={23} weight="600">
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
        />
        {register && (
          <Copy size={13} muted>
            Bruk minst 12 tegn. Dere oppretter hver deres konto og deler én
            husstand.
          </Copy>
        )}
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
    <Screen
      title={join ? "Bli med hjem." : "En husstand for to."}
      subtitle="Begge kan legge til og kontrollere kvitteringer."
    >
      <Panel>
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
        <Button
          secondary
          title="Logg ut"
          onPress={() => {
            void authClient
              .signOut()
              .catch(() => setError("Kunne ikke logge ut. Prøv igjen."));
          }}
        />
      </Panel>
    </Screen>
  );
}
