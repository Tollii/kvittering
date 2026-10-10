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

type Tables = z.infer<typeof tablesSchema>;

type Row = Tables[string][number];

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

  const tables: Tables = {};
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

function appendTables(target: Tables, source: Tables) {
  for (const [table, rows] of Object.entries(source)) {
    target[table] = [...(target[table] ?? []), ...rows];
  }
}

/**
 * Replace complete placeholder values; never interpolate fixture text as code.
 * A `${RECEIPT:<clientId>}` value is left for `importFixtureTables`, because
 * the deployment assigns receipt ids: its colon keeps it outside `[A-Z_]+`.
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

/** A whole value that names a receipt by its fixture client id. */
const receiptReference = z.string().regex(/^\$\{RECEIPT:([^}]*)\}$/);

const receiptRow = z.object({ clientId: z.string() });

/** The row without its receipt references, for the import that assigns the ids. */
export function withoutReceiptReferences(row: Row): Row {
  const kept = Object.fromEntries(
    Object.entries(row).filter(
      ([, value]) => !receiptReference.safeParse(value).success,
    ),
  );

  // A reference below the top level would survive the first import.
  if (JSON.stringify(kept).includes('"${RECEIPT:'))
    throw new Error(
      "Fixture receipts may refer to a receipt only at the top level.",
    );

  return kept;
}

/** Replace `${RECEIPT:<clientId>}` values with the ids the deployment assigned. */
export function resolveReceiptReferences(
  tables: Tables,
  ids: ReadonlyMap<string, string>,
) {
  const json = JSON.stringify(tables).replace(
    /"\$\{RECEIPT:([^}]*)\}"/g,
    (_match, clientId: string) => {
      const id = ids.get(clientId);

      if (!id) throw new Error(`Unknown fixture receipt: ${clientId}`);

      return JSON.stringify(id);
    },
  );

  return tablesSchema.parse(JSON.parse(json));
}

/** Receipt ids by fixture client id, from the documents a deployment holds. */
function receiptIds(
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

/** How one deployment takes fixture rows: the Convex CLI or a test database. */
export type FixtureImporter = {
  /** Replace the table with these rows. A row with `_id` keeps that id. */
  importTable(table: string, rows: Row[]): Promise<void> | void;
  /** The receipts the deployment holds after an import. */
  readReceipts(): Promise<{ _id: string; clientId: string }[]>;
};

/**
 * Import every table but `households`, which the caller imported to learn the
 * household id. Receipts go first without their references, so the deployment
 * assigns their ids; then the referencing receipts go again under those ids,
 * and the other tables follow with their references resolved.
 */
export async function importFixtureTables(
  tables: Tables,
  importer: FixtureImporter,
): Promise<Map<string, string>> {
  const receipts = tables.receipts ?? [];

  await importer.importTable(
    "receipts",
    receipts.map(withoutReceiptReferences),
  );

  const stored = await importer.readReceipts();

  if (stored.length !== receipts.length)
    throw new Error(
      `Expected ${receipts.length} fixture receipts, found ${stored.length}.`,
    );

  const ids = receiptIds(stored);
  const resolved = resolveReceiptReferences(tables, ids);

  const referencing = receipts.some((row) =>
    Object.values(row).some(
      (value) => receiptReference.safeParse(value).success,
    ),
  );

  if (referencing)
    await importer.importTable(
      "receipts",
      (resolved.receipts ?? []).map((row) => ({
        _id: ids.get(receiptRow.parse(row).clientId),
        ...row,
      })),
    );

  for (const [table, rows] of Object.entries(resolved)) {
    if (table !== "households" && table !== "receipts")
      await importer.importTable(table, rows);
  }

  return ids;
}
