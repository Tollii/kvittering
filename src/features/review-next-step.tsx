import { Alert } from "react-native";
import { randomUUID } from "expo-crypto";
import type { SymbolViewProps } from "expo-symbols";
import { Notice } from "@/components/ui";
import { Ore } from "@/lib/domain/ore";
import type { ReceiptData } from "@/lib/domain/receipt";
import {
  balanceWithAdjustment,
  reviewTaskLabel,
  type ReviewTask,
} from "@/lib/domain/receipt-review";

type DifferenceTask = Extract<ReviewTask, { kind: "difference" }>;

/** The draft and the editor actions a step can jump to. */
type StepContext = Readonly<{
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
  /** One imperative sentence that says how to settle the question. */
  hint: string;
  icon: SymbolViewProps["name"];
  onPress: () => void;
}>;

/** The ways a person can settle a difference, most common first. */
function differenceFixes(
  task: DifferenceTask,
  { data, onChange, onShowLines }: StepContext,
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

function differenceAlert(task: DifferenceTask, context: StepContext) {
  const paid = Ore.format(context.data?.totalOre ?? null);

  const printed = task.printedAs
    ? ` Kvitteringen har også linjen «${task.printedAs}».`
    : "";

  Alert.alert(
    `Avvik ${Ore.format(task.amountOre)}`,
    `Varelinjene gir ${Ore.format(task.calculatedOre)}, men betalt beløp er ${paid}.${printed} Har en vare feil pris, retter du linjesummen på varen.`,
    [...differenceFixes(task, context), { text: "Avbryt", style: "cancel" }],
  );
}

/** The reader's notes that the person can dismiss, as opposed to computed checks. */
function removableIssues(
  task: Extract<ReviewTask, { kind: "receipt-issues" }>,
  data: ReceiptData | null,
): string[] {
  return task.issues.filter((issue) => data?.issues.includes(issue));
}

function issuesAlert(
  task: Extract<ReviewTask, { kind: "receipt-issues" }>,
  { data, onChange }: StepContext,
) {
  const removable = removableIssues(task, data);

  if (!data || !removable.length) return;

  Alert.alert("Merknader fra lesingen", task.issues.join("\n"), [
    { text: "Behold", style: "cancel" },
    {
      text: removable.length > 1 ? "Fjern merknadene" : "Fjern merknaden",
      onPress: () =>
        onChange({
          ...data,
          issues: data.issues.filter((issue) => !removable.includes(issue)),
        }),
    },
  ]);
}

function reviewStep(task: ReviewTask, context: StepContext): Step {
  const { data, onResolveDuplicate, onEditFields, onShowLines, onAddLine } =
    context;

  const label = reviewTaskLabel(task);
  const toLines = () => onShowLines("review");

  switch (task.kind) {
    case "duplicate":
      return {
        label,
        hint: "Avgjør om dette er et eget kjøp.",
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
        label,
        hint: "Skriv inn hvilken butikk kvitteringen er fra.",
        icon: "storefront",
        onPress: onEditFields,
      };
    case "total":
      return {
        label,
        hint: "Skriv inn beløpet som ble betalt.",
        icon: "banknote",
        onPress: onEditFields,
      };
    case "date":
      return {
        label,
        hint: "Velg kjøpsdatoen.",
        icon: "calendar",
        onPress: onEditFields,
      };
    case "currency":
      return {
        label: `Valuta: ${data?.currency ?? "ukjent"}`,
        hint: "Kontroller valutaen, kvitteringen er ikke i kroner.",
        icon: "coloncurrencysign.circle",
        onPress: onEditFields,
      };
    case "no-lines":
      return {
        label,
        hint: "Legg til varene fra kvitteringen.",
        icon: "plus",
        onPress: onAddLine,
      };
    case "difference":
      return {
        label: `Avvik ${Ore.format(task.amountOre)}`,
        hint: "Rett en vare eller betalt beløp.",
        icon: "equal.circle",
        onPress: () => differenceAlert(task, context),
      };
    case "receipt-issues":
      // A computed check, such as a positive discount, is settled on its line.
      return removableIssues(task, data).length
        ? {
            label,
            hint: "Se over merknadene fra lesingen.",
            icon: "exclamationmark.bubble",
            onPress: () => issuesAlert(task, context),
          }
        : {
            label,
            hint: `Rett linjen det gjelder: ${task.issues.join(" ")}`,
            icon: "exclamationmark.bubble",
            onPress: () => onShowLines("all"),
          };
    case "amounts":
      return {
        label,
        hint: "Fyll inn beløpet på varene som mangler det.",
        icon: "numbers",
        onPress: toLines,
      };
    case "names":
      return {
        label,
        hint: "Gi varene uten navn et navn.",
        icon: "textformat",
        onPress: toLines,
      };
    case "line-issues":
      return {
        label,
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
  ...context
}: Readonly<{ tasks: ReviewTask[] }> & StepContext) {
  const [first, ...rest] = tasks;

  if (!first) return null;
  const step = reviewStep(first, context);
  const later = rest.map(reviewTaskLabel);
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
