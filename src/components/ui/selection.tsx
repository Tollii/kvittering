import { useState } from "react";
import { Field } from "./controls";
import { Panel, Row } from "./surfaces";
import { Sheet } from "./layout";

export function Select<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value | null;
  options: { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <>
      <Row
        title={label}
        detail={
          options.find((option) => option.value === value)?.label ??
          "Ikke valgt"
        }
        onPress={() => setOpen(true)}
      />
      <Sheet title={label} visible={open} onClose={() => setOpen(false)}>
        {options.length > 12 && (
          <Field label="Søk" value={search} onChangeText={setSearch} />
        )}
        <Panel style={{ gap: 2 }}>
          {options
            .filter((option) =>
              option.label
                .toLocaleLowerCase("nb-NO")
                .includes(search.toLocaleLowerCase("nb-NO")),
            )
            .map((option) => (
              <Row
                key={option.value}
                title={option.label}
                selected={option.value === value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
              />
            ))}
        </Panel>
      </Sheet>
    </>
  );
}
