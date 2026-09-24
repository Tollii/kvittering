import { releaseMutation } from "@/lib/releases/requests";
import { useState } from "react";
import { View } from "react-native";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Copy, Notice } from "@/components/ui";
import { MoneyField } from "@/components/money-field";
import { useHousehold } from "./session";
import { formatMoney } from "@/lib/domain/receipt";

/** A single monthly number. Forbruk shows pace against it; Sunday's push reports it. */
export function BudgetSettings() {
  const client = useConvex();
  const { details, online } = useHousehold();
  const current = details?.household.monthlyBudgetOre ?? null;
  const [baseline, setBaseline] = useState(current);
  const [generation, setGeneration] = useState(0);
  const [value, setValue] = useState<number | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<number | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const dirty = value !== baseline || error !== null;

  if (pending !== undefined && pending === current) setPending(undefined);

  if (!dirty && !busy && pending === undefined && baseline !== current) {
    setBaseline(current);
    setValue(current);
    setSaved(false);
    setGeneration(generation + 1);
  }

  async function save(next: number | null) {
    setBusy(true);
    setError(null);

    try {
      await releaseMutation(client, api.households.setBudget, {
        monthlyBudgetOre: next,
      });
      setValue(next);
      setBaseline(next);
      setPending(next);
      setGeneration((value) => value + 1);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <MoneyField
        key={generation}
        label="Månedsbudsjett (kr)"
        value={value}
        onChange={(next) => {
          setValue(next);
          setSaved(false);
        }}
        onError={setError}
      />
      {dirty && baseline !== current && (
        <Notice tone="warning">
          Budsjettet er endret på en annen enhet. Din verdi vises fortsatt.
        </Notice>
      )}
      {!!error && <Notice tone="error">{error}</Notice>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Lagre"
            disabled={!online || !dirty || !!error || !value}
            busy={busy}
            onPress={() => void save(value)}
          />
        </View>
        {current !== null && (
          <View style={{ flex: 1 }}>
            <Button
              title="Fjern budsjett"
              variant="secondary"
              disabled={!online || busy}
              onPress={() => void save(null)}
            />
          </View>
        )}
      </View>
      {saved && current !== null && (
        <Copy size={13} muted>
          {formatMoney(current)} per måned
        </Copy>
      )}
    </View>
  );
}
