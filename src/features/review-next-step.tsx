import { Alert } from "react-native";
import { randomUUID } from "expo-crypto";
import type { SymbolViewProps } from "expo-symbols";
import { Notice } from "@/components/ui";
import { Ore } from "@/lib/domain/ore";
import type { ReceiptData } from "@/lib/domain/receipt";
import {
  balanceWithAdjustment,
  type ReviewTask,
} from "@/lib/domain/receipt-review";

type DifferenceTask = Extract<ReviewTask, { kind: "difference" }>;

type Handlers = Readonly<{
  data: ReceiptData | null;
  onResolveDuplicate: () => void;
  onEditFields: () => void;
  onShowLines: (lines: "review" | "all") => void;
  onAddLine: () => void;
  onChange: (data: ReceiptData) => void;
}>;

/** What one task asks of the person, and the one action that answers it. */
type Step = Readonly<{
  label: string;
  hint: string;
  icon: SymbolViewProps["name"];
  onPress: () => void;
}>;

/** The ways a person can settle a difference, most common first. */
function differenceFixes(
  task: DifferenceTask,
  { data, onChange, onShowLines }: Handlers,
) {
  return [
    { text: "Rett en vare", onPress: () => onShowLines("all") },
    {
      text: `Betalt var ${Ore.format(task.calculatedOre)}`,
      onPress: () => {
        if (data) onChange({ ...data, totalOre: task.calculatedOre });
      },
    },
    {
      text: "Legg inn justering",
      onPress: () => {
        if (data) onChange(balanceWithAdjustment(data, randomUUID()));
        onShowLines("all");
      },
    },
  ];
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function reviewStep(task: ReviewTask, handlers: Handlers): Step {
  const { data, onResolveDuplicate, onEditFields, onShowLines, onAddLine } =
    handlers;

  const toLines = () => onShowLines("review");

  switch (task.kind) {
    case "duplicate":
      return {
        label: "Mulig duplikat",
        hint: "Samme bilde eller kjøp finnes fra før. Avgjør om dette er et eget kjøp.",
        icon: "doc.on.doc",
        onPress: () =>
          Alert.alert(
            "Mulig duplikat",
            "Samme bilde eller kjøp finnes fra før.",
            [
              { text: "Avbryt", style: "cancel" },
              { text: "Dette er et eget kjøp", onPress: onResolveDuplicate },
            ],
          ),
      };
    case "store":
      return {
        label: "Butikk mangler",
        hint: "Skriv inn hvilken butikk kvitteringen er fra.",
        icon: "storefront",
        onPress: onEditFields,
      };
    case "total":
      return {
        label: "Betalt beløp mangler",
        hint: "Skriv inn beløpet som ble betalt.",
        icon: "banknote",
        onPress: onEditFields,
      };
    case "date":
      return {
        label: "Dato mangler",
        hint: "Velg kjøpsdatoen.",
        icon: "calendar",
        onPress: onEditFields,
      };
    case "currency":
      return {
        label: `Valuta: ${data?.currency ?? "ukjent"}`,
        hint: "Kvitteringen er ikke i kroner. Kontroller valutaen.",
        icon: "coloncurrencysign.circle",
        onPress: onEditFields,
      };
    case "no-lines":
      return {
        label: "Ingen varer lest",
        hint: "Legg til varene fra kvitteringen.",
        icon: "plus",
        onPress: onAddLine,
      };
    case "difference": {
      const printed = task.printedAs
        ? ` Kvitteringen har også linjen «${task.printedAs}».`
        : "";

      return {
        label: `Avvik ${Ore.format(task.amountOre)}`,
        hint: `Varelinjene gir ${Ore.format(task.calculatedOre)}, men betalt beløp er ${Ore.format(data?.totalOre ?? null)}.`,
        icon: "equal.circle",
        onPress: () =>
          Alert.alert(
            `Avvik ${Ore.format(task.amountOre)}`,
            `Varelinjene gir ${Ore.format(task.calculatedOre)}, men betalt beløp er ${Ore.format(data?.totalOre ?? null)}.${printed} Har en vare feil pris, retter du linjesummen på varen.`,
            [
              ...differenceFixes(task, handlers),
              { text: "Avbryt", style: "cancel" },
            ],
          ),
      };
    }

    case "receipt-issues": {
      // Only the reader's own notes can be removed; computed checks stay until fixed.
      const removable = task.issues.filter((issue) =>
        data?.issues.includes(issue),
      );

      return {
        label: plural(task.issues.length, "merknad", "merknader"),
        hint: task.issues.join(" "),
        icon: "exclamationmark.bubble",
        onPress: () =>
          Alert.alert(
            "Merknader fra lesingen",
            task.issues.join("\n"),
            data && removable.length
              ? [
                  { text: "Behold", style: "cancel" },
                  {
                    text:
                      removable.length > 1
                        ? "Fjern merknadene"
                        : "Fjern merknaden",
                    onPress: () =>
                      handlers.onChange({
                        ...data,
                        issues: data.issues.filter(
                          (issue) => !removable.includes(issue),
                        ),
                      }),
                  },
                ]
              : [{ text: "OK" }],
          ),
      };
    }

    case "amounts":
      return {
        label: `${task.count} beløp mangler`,
        hint: "Fyll inn beløpet på varene som mangler det.",
        icon: "numbers",
        onPress: toLines,
      };
    case "names":
      return {
        label: `${task.count} navn mangler`,
        hint: "Gi varene uten navn et navn.",
        icon: "textformat",
        onPress: toLines,
      };
    case "line-issues":
      return {
        label: plural(task.count, "vare å sjekke", "varer å sjekke"),
        hint: "Se over varene som lesingen var usikker på.",
        icon: "exclamationmark.circle",
        onPress: toLines,
      };
  }
}

/**
 * The one thing to do next before the receipt can be approved, with the tasks
 * that follow it named underneath. Tapping it jumps straight to the fix.
 */
export function ReviewNextStep({
  tasks,
  ...handlers
}: Readonly<{ tasks: ReviewTask[] }> & Handlers) {
  const [first, ...rest] = tasks;

  if (!first) return null;
  const step = reviewStep(first, handlers);

  const later = rest.map((task) => reviewStep(task, handlers).label);
  const more = later.length > 2 ? ` · +${later.length - 2}` : "";

  const message =
    later.length === 0
      ? step.hint
      : `${step.hint} Deretter: ${later.slice(0, 2).join(" · ")}${more}.`;

  return (
    <Notice
      tone="warning"
      icon={step.icon}
      title={step.label}
      onPress={step.onPress}
    >
      {message}
    </Notice>
  );
}
