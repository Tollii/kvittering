import { readFileSync } from "node:fs";
import { z } from "zod";

const fixtureName = z.string().regex(/^[a-z][a-z0-9-]*$/);

const tablesSchema = z.record(
  z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  z.array(z.record(z.string(), z.unknown())),
);

const fixtureSchema = z.strictObject({
  includes: z.array(fixtureName).default([]),
  account: z
    .strictObject({
      name: z.string().min(1),
      email: z.email(),
      password: z.string().min(12),
    })
    .optional(),
  tables: tablesSchema,
});

/** Combine named fixtures in order. Included table rows are appended. */
export function loadFixture(name: string, ancestors: string[] = []) {
  fixtureName.parse(name);

  if (ancestors.includes(name))
    throw new Error(
      `Fixture include cycle: ${[...ancestors, name].join(" -> ")}`,
    );

  const fixture = fixtureSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(`./fixtures/${name}/fixture.json`, import.meta.url),
        "utf8",
      ),
    ),
  );

  const tables: z.infer<typeof tablesSchema> = {};
  let account = fixture.account;

  for (const included of fixture.includes) {
    const parent = loadFixture(included, [...ancestors, name]);

    if (account && parent.account)
      throw new Error(`Fixture ${name} defines more than one account.`);
    account ??= parent.account;
    appendTables(tables, parent.tables);
  }

  appendTables(tables, fixture.tables);

  return { account, tables };
}

function appendTables(
  target: z.infer<typeof tablesSchema>,
  source: z.infer<typeof tablesSchema>,
) {
  for (const [table, rows] of Object.entries(source)) {
    target[table] = [...(target[table] ?? []), ...rows];
  }
}

type Tables = z.infer<typeof tablesSchema>;

type Row = Tables[string][number];

const receiptReference = z.string().regex(/^\$\{RECEIPT:[a-z][a-z0-9-]*\}$/);

/**
 * Replace complete placeholder values; never interpolate fixture text as code.
 * A `${RECEIPT:<clientId>}` value stays for `resolveReceiptReferences`, because
 * the deployment assigns receipt ids on import.
 */
export function resolveTables(
  tables: Tables,
  identity: { userId: string; householdId: string; issuer: string },
) {
  const references = new Map([
    ["USER_ID", identity.userId],
    ["USER_IDENTITY", `${identity.issuer}|${identity.userId}`],
    ["HOUSEHOLD_ID", identity.householdId],
  ]);

  const json = JSON.stringify(tables).replace(
    /"\$\{([A-Z_]+)\}"/g,
    (_match, key: string) => {
      const value = references.get(key);

      if (!value) throw new Error(`Unknown fixture reference: ${key}`);

      return JSON.stringify(value);
    },
  );

  return tablesSchema.parse(JSON.parse(json));
}

/** Whether a row still refers to another receipt by its fixture client id. */
export function hasReceiptReference(row: Row): boolean {
  return Object.values(row).some(
    (value) => receiptReference.safeParse(value).success,
  );
}

/** The row without its receipt references, for the import that assigns the ids. */
export function withoutReceiptReferences(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([, value]) => !receiptReference.safeParse(value).success,
    ),
  );
}

/** Replace `${RECEIPT:<clientId>}` values with the ids the deployment assigned. */
export function resolveReceiptReferences(
  tables: Tables,
  ids: ReadonlyMap<string, string>,
) {
  const json = JSON.stringify(tables).replace(
    /"\$\{RECEIPT:([a-z][a-z0-9-]*)\}"/g,
    (_match, clientId: string) => {
      const id = ids.get(clientId);

      if (!id) throw new Error(`Unknown fixture receipt: ${clientId}`);

      return JSON.stringify(id);
    },
  );

  return tablesSchema.parse(JSON.parse(json));
}

/** Receipt ids by fixture client id, from the documents a deployment holds. */
export function receiptIds(
  rows: readonly { _id: string; clientId: string }[],
): Map<string, string> {
  const ids = new Map<string, string>();

  for (const row of rows) {
    if (ids.has(row.clientId))
      throw new Error(`Fixture receipts share the client id ${row.clientId}.`);
    ids.set(row.clientId, row._id);
  }

  return ids;
}
