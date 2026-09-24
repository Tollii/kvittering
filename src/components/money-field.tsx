import { Ore } from "@/lib/domain/ore";
import { useState } from "react";
import type { TextInputProps } from "react-native";
import { Field } from "./ui";

export function MoneyField({
  label,
  value,
  onChange,
  onError,
  ...props
}: Omit<TextInputProps, "value" | "onChange" | "onChangeText"> & {
  label: string;
  value: Ore | null;
  onChange: (value: Ore | null) => void;
  onError: (error: string | null) => void;
}) {
  const [text, setText] = useState(() => Ore.formatInput(value));

  return (
    <Field
      label={label}
      value={text}
      keyboardType="numbers-and-punctuation"
      placeholder="0,00"
      {...props}
      onChangeText={(next) => {
        setText(next);

        const amount = Ore.parse(next);

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
