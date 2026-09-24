import { z } from "zod";

/** Convex's JSON form of a validator, as `exportArgs()` and `exportReturns()` produce it. */
export type ValidatorJson =
  | { type: "null" | "number" | "bigint" | "boolean" | "string" | "bytes" }
  | { type: "any" }
  | { type: "literal"; value: LiteralJson }
  | { type: "id"; tableName: string }
  | { type: "array"; value: ValidatorJson }
  | { type: "record"; keys: ValidatorJson; values: FieldJson }
  | { type: "object"; value: Partial<Record<string, FieldJson>> }
  | { type: "union"; value: ValidatorJson[] };

type LiteralJson = string | number | boolean | { $integer: string };

type FieldJson = { fieldType: ValidatorJson; optional: boolean };

const literalJson = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ $integer: z.string() }),
]);

const fieldJson: z.ZodType<FieldJson> = z.lazy(() =>
  z.object({ fieldType: validatorJson, optional: z.boolean() }),
);

const validatorJson: z.ZodType<ValidatorJson> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.enum(["null", "number", "bigint", "boolean", "string", "bytes"]),
    }),
    z.object({ type: z.literal("any") }),
    z.object({ type: z.literal("literal"), value: literalJson }),
    z.object({ type: z.literal("id"), tableName: z.string() }),
    z.object({ type: z.literal("array"), value: validatorJson }),
    z.object({
      type: z.literal("record"),
      keys: validatorJson,
      values: fieldJson,
    }),
    z.object({
      type: z.literal("object"),
      value: z.record(z.string(), fieldJson),
    }),
    z.object({ type: z.literal("union"), value: z.array(validatorJson) }),
  ]),
);

const functionContract = z.object({
  kind: z.enum(["query", "mutation", "action"]),
  visibility: z.enum(["public", "internal"]),
  args: validatorJson.nullable(),
  returns: validatorJson.nullable(),
});

export type FunctionContract = z.infer<typeof functionContract>;

/**
 * The backend surface that outlives a deployment: public functions called by
 * installed apps, internal functions whose arguments are persisted by the
 * scheduler and workflows, and HTTP routes.
 */
export const contractSchema = z.object({
  functions: z.record(z.string(), functionContract),
  httpRoutes: z.array(z.string()),
});

export type Contract = z.infer<typeof contractSchema>;

export type ContractChange = {
  subject: string;
  breaking: boolean;
  detail: string;
};

/** Parse a Convex validator export; functions without a validator export `null`. */
export function parseValidatorJson(json: string): ValidatorJson | null {
  return validatorJson.nullable().parse(JSON.parse(json));
}

/**
 * Objects checked by a server validator reject unknown fields ("exact").
 * An installed client reading a result ignores fields it does not know ("open").
 */
type ObjectMode = "exact" | "open";

/** Describe the values that `narrow` allows and `wide` rejects. Empty means compatible. */
export function incompatibilities(
  wide: ValidatorJson,
  narrow: ValidatorJson,
  mode: ObjectMode,
  path = "value",
): string[] {
  if (wide.type === "any") return [];

  if (narrow.type === "union")
    return narrow.value.flatMap((member) =>
      incompatibilities(wide, member, mode, path),
    );

  if (wide.type === "union") {
    const fits = wide.value.some(
      (member) => incompatibilities(member, narrow, mode, path).length === 0,
    );

    return fits ? [] : [`${path}: ${describe(narrow)} is no longer accepted`];
  }

  switch (narrow.type) {
    case "literal":
      return literalFits(wide, narrow.value)
        ? []
        : [`${path}: ${describe(narrow)} is no longer accepted`];
    case "id":
      return (wide.type === "id" && wide.tableName === narrow.tableName) ||
        wide.type === "string"
        ? []
        : [`${path}: ${describe(narrow)} became ${describe(wide)}`];
    case "array":
      return wide.type === "array"
        ? incompatibilities(wide.value, narrow.value, mode, `${path}[]`)
        : [`${path}: array became ${describe(wide)}`];
    case "record":
      return wide.type === "record"
        ? [
            ...incompatibilities(wide.keys, narrow.keys, mode, `${path}{key}`),
            ...incompatibilities(
              wide.values.fieldType,
              narrow.values.fieldType,
              mode,
              `${path}{value}`,
            ),
          ]
        : [`${path}: record became ${describe(wide)}`];
    case "object":
      return wide.type === "object"
        ? objectIncompatibilities(wide.value, narrow.value, mode, path)
        : [`${path}: object became ${describe(wide)}`];
    default:
      return wide.type === narrow.type
        ? []
        : [`${path}: ${describe(narrow)} became ${describe(wide)}`];
  }
}

function objectIncompatibilities(
  wide: Partial<Record<string, FieldJson>>,
  narrow: Partial<Record<string, FieldJson>>,
  mode: ObjectMode,
  path: string,
): string[] {
  const problems: string[] = [];

  for (const [name, wideField] of fields(wide)) {
    const narrowField = narrow[name];
    const fieldPath = `${path}.${name}`;

    if (!narrowField) {
      if (!wideField.optional) problems.push(`${fieldPath}: became required`);
      continue;
    }

    if (narrowField.optional && !wideField.optional)
      problems.push(`${fieldPath}: became required`);

    problems.push(
      ...incompatibilities(
        wideField.fieldType,
        narrowField.fieldType,
        mode,
        fieldPath,
      ),
    );
  }

  if (mode === "exact")
    for (const [name] of fields(narrow))
      if (!wide[name])
        problems.push(`${path}.${name}: is no longer accepted (removed)`);

  return problems;
}

function fields(
  object: Partial<Record<string, FieldJson>>,
): [string, FieldJson][] {
  return Object.entries(object).flatMap(([name, field]) =>
    field ? [[name, field]] : [],
  );
}

function literalFits(wide: ValidatorJson, value: LiteralJson): boolean {
  if (wide.type === "literal")
    return JSON.stringify(wide.value) === JSON.stringify(value);

  switch (wide.type) {
    case "string":
      return z.string().safeParse(value).success;
    case "number":
      return z.number().safeParse(value).success;
    case "boolean":
      return z.boolean().safeParse(value).success;
    case "bigint":
      return z.object({ $integer: z.string() }).safeParse(value).success;
    default:
      return false;
  }
}

function describe(validator: ValidatorJson): string {
  switch (validator.type) {
    case "literal":
      return JSON.stringify(validator.value);
    case "id":
      return `id<${validator.tableName}>`;
    default:
      return validator.type;
  }
}

/**
 * Compare the contract of the deployed base with a proposed head. A change is
 * breaking when an installed client, or work queued before the deployment,
 * could send or receive a value the other side no longer handles.
 */
export function compareContracts(
  base: Contract,
  head: Contract,
): ContractChange[] {
  const changes: ContractChange[] = [];

  for (const [name, before] of Object.entries(base.functions)) {
    const after = head.functions[name];

    if (!after) {
      changes.push({ subject: name, breaking: true, detail: "removed" });
      continue;
    }

    changes.push(...functionChanges(name, before, after));
  }

  for (const [name, after] of Object.entries(head.functions))
    if (!base.functions[name])
      changes.push({
        subject: name,
        breaking: false,
        detail: `added ${after.visibility} ${after.kind}`,
      });

  const headRoutes = new Set(head.httpRoutes);
  const baseRoutes = new Set(base.httpRoutes);

  for (const route of base.httpRoutes)
    if (!headRoutes.has(route))
      changes.push({ subject: route, breaking: true, detail: "removed" });

  for (const route of head.httpRoutes)
    if (!baseRoutes.has(route))
      changes.push({ subject: route, breaking: false, detail: "added" });

  return changes;
}

function functionChanges(
  name: string,
  before: FunctionContract,
  after: FunctionContract,
): ContractChange[] {
  const changes: ContractChange[] = [];

  if (before.kind !== after.kind)
    changes.push({
      subject: name,
      breaking: true,
      detail: `changed from ${before.kind} to ${after.kind}`,
    });

  if (before.visibility !== after.visibility)
    changes.push({
      subject: name,
      breaking: before.visibility === "public",
      detail: `changed from ${before.visibility} to ${after.visibility}`,
    });

  // Earlier callers sent arguments valid under the old validator.
  const argProblems =
    before.args && after.args
      ? incompatibilities(after.args, before.args, "exact", "args")
      : [];

  changes.push(
    ...argProblems.map((detail) => ({ subject: name, breaking: true, detail })),
  );

  // Only installed clients read public results; the server reads internal ones.
  if (before.visibility === "public" && before.returns) {
    const returnProblems = after.returns
      ? incompatibilities(before.returns, after.returns, "open", "returns")
      : ["returns: validator removed"];

    changes.push(
      ...returnProblems.map((detail) => ({
        subject: name,
        breaking: true,
        detail,
      })),
    );
  }

  const unchanged =
    JSON.stringify(before) === JSON.stringify(after) ||
    changes.some((change) => change.breaking);

  return unchanged
    ? changes
    : [
        ...changes,
        { subject: name, breaking: false, detail: "compatible change" },
      ];
}
