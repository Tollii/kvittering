import { releaseMutation } from "@/lib/releases/requests";
import { useState } from "react";
import { View } from "react-native";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Copy, Notice, Panel } from "@/components/ui";
import { MoneyField } from "@/components/money-field";
import { useHousehold } from "./session";
import { formatMoney } from "@/lib/domain/receipt";

/** A single monthly number. Forbruk shows pace against it; Sunday's push reports it. */
export function BudgetSettings() {
  const client = useConvex();
  const { details, online } = useHousehold();
  const current = details?.household.monthlyBudgetOre ?? null;
  const [value, setValue] = useState<number | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = value !== current;
  async function save(next: number | null) {
    setBusy(true);
    setError(null);
    try {
      await releaseMutation(client, api.households.setBudget, {
        monthlyBudgetOre: next,
      });
      setValue(next);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel>
      <MoneyField
        key={current ?? "none"}
        label="Månedsbudsjett (kr)"
        value={current}
        onChange={(next) => {
          setValue(next);
          setSaved(false);
        }}
        onError={setError}
      />
      {!!error && <Notice error>{error}</Notice>}
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
              secondary
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
    </Panel>
  );
}
