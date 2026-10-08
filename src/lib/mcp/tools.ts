import { z } from "zod";
import { CalendarDate } from "../domain/calendar";

export type JsonValue = z.infer<ReturnType<typeof z.json>>;

/** Long enough for a year-over-year question, small enough for one bounded read. */
export const maxSummaryDays = 732;

const date = z
  .string()
  .describe("Purchase date as YYYY-MM-DD.")
  .transform((text, ctx) => {
    const parsed = CalendarDate.parse(text);

    if (parsed) return parsed;
    ctx.addIssue({ code: "custom", message: `${text} is not a date.` });

    return z.NEVER;
  });

const cursor = z
  .string()
  .optional()
  .describe(
    "nextCursor from the previous page, with the same other arguments. Omit for the first page.",
  );

const listReceipts = z.object({
  from: date.optional(),
  to: date.optional(),
  store: z
    .string()
    .max(100)
    .optional()
    .describe("Only receipts whose store name contains this text."),
  cursor,
});

const getReceipt = z.object({
  receiptId: z.string().describe("A receipt id from list_receipts."),
});

const spendingSummary = z
  .object({ from: date, to: date })
  .refine(
    ({ from, to }) =>
      CalendarDate.compare(from, to) <= 0 &&
      CalendarDate.compare(CalendarDate.shift(from, maxSummaryDays - 1), to) >=
        0,
    `from must not be after to, and the period can cover at most ${maxSummaryDays} days.`,
  );

const findPurchases = z.object({
  text: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .describe("Text to find in item names, as printed or as corrected."),
  from: date,
  to: date,
  cursor,
});

const purchaseRules =
  "Amounts are Norwegian kroner (NOK) after discounts. These are household purchases, not consumption: buying something does not mean anyone ate or used it. Quantities and package sizes are only present when the receipt showed them; never assume a missing quantity.";

export const mcpTools = {
  list_receipts: {
    description: `List the household's receipts, newest purchase first, with store, date, total and status. Each page reads up to 100 receipts and can hold fewer, or none when filtering by store, while hasMore is true; pass nextCursor to continue until hasMore is false. Receipts in "needs_review" may still have reading errors. ${purchaseRules}`,
    arguments: listReceipts,
  },
  get_receipt: {
    description: `Read one receipt's lines: item names as printed, amounts, category, and quantity or package size when printed. Discount, deposit and return lines are listed separately from products. ${purchaseRules}`,
    arguments: getReceipt,
  },
  spending_summary: {
    description: `Total purchases and spending by category for a period of up to ${maxSummaryDays} days, using the same rules as the app's reports. Receipts still being read and receipts the household excluded are left out. "included" counts receipts that are in the totals but uncertain: not yet reviewed, suspected duplicates (in purchasesNok but not in byCategory), or without a printed total (missing from paidNok). "notIncluded" counts what the totals miss: receipts in another currency and lines whose amount could not be read. ${purchaseRules}`,
    arguments: spendingSummary,
  },
  find_purchases: {
    description: `Find lines whose item name contains some text within a period, newest purchase first, for questions like "when did we last buy coffee". Each page reads up to 100 receipts and can be empty while hasMore is true; continue with nextCursor until hasMore is false before concluding something was not bought. ${purchaseRules}`,
    arguments: findPurchases,
  },
} as const;

export type McpToolName = keyof typeof mcpTools;

export type McpToolArguments = {
  [Name in McpToolName]: z.output<(typeof mcpTools)[Name]["arguments"]>;
};

export type ParsedToolCall = {
  [Name in McpToolName]: { name: Name; arguments: McpToolArguments[Name] };
}[McpToolName];

function isMcpToolName(name: string): name is McpToolName {
  return Object.hasOwn(mcpTools, name);
}

/** The tools/list payload; input schemas describe what callers send. */
export function toolList() {
  return Object.entries(mcpTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.arguments, { io: "input" }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }));
}

export type ToolCallParse =
  | { kind: "parsed"; call: ParsedToolCall }
  | { kind: "unknown" }
  | { kind: "invalid"; message: string };

export function parseToolCall(
  name: string,
  input: Record<string, JsonValue>,
): ToolCallParse {
  if (!isMcpToolName(name)) return { kind: "unknown" };
  const parsed = mcpTools[name].arguments.safeParse(input);

  if (!parsed.success)
    return { kind: "invalid", message: z.prettifyError(parsed.error) };

  // SAFETY: The arguments were parsed by the schema registered for this name.
  return {
    kind: "parsed",
    call: { name, arguments: parsed.data } as ParsedToolCall,
  };
}
