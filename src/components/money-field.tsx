import { useState } from "react";
import { moneyInput, parseOre } from "@/lib/domain/receipt";
import { Field } from "./ui";
export function MoneyField({
  label,
  value,
  onChange,
  onError,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onError: (error: string | null) => void;
}) {
  const [text, setText] = useState(() => moneyInput(value));
  return (
    <Field
      label={label}
      value={text}
      keyboardType="numbers-and-punctuation"
      onChangeText={(next) => {
        setText(next);
        try {
          const amount = parseOre(next);
          onError(null);
          onChange(amount);
        } catch (cause) {
          onError(cause instanceof Error ? cause.message : "Ugyldig beløp.");
        }
      }}
    />
  );
}
