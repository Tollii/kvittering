import { useState } from "react";
import type { TextInputProps } from "react-native";
import { moneyInput, parseOre } from "@/lib/domain/receipt";
import { Field } from "./ui";

export function MoneyField({
  label,
  value,
  onChange,
  onError,
  ...props
}: Omit<TextInputProps, "value" | "onChange" | "onChangeText"> & {
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
      placeholder="0,00"
      {...props}
      onChangeText={(next) => {
        setText(next);

        const amount = parseOre(next);

        if (amount.kind === "invalid") {
          onError(amount.message);

          return;
        }

        onError(null);
        onChange(amount.ore);
      }}
    />
  );
}
